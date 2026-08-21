# 모바일 청첩장 (성근영 ♥ 김아영)

Next.js(App Router) · TypeScript · Tailwind CSS v4 · framer-motion 기반 모바일 청첩장.

## 페이지 구성

홈(`/`)은 **하단 고정 탭바 4개 + 탭 안에서 세로 스와이프(풀스크린 스냅)** 구조입니다.

- 💌 **초대장**: Hero → 인사말 → D-Day
- 📸 **갤러리**: 커플 사진 슬라이드
- 🛵 **받기**: 청첩장 배달 신청 (대화형 6단계 스텝 폼)
- 📍 **정보**: 오시는 길 → 마음 전하실 곳 → 참석 회신(RSVP)

탭 전환 시 가로 슬라이드 애니메이션, 첫 진입은 💌 초대장 탭.
🛵 받기 탭·플로팅 버튼·첫 진입 팝업은 모두 별도 배달 페이지(`/delivery`)로 이동합니다.

배달 서비스(`/delivery`): **청첩장과 완전히 다른 밝은 배달앱 톤**(탠저린/민트, 패러디 카피)의 독립 페이지. 6단계 주문 폼 → 주문 완료(영수증) 화면. `src/app/delivery/`(전용 layout) + `src/components/delivery/`(DeliveryForm·StepIndicator·CompletePage).

관리자(`/admin`): 배달 신청 목록(대기중·확정·완료) 관리, 확정 시 SMS 발송.

## 구조

```
src/
  app/
    layout.tsx                 # 폰트(Noto Serif/Sans KR) · 메타데이터
    page.tsx                   # 섹션 조합
    globals.css                # 베이지·세이지 팔레트(@theme)
    admin/page.tsx             # 관리자 페이지(비밀번호 보호)
    api/admin/deliveries/      # 어드민 API (service_role + 비밀번호)
  components/
    FadeIn.tsx · KakaoMap.tsx
    sections/                  # Hero · Gallery · Delivery · Dday · Greeting · Location · Account · Rsvp
  lib/
    wedding.ts                 # 모든 콘텐츠 + 날짜/D-Day 헬퍼
    supabase.ts                # 공개 클라이언트(anon)
    supabaseAdmin.ts           # 서버 전용(service_role)
    sms.ts                     # 솔라피 SMS
    adminAuth.ts               # 관리자 세션(DB 무작위 토큰) · adminGuard
    signedToken.ts             # 단기 HMAC 토큰 (사진 업로드 권한)
    manageToken.ts             # 신청 관리 링크 토큰(해시 저장)
    rateLimit.ts               # DB 기반 rate limit (rl_hit)
db/                          # 레거시 스키마·마이그레이션 (초기~v25, 수정 금지)
supabase/migrations/         # 표준 마이그레이션 (이후 모든 DB 변경)
scripts/                     # backup-db.mjs · restore-db.mjs
```

> 내용 수정은 대부분 `src/lib/wedding.ts` 한 파일에서 끝납니다.
> 요일·D-Day는 날짜에서 자동 계산됩니다.

## 개발

```bash
npm install
npm run dev      # http://localhost:3000
```

## 갤러리 사진

`/public/pic/` 에 `gallery1.jpg`, `gallery2.jpg`, `gallery3.jpg` 를 넣으면 자동으로 슬라이드에 표시됩니다. (없으면 "사진 준비 중" 플레이스홀더) 장수·파일명은 `src/lib/wedding.ts` 의 `galleryImages` 에서 조정.

## 로컬 셋업

```bash
npm install
cp .env.local.example .env.local   # 값 채우기 (아래 환경변수 참고)
npm run dev                        # http://localhost:3000
```

검증 명령 (CI 와 동일):

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```

## 환경변수

`.env.local.example` 에 모든 변수와 설명이 있습니다. 요약:

| 변수 | 공개 여부 | 용도 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 공개 | 브라우저 Supabase 클라이언트 (RLS + 공개 RPC 만) |
| `SUPABASE_SERVICE_ROLE_KEY` | **서버 전용** | 관리자 API·업로드·알림 등 서버 라우트 |
| `NEXT_PUBLIC_INVITATION_KEY` | 공개(QR 링크 `?key=`) | 청첩장 열람 게이트. **비밀값이 아님** — 권한은 서버 토큰이 담당 |
| `ADMIN_PASSWORD` | **서버 전용** | `/admin` 로그인. 세션은 DB 무작위 토큰(`admin_sessions`) |
| `APP_SIGNING_SECRET` | **서버 전용**(선택) | 단기 HMAC 토큰(사진 업로드 권한) 서명 키. 없으면 서버 시크릿에서 파생 |
| `CHECKIN_EVENT_KEY` | **서버 전용** | 예식장 공용 체크인 QR 의 행사 키 |
| `SOLAPI_API_KEY/SECRET/SENDER` | **서버 전용**(선택) | SMS. 미설정 시 발송 skip |
| `KAKAO_REST_API_KEY` / `KAKAO_REFRESH_TOKEN` | **서버 전용**(선택) | 관리자 카카오 알림. refresh token 은 DB(`site_settings`)에 자동 회전 저장 |
| `CRON_SECRET` | **서버 전용**(선택) | Vercel Cron → `/api/notify` GET 안전망 |
| `NEXT_PUBLIC_KAKAO_MAP_KEY`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BGM_*`, `NEXT_PUBLIC_*VIDEO_URL` | 공개 | 지도·OG·BGM·영상 |

원칙: `NEXT_PUBLIC_*` 는 번들에 포함되는 **공개값**입니다. service_role·비밀번호·토큰·서명키는 서버 라우트(`src/app/api/**`, `src/lib/*Admin*`, `src/lib/signedToken.ts`)에서만 읽습니다.

## DB 마이그레이션

- 레거시 스키마(`db/*.sql`, 초기~v25)와 표준 마이그레이션(`supabase/migrations/*.sql`)으로 나뉩니다.
  과거 파일은 수정하지 않고, 변경은 항상 **새 마이그레이션 파일**로 추가합니다.
- 적용: Supabase 대시보드 → SQL Editor 에 파일 내용을 붙여넣어 실행 (또는 `supabase db push`).
- 순서·목록·규칙·확인 쿼리: **[`supabase/migrations/README.md`](supabase/migrations/README.md)**

## 백업 / 복원

```bash
npm run backup                                   # backups/<스탬프>/<테이블>.json
npm run restore -- backups/<스탬프> [t1,t2,...]   # 기본키 upsert 복원 (삭제 동기화 없음)
```
자세한 절차·권장 시점·Storage 사진 보관: [`docs/BACKUP.md`](docs/BACKUP.md)

## 테스트 / CI

- 단위 테스트: `npm test` (vitest) — 순수 로직(날짜·전화번호·CSV·토큰 서명/검증·체크인 창 등). 외부 서비스(SMS·카카오·운영 Supabase) 접근 없음.
- CI: `.github/workflows/ci.yml` — `npm ci` → lint → tsc → test → build. 빌드용 더미 env 만 사용.

## 배포

Vercel 연결 후 위 환경변수를 **Project Settings → Environment Variables** 에 동일하게 등록하세요. (`NEXT_PUBLIC_*` 는 공개, 나머지는 서버 전용)
