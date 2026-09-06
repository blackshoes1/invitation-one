# 개발 프롬프트 — 주문 알림을 카카오톡에서 텔레그램으로

작성: 2026-09-06 · 예식 2026-10-18

## 목적

주문(직접배달 신청·합석·마음배송)이 들어오면 **카카오톡 "나에게 보내기" 대신
텔레그램 봇 메시지**로 주문 내역을 받는다.

## 왜 바꿀 만한가 (근거 있는 이득)

오늘 하루 알림이 두 번 늦었고, 원인 조사에서 드러난 카카오 쪽 구조적 부담이 이렇다.

| 카카오 | 텔레그램 |
|---|---|
| refresh token 이 **약 2개월마다 만료** — 예식(10/18) 전 10/8쯤 만료 예정 | 봇 토큰은 **만료 없음** |
| 만료 방지를 위해 유휴 상태에서도 주기적으로 토큰을 갱신해야 함 (`kakaoTokenStatusThrottled`) | 불필요 |
| 토큰이 DB(`site_settings`)에 저장·자동 회전 — 환경변수와 DB 중 어느 쪽이 이기는지 헷갈림 | 환경변수 하나 (`TELEGRAM_BOT_TOKEN`) |
| 텍스트 템플릿 **190자 제한** (`sendToMe` 가 `slice(0, 190)`) | 4096자 — 주문 내역을 온전히 담을 수 있다 |
| 발급에 OAuth 인가 코드 → 토큰 교환 절차 | BotFather 에서 토큰 발급, 봇에 말 걸어 chat_id 확인 |

즉 **"토큰 만료로 알림이 멈춘다"는 실패 유형이 통째로 사라지고**, 메시지에 담을 수
있는 정보가 20배로 늘어난다.

---

## 먼저 알아야 할 것 — 알림 파이프라인은 건드리지 말 것

알림은 이미 **아웃박스 패턴**으로 돌아간다. 이 부분은 두 번의 장애를 거쳐 다듬은
것이라 **그대로 두고, 발송 어댑터만 갈아끼운다.**

```
participants INSERT
  → DB 트리거 _enqueue_participant_notification()
      notification_outbox (kind='kakao_admin', dedupe_key='participant:<id>')
  → claim_notifications()  원자 클레임 · 3분 스테일 락 회수 · 지수 백오프 · 7일 창
  → drainNotifications()   buildText() → sendToMe()   ← **여기만 바꾼다**
  → 성공: status='sent' + participants.notified_at
```

드레인을 굴리는 주체(전부 유지):
- 신청 API 4곳의 `after()` (`create` · `join` · `heart` · `group/accept`)
- 하객 브라우저의 `notifyAdmin()` (fire-and-forget)
- **Supabase `pg_cron` 5분** (`outbox-drain` 잡 → 공개 `POST /api/notify`)
- GitHub Actions 3시간 (시끄럽게 검증하는 역할)
- Vercel Cron 하루 1회

---

## ⚠️ 이걸 놓치면 알림이 통째로 멈춘다

`src/lib/notifyOutbox.ts` 첫 줄에 이 가드가 있다:

```ts
if (!supabaseAdmin || !isKakaoConfigured) return zero;   // 클레임조차 하지 않는다
```

**카카오 환경변수를 지우면서 이 가드를 그대로 두면, 드레인이 아무것도 꺼내지 않고
조용히 0을 반환한다.** 알림은 outbox 에 계속 쌓이기만 하고 아무도 모른다.
채널 전환에서 가장 먼저 고쳐야 할 한 줄이다.

같은 이유로 아래도 함께 바꿔야 한다:
- `DrainResult.kakao` (불리언) — 채널 중립적인 이름으로
- `.github/workflows/notify-drain.yml` 이 `.kakao == false` 와
  `.tokenStatus == "expired"` 를 실패 조건으로 쓴다 → 새 계약에 맞게 수정.
  **안 고치면 안전망이 매번 실패하거나, 반대로 고장을 놓친다.**

---

## 방향 두 가지 — A 를 추천

### A안 (추천) — 채널을 교체한다 (아웃박스 스키마 변경 없음)

발송 어댑터를 인터페이스로 두고 텔레그램 구현으로 갈아끼운다.

```ts
// src/lib/notifyChannel.ts (신규)
export interface NotifyChannel {
  readonly name: string;              // 'telegram' | 'kakao'
  readonly configured: boolean;
  send(text: string): Promise<{ ok: boolean; error?: string }>;
  /** 유휴 시 연결 점검 (텔레그램은 getMe — 만료 개념이 없어 갱신 목적은 아님) */
  health?(): Promise<"ok" | "unconfigured" | "error">;
}
```

- `src/lib/telegram.ts` — `sendMessage` (Bot API), `getMe`
- `notifyOutbox.ts` 는 `sendToMe` 대신 활성 채널의 `send()` 를 호출
- 가드는 `!channel.configured` 로 바꾼다
- `notification_outbox.kind` 는 `'kakao_admin'` 그대로 둔다 — **기존 행과 dedupe_key
  규칙을 건드리지 않는 게 안전하다.** 이름이 채널을 뜻하지 않게 된 점만 주석으로 명시
  (또는 후속에서 `'order_admin'` 으로 정리)

장점: 스키마·트리거·클레임 로직 무변경. 되돌리기는 환경변수와 어댑터 한 줄.
단점: 한 번에 한 채널만. (전환기에 둘 다 받고 싶으면 아래 B)

### B안 — 두 채널을 함께 (전환기·이중화)

카카오 토큰이 살아 있는 동안 둘 다 받고 싶다면.

- `send()` 를 **활성 채널 전부**에 보내고, **하나라도 성공하면 `sent`**
- 채널별 결과를 `last_error` 에 요약 기록 (`telegram:ok kakao:401`)
- 주의: 한 채널이 계속 실패해도 다른 하나가 성공하면 `sent` 라 **고장이 가려진다.**
  안전망 워크플로가 채널별 상태를 따로 보고하도록 해야 의미가 있다

per-channel 재시도까지 원하면 아웃박스 행을 채널별로 나눠야 하는데,
`dedupe_key` 가 `'participant:<id>'` 로 **유니크**라 트리거와 키 규칙을 함께 바꿔야
한다 (`'participant:<id>:<channel>'`). **예식 전에는 권하지 않는다.**

---

## 작업 (A안)

1. **텔레그램 준비 (코드 아님)**
   - 텔레그램에서 `@BotFather` → `/newbot` → **봇 토큰** 발급
   - 만든 봇과 1:1 대화방을 열고 아무 메시지나 전송
   - `https://api.telegram.org/bot<토큰>/getUpdates` 호출 → 응답의
     `result[0].message.chat.id` 가 **chat_id**
   - Vercel 환경변수: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
   - `.env.local.example` 에도 항목과 절차 주석 추가

2. **`src/lib/telegram.ts`**
   ```
   POST https://api.telegram.org/bot<TOKEN>/sendMessage
   { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true }
   ```
   - `sendToMe` 와 동일하게 **전체를 try/catch 로 감싸 던지지 않는다**
     (던지면 아웃박스 행이 `sending` 에 갇힌다 — 실제로 겪은 사고다)
   - HTML 모드면 `<`, `>`, `&` 를 이스케이프할 것. 확실치 않으면 `parse_mode` 를
     아예 빼고 평문으로 (하객 이름·배송지가 그대로 들어가므로 안전한 쪽이 낫다)

3. **`notifyOutbox.ts` 어댑터 교체**
   - 가드·`DrainResult` 필드·유휴 점검을 채널 중립적으로
   - 행 단위 try/catch 와 `markFailed` 는 **그대로 유지**

4. **메시지를 텔레그램답게 (190자 제약 해제)**
   지금 `buildText()` 는 이 정도만 담는다:
   ```
   🛵 새 주문 접수!
   홍길동 · 10월 10일(토) 오후
   📍 서울 강남구
   ```
   4096자를 쓸 수 있으니 **관리자가 바로 판단할 정보**를 더한다 — 배송기사, 현재
   인원, 그룹/개인 구분, 요청사항, 어드민 링크.
   **연락처(전화번호)는 넣지 말 것** — 지금도 안 넣는다. 알림 메시지는 외부 서비스에
   남으므로 이 선을 유지한다.

5. **안전망 워크플로 수정**
   `.github/workflows/notify-drain.yml` 의 `kakao`·`tokenStatus` 판정을 새 필드로.
   텔레그램은 만료가 없으므로 "토큰 만료 사전 감지" 분기는 **연결 실패 감지**로 의미가
   바뀐다 (`getMe` 실패 = 토큰이 잘못됐거나 봇이 차단됨).

6. **어드민 표시**
   `/admin` 의 카카오 연결 상태(AD-4)와 `api/admin/kakao-status` 를 새 채널로.

7. **검증**
   - 유닛: 메시지 조립(`buildText`)과 이스케이프. 발송은 fetch 를 모킹
   - E2E(`e2e-db`): 채널 미설정 상태에서 **드레인이 클레임하지 않고 조용히 0**을
     반환하는지 — 위 ⚠️ 가드의 회귀 방지
   - 수동: 실제 주문을 하나 넣고 텔레그램 수신 확인 → `notification_outbox` 행이
     `sent` + `sent_at` 인지, `participants.notified_at` 이 찍혔는지

## 전환 순서 (알림 유실 없이)

1. 텔레그램 채널을 **추가**하고 카카오와 함께 보내본다 (B안 형태로 잠깐)
2. 며칠 텔레그램이 정상 도착하는 걸 확인
3. 카카오를 끈다 — 이때 위 ⚠️ 가드·워크플로 판정이 먼저 고쳐져 있어야 한다
4. `site_settings.kakao_refresh_token` 행은 그때 지운다

급하면 1~2를 건너뛰고 바로 교체해도 되지만, **가드와 워크플로 수정이 빠지면
알림이 조용히 멈춘다**는 점만은 반드시 확인할 것.

## 참고 파일

`src/lib/notifyOutbox.ts` (드레인·이 작업의 중심) ·
`src/lib/kakao.ts` (교체 대상 어댑터, 구조 참고) ·
`src/app/api/notify/route.ts` (공개 POST · 크론 GET) ·
`.github/workflows/notify-drain.yml` (안전망 판정) ·
`supabase/migrations/20260821000200_notification_outbox.sql` (트리거·`dedupe_key`·클레임) ·
`supabase/migrations/20260906000300_outbox_pg_cron.sql` (5분 안전망) ·
`docs/NOTIFICATIONS.md`
