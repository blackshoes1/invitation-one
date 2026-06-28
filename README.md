# 모바일 청첩장 (성근영 ♥ 김아영)

Next.js(App Router) · TypeScript · Tailwind CSS v4 · framer-motion 기반 모바일 청첩장.

## 구조

```
src/
  app/
    layout.tsx        # 폰트(Noto Serif/Sans KR) · 메타데이터
    page.tsx          # 섹션 조합
    globals.css       # 베이지·세이지 팔레트(@theme)
  components/
    FadeIn.tsx        # 공용 스크롤 등장 애니메이션
    KakaoMap.tsx      # 카카오맵 임베드(+폴백)
    sections/         # Hero · Dday · Greeting · Location · Account · Rsvp
  lib/
    wedding.ts        # 모든 청첩장 데이터 + 날짜/D-Day 헬퍼
    supabase.ts       # Supabase 클라이언트
db/rsvp.sql           # RSVP 테이블 스키마
```

> 내용 수정은 대부분 `src/lib/wedding.ts` 한 파일에서 끝납니다.
> 요일·D-Day는 날짜에서 자동 계산되므로 따로 적지 않습니다.

## 개발

```bash
npm install
npm run dev      # http://localhost:3000
```

## 환경변수 설정

`.env.local.example` 를 `.env.local` 로 복사 후 값을 채웁니다.

### 1) Supabase — RSVP 저장

1. https://supabase.com 에서 프로젝트 생성
2. **SQL Editor** 에 `db/rsvp.sql` 내용을 붙여넣고 실행
3. **Project Settings → API** 에서 URL · anon key 복사 → `.env.local`
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
4. 응답은 Supabase **Table Editor → rsvp** 에서 확인

> 키가 없으면 폼은 "데모 모드"로 동작합니다(전송 성공 화면은 뜨지만 저장은 안 됨).

### 2) 카카오맵

1. https://developers.kakao.com → 애플리케이션 추가
2. **앱 키 → JavaScript 키** 복사 → `.env.local` 의 `NEXT_PUBLIC_KAKAO_MAP_KEY`
3. **플랫폼 → Web** 에 도메인 등록 (예: `http://localhost:3000`, 배포 주소)

> 키가 없으면 지도는 주소가 적힌 약도 플레이스홀더로 표시됩니다.

## 배포

Vercel 에 연결 후, 위 환경변수를 **Project Settings → Environment Variables** 에 동일하게 등록하세요.
