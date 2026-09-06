-- 아웃박스 안전망을 DB 안으로 — pg_cron 이 5분마다 /api/notify 를 POST 한다.
--
-- 배경: 알림 한 건이 'sending' 인 채로 묶이면 claim_notifications 의 3분 스테일
-- 락이 회수해 주지만, **그 시점에 드레인을 돌려줄 주체가 없으면** 아무 일도
-- 일어나지 않는다. 지금 안전망은 GitHub Actions 3시간 간격(Actions 무료 한도
-- 때문에 30분에서 늘린 것)과 Vercel 크론 하루 1회(Hobby 플랜 한도)뿐이라,
-- 최악의 경우 알림이 3시간 늦는다. 2026-09-06 에 실제로 16분 늦었고, 손대지
-- 않았으면 2시간을 더 기다릴 상황이었다. 예식 당일에 이러면 안 된다.
--
-- 아웃박스를 들고 있는 DB 가 스스로 드레인을 부르게 하면 GitHub Actions 분도,
-- Vercel 크론 한도도 쓰지 않는다. 최악 지연이 3시간 → 5분이 된다.
--
-- 호출 대상은 하객 브라우저가 신청 직후 부르는 것과 **같은 공개 POST 경로**다.
-- 파라미터가 없는 "보낼 게 있으면 보내라" 신호일 뿐이라 맞춰야 할 비밀이 없다
-- (참여자 지정 불가·PII 없음·IP 당 10분 30회 rate limit — 5분 간격은 2회).
--
-- 카카오 호출량: 보낼 게 없을 때의 토큰 점검은 앱에서 3시간 간격 제한이 걸려
-- 있다(kakaoTokenStatusThrottled). 5분마다 불러도 카카오에는 하루 8번만 간다.
-- ※ 그 간격 제한이 배포되기 **전에** 5분으로 돌리면 안 된다 (하루 288번).
--
-- 실패는 조용하다(pg_net 은 비동기라 응답을 안 본다). 그래서 이건 어디까지나
-- '자주 도는 안전망'이고, 시끄럽게 검증하는 역할은 GitHub Actions 크론이
-- 3시간마다 계속 맡는다 (.github/workflows/notify-drain.yml).
--
-- 되돌리기: select cron.unschedule('outbox-drain');
--
-- ※ 확장이 없는 환경에서는 통째로 건너뛴다.
--   CI 의 db-verify 잡은 순수 postgres:17 컨테이너에 이 디렉터리의 모든 파일을
--   ON_ERROR_STOP=1 로 적용하는데, 거기엔 pg_cron/pg_net 이 없다. 스키마 전체가
--   적용되는지 보는 잡이지 크론을 검증하는 잡이 아니므로, 확장을 못 만들면
--   notice 만 남기고 넘어가는 게 맞다. 운영 Supabase 에서는 정상 등록된다.
--   (execute 로 감싼 이유: 정적 SQL 이면 cron 스키마가 없을 때 파싱 단계에서
--    막혀 exception 핸들러까지 오지 않는다)

do $mig$
begin
  execute 'create extension if not exists pg_cron';
  execute 'create extension if not exists pg_net';

  -- 재적용해도 중복 등록되지 않게 (멱등)
  execute $c$
    select cron.unschedule('outbox-drain')
     where exists (select 1 from cron.job where jobname = 'outbox-drain')
  $c$;

  execute $c$
    select cron.schedule(
      'outbox-drain',
      '*/5 * * * *',
      $job$
      select net.http_post(
        url     := 'https://kkachi.vercel.app/api/notify',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
      $job$
    )
  $c$;

  raise notice '[outbox-drain] pg_cron 잡 등록 완료 (5분 간격)';
exception
  when others then
    raise notice '[outbox-drain] pg_cron/pg_net 사용 불가 — 건너뜀 (%)', sqlerrm;
end
$mig$;
