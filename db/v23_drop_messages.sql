-- Supabase SQL Editor 에서 실행. (v22 이후)
-- 레거시 messages 테이블 제거.
--
-- 배경: v4_messages 의 messages 테이블은 v7_participants 에서 participants 로
--       이관됐고 이후 앱은 participants(get_celebrations)만 사용한다. messages 는
--       비활성 상태로 남아 있었고, anon INSERT(with check true) 정책 탓에 죽은
--       테이블에 무제한 삽입이 가능한 스팸 표면이었다. 여기서 완전히 제거한다.
--
-- ※ 신규 환경 세팅 시에는 v4_messages.sql 을 실행하지 않아도 된다(참고용 히스토리).

drop table if exists public.messages;
