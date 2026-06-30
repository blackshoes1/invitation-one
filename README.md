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
    adminAuth.ts               # 관리자 비밀번호 검증
db/
  rsvp.sql · deliveries.sql    # 테이블 스키마
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

## 환경변수

`.env.local.example` → `.env.local` 복사 후 채웁니다.

### 1) Supabase (RSVP·배달·그룹·대기자)

1. https://supabase.com 프로젝트 생성
2. **SQL Editor** 에서 순서대로 실행: `db/rsvp.sql` → `db/deliveries.sql` → `db/groups.sql` → `db/group_members.sql` → `db/v2_updates.sql` → `db/v3_create_delivery.sql`
   - `v2_updates.sql`: 예상 인원·취소 상태·조건부 unique(취소된 날짜 재신청 가능)·취소/변경 RPC
   - `v3_create_delivery.sql`: 신청 삽입 + 주문 ID 반환 RPC(연락처 비노출 위해 직접 insert 대신 사용)
   - `v4_messages.sql`: 마음 배송/방명록 메시지 테이블
   - `v5_rsvp.sql`: 참석 의사(RSVP) 연락처·자녀·유아식 컬럼 + (이름,연락처) 중복 시 수정 RPC
3. **Project Settings → API** 에서 값 복사:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...   # 서버 전용, 공개 금지
   ```

배달 신청은 **날짜당 1건**(DB unique)으로 제한되며, 이미 신청된 날짜는 달력에서 자동 비활성화됩니다(`get_booked_dates` 함수가 날짜만 노출).

### 2) /admin 관리자

```
ADMIN_PASSWORD=원하는비밀번호
```
`/admin` 접속 → 비밀번호 입력 → 신청 목록 확인 및 상태 변경(대기중 → 확정 → 완료).

### 3) 솔라피 SMS (확정 시 문자)

```
SOLAPI_API_KEY=...
SOLAPI_API_SECRET=...
SOLAPI_SENDER=01000000000   # 솔라피에 사전 등록된 발신번호
```
키가 없으면 상태는 확정되지만 문자 발송은 자동으로 건너뜁니다.

### 4) 카카오맵

```
NEXT_PUBLIC_KAKAO_MAP_KEY=...   # developers.kakao.com JavaScript 키, Web 도메인 등록
```

## 배포

Vercel 연결 후 위 환경변수를 **Project Settings → Environment Variables** 에 동일하게 등록하세요. (`NEXT_PUBLIC_*` 는 공개, 나머지는 서버 전용)
