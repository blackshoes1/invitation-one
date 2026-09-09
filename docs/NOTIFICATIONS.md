# 관리자 알림 운영 — 아웃박스 재시도 설계 (P1-4)

> **발송 채널 (2026-09-06)**: 기본은 **텔레그램 봇**이다. `TELEGRAM_BOT_TOKEN` +
> `TELEGRAM_CHAT_ID` 가 있으면 텔레그램, 없고 `KAKAO_*` 가 있으면 카카오 —
> `src/lib/notifyChannel.ts` 가 환경변수만 보고 고른다. 두 채널로 동시에 보내지는
> 않는다(한쪽이 죽어도 다른 쪽이 성공하면 고장이 가려지므로).
> 카카오에서 옮긴 이유는 refresh token 이 약 2개월마다 만료돼 예식 전 재발급이
> 필요했기 때문이다. 봇 토큰은 만료되지 않는다.
>
> **채널을 바꿀 때 반드시 함께 볼 것** — `drainNotifications()` 는 채널이 미설정이면
> **클레임조차 하지 않는다.** 환경변수만 지우고 넘어가면 알림이 outbox 에 쌓이기만
> 하고 조용히 멈춘다. 안전망 워크플로가 `ready=false` 를 장애로 잡는 이유다.

## 구조

```
participants INSERT
  → DB 트리거가 notification_outbox 에 적재 (pending)
  → 드레인: claim_notifications() 원자 클레임(FOR UPDATE SKIP LOCKED)
  → 성공 sent / 실패 failed + 지수 백오프(next_attempt_at, 2·4·8…60분, 최대 8회)
```

드레인은 어디서 몇 번 호출돼도 안전하다 — 원자 클레임(FOR UPDATE SKIP LOCKED)이
같은 행을 두 worker 에게 동시에 주지 않는다.

## 배달 보장 — at-least-once (exactly-once 아님)

**중복이 완전히 없다고 말할 수 없다.** 텔레그램 `sendMessage` 도 카카오 memo 도
멱등 키를 받지 않는다. 지원하지 않는 API 에 임의의 키를 보내고 "정확히 한 번"을
주장할 수는 없다. 남는 구간은 이것뿐이다:

```
발송 성공 → (여기서 DB 기록 실패 또는 프로세스 종료) → 행이 'sending' 으로 남음
         → 3분 뒤 스테일 회수 → 같은 알림이 한 번 더 간다
```

좁히는 장치는 셋이다.

1. **발송 timeout 15초** (`telegram.ts` · `kakao.ts`). 없으면 느린 발송 하나가
   클레임 lease(3분)를 넘겨 다른 worker 에게 회수되고, 두 worker 가 같은 행을 들고
   각자 보낸다. 드레인도 한 회차에 100초를 넘기면 남은 행을 손대지 않고 `pending`
   으로 되돌린다(`deferred`) — 시도하지 않았으므로 `attempts` 도 되돌린다.
2. **`lock_token` 소유권 검사** (20260907000200). 클레임할 때 발급하고, 상태를
   기록할 때 아직 자기 것인지 확인한다. 회수당한 worker 의 뒤늦은 `failed` 기록이
   새 주인의 `sent` 를 덮어써 **다시 발송되게 만드는** 사고를 막는다.
3. **기록 실패 즉시 재시도 1회.** 그래도 실패하면 응답의 `persistFailed` 로
   드러난다 — 왜 같은 알림이 두 번 왔는지 나중에 알 수 있어야 한다.

**남는 위험:** 1·2·3 이 모두 빗나가면 중복이 남는다. 관리자 알림이라 유실보다
중복이 낫다고 보고 이쪽을 택했다. 하객에게 가는 메시지였다면 반대로 잡아야 한다.

## 조용히 죽는 것을 막는 계약

| 응답 필드 | 뜻 | 안전망 판정 |
|---|---|---|
| `error` | 드레인 자체가 실패 (클레임 오류 등) | HTTP 500 + 워크플로 실패 |
| `ready: false` | 채널 미설정 — 한 건도 못 보낸다 | 워크플로 실패 |
| `channelStatus` | `expired`(카카오 토큰) · `error`(텔레그램이 자격 증명을 거절) | 워크플로 실패 |
| `channelStatus` 없음 | 확인을 건너뛰었거나(카카오 간격 제한) **닿지 못했다**(텔레그램) | 정상 — 단정하지 않는다 |
| `persistFailed` | 발송됐는데 DB 기록 실패 → 중복 발송 가능 | 경고 |
| `stuck` | 재시도 한도(8회)나 7일 창을 넘긴 **미발송** 건 | 워크플로 실패 |
| `deferred` | 시간 예산 초과로 다음 회차에 넘긴 건 | 정보 |

`stuck` 은 **세기만 한다.** 오래된 알림을 뒤늦게 자동 발송하지 않는다 — 예식이
끝나고 몇 달 뒤 뜬금없는 알림이 가는 걸 막는 게 7일 창의 목적이다. 대신 운영자가
`notification_outbox` 를 직접 보고 판단한다.

`claim` 실패를 조용히 "0건 정상"으로 돌려주던 것이 예전 사고의 원인이었다 —
알림이 통째로 멈춰도 안전망이 초록이었다.

### 연결 점검은 "거절"과 "불통"을 구분한다

`telegramStatus()` 는 **한 번 실패했다고 끊겼다고 단정하지 않는다.**

| getMe 결과 | 반환 | 뜻 |
|---|---|---|
| 200 + `ok:true` | `ok` | 정상 |
| 401 · 403 · 404 · `ok:false` | `error` | 텔레그램이 **거절** — 사람이 토큰을 고쳐야 한다 |
| timeout · 네트워크 · 5xx (재시도 후에도) | `null` | **닿지 못했다** — 토큰 문제가 아니다 |

2026-09-09 에 이 구분이 없어 오탐이 났다. 네트워크가 한 번 튄 것만으로 어드민 배너가
"알림 연결이 끊겼어요 — 봇 토큰을 확인해주세요" 를 띄웠는데, 같은 시각 5분 크론은
24시간 내내(72/72) `ok` 였다. 배너는 로그인 시 한 번만 확인하므로 새로고침 전까지
빨간 채로 박혀 있었다.

`null` 로 두면 놓치는 것 아니냐 — 아니다. 진짜 발송이 깨졌다면 보낼 게 생겼을 때
"클레임 n건 중 발송 0건"으로 잡힌다. 유휴 상태의 연결 점검은 **확실할 때만** 경보를
울려야 한다. 양치기 소년이 되면 진짜 경보도 무시된다.

> 카카오 경로(`kakaoTokenStatus`)에는 아직 같은 구분이 없다 — 네트워크 실패도
> `expired` 로 본다. 지금은 텔레그램이 활성 채널이라 배너에 쓰이지 않지만,
> 카카오로 되돌릴 일이 생기면 같이 손봐야 한다.

## 드레인 트리거 (3중)

1. **서버 사이드 (주 경로, P1-4 신설)** — `/api/delivery/heart·create·join·group/accept`
   가 신청 성공 응답 직후 `after()` 로 `drainNotifications(3)` 실행.
   신규 알림 즉시 시도 + **재시도 도래분(next_attempt_at 경과)** 함께 처리.
   → 트래픽이 있는 한 실패 알림은 다음 신청 시점(실질 수 분~수십 분)에 재발송.
2. **클라이언트 fire-and-forget** — 기존 `notifyAdmin()` → `POST /api/notify`
   (rate limit 30/10분). 서버 경로의 보조.
3. **안전망 cron (2중)**
   - GitHub Actions `notify-drain.yml`: **하루 2회** `scripts/notify-drain.sh` 실행.
     ※ 2026-09-08: 이 크론이 Actions 무료 한도를 소진시켜 **CI 잡이 시작조차 못
     하는** 상태를 만들었다(러너 미배정·3초 실패·로그 없음). 3시간(월 ~240분)에서
     하루 2회(월 ~60분)로 낮췄다. 이렇게 낮춰도 되는 이유는 이게 실제 드레인을
     담당하지 않기 때문이다 — 주 경로는 위 1·2 와 아래 pg_cron 이고, 이건
     "그 셋이 다 죽었을 때 시끄럽게 알리는" 감시자라 12시간이면 충분하다.
     판정 로직은 스크립트 한 곳에만 둔다 (나스로 옮길 때 갈라지지 않게).
     더 촘촘히 하려면 나스로 옮기면 된다 — self-hosted 는 Actions 분을 쓰지 않아
     1시간 간격도 공짜다 (docs/NAS_RUNNER.md · 예식 후로 미뤄 둔 상태).
     아래는 스케줄을 낮추기 전의 기록:
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
     **워크플로를 실패시킨다**(채널 미설정 `ready=false`, 연결 끊김 `channelStatus`,
     클레임했는데 발송 0건 포함). 안전망이 안 도는 것은
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
