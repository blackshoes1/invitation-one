# 관리자 알림(카카오 나에게 보내기) 운영 — 아웃박스 재시도 설계 (P1-4)

## 구조

```
participants INSERT
  → DB 트리거가 notification_outbox 에 적재 (pending)
  → 드레인: claim_notifications() 원자 클레임(FOR UPDATE SKIP LOCKED)
  → 성공 sent / 실패 failed + 지수 백오프(next_attempt_at, 2·4·8…60분, 최대 8회)
```

중복 발송 방지(원자 클레임·dedupe)는 DB 가 보장하므로 드레인은 어디서 몇 번
호출돼도 안전하다.

## 드레인 트리거 (3중)

1. **서버 사이드 (주 경로, P1-4 신설)** — `/api/delivery/heart·create·join·group/accept`
   가 신청 성공 응답 직후 `after()` 로 `drainNotifications(3)` 실행.
   신규 알림 즉시 시도 + **재시도 도래분(next_attempt_at 경과)** 함께 처리.
   → 트래픽이 있는 한 실패 알림은 다음 신청 시점(실질 수 분~수십 분)에 재발송.
2. **클라이언트 fire-and-forget** — 기존 `notifyAdmin()` → `POST /api/notify`
   (rate limit 30/10분). 서버 경로의 보조.
3. **안전망 cron (2중)**
   - GitHub Actions `notify-drain.yml`: **3시간 간격**으로 `POST /api/notify` 호출.
     **공유 비밀이 필요 없다** — POST 는 파라미터를 받지 않는 "보낼 게 있으면
     보내라" 신호이고(참여자 지정 불가·PII 없음·rate limit 있음), 하객 브라우저가
     신청 직후 부르는 것과 같은 공개 경로다. 한 번에 5건까지만 꺼내므로 응답의
     `claimed` 가 0이 될 때까지(최대 5회) 반복한다. 예식 후 비활성화 가능.
     ※ 2026-09-05: 30분 간격(월 ~1,440분)이 비공개 레포 Actions 무료 한도
     (월 2,000분)를 거의 소진해 CI job 이 시작조차 못 하는 상태가 되어
     3시간(월 ~240분)으로 낮췄다. 급하면 Actions 탭에서 수동 실행(workflow_dispatch).
     ※ 2026-09-06: 원래 `GET` + `CRON_SECRET` 이었는데 저장소 secret 과 Vercel
     환경변수 값이 어긋나 **401 로 조용히 죽어 있었다.** 워크플로가 401 에
     `exit 0` 이라 매번 초록으로 끝나 아무도 몰랐고, 그 사이 중단된 알림이
     재시도되지 못했다. 비밀을 맞출 필요가 없는 POST 로 바꾸고, 드레인이 안 되면
     **워크플로를 실패시킨다**(카카오 미설정·발송 0건 포함). 안전망이 안 도는 것은
     그 자체로 장애다.
   - Vercel cron(`vercel.json`): 매일 00:00 UTC 1회 (최후 안전망).

## cron 주기에 대해

더 촘촘하게(`*/15`, `*/30`) 올리면 무트래픽 상황의 재시도 지연은 줄지만,
비공개 레포 Actions 분(분 단위 반올림 과금)을 그만큼 먹어 CI 가 막힐 수 있다.
아래는 Vercel 쪽 제약: 
**Vercel Hobby 플랜은 cron 을 하루 1회로 제한**한다 (더 촘촘한 스케줄은 배포
검증에서 거부됨). 그래서 코드에서는 임의로 올리지 않았다.

| 상황 | 조치 |
|---|---|
| Vercel Pro 사용 중 | `vercel.json` 의 schedule 을 `*/15 * * * *` 로 변경하면 끝 |
| Hobby 유지 | 위 1번(요청 기반 드레인)이 실질 재시도를 담당 — 예식 시즌엔 트래픽이 곧 재시도 주기다. 안전망은 일 1회 유지 |
| 외부 스케줄러 | 아무 cron(예: GitHub Actions schedule, cron-job.org)에서 15분마다 `GET https://<도메인>/api/notify` + `Authorization: Bearer $CRON_SECRET` |
| Supabase pg_cron | 아래 스니펫 참고 (DB 안에서 15분마다 HTTP 호출) |

### Supabase pg_cron + pg_net 스니펫 (선택)

SQL Editor 에서 1회 실행 (URL·시크릿은 실제 값으로 — **저장소에 커밋 금지**):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'notify-drain',
  '*/15 * * * *',
  $$ select net.http_get(
       url := 'https://<배포 도메인>/api/notify',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
     ) $$
);
-- 해제: select cron.unschedule('notify-drain');
```

## 필요 환경 변수

| 이름 | 용도 | 필수 |
|---|---|---|
| `CRON_SECRET` | `GET /api/notify` 인증 (cron 전용) | cron 을 쓰려면 필수 (Vercel 에 설정) |

미설정 시 cron GET 은 401 — 요청 기반 드레인(1·2번)은 영향 없음.
