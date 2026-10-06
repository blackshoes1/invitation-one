-- 그룹 없이 개별 초대 — group_members.group_id 를 nullable 로.
--
-- 배경: 초대 토큰(개인 링크)의 목적은 "받는 사람이 이름·연락처를 다시 입력하지
-- 않게 하는 것"이다. 그런데 토큰은 group_members 행에만 붙고, 그 행은
-- `group_id not null` 이라 **모임이 없는 개별 지인 한 명에게 링크를 주려고
-- 그 사람만을 위한 그룹을 만들어야 했다.**
--
-- 개인들을 한 그룹에 몰아넣는 우회도 안전하지 않다: get_group_orders(slug) 는
-- 그 그룹의 모든 주문과 참여자 이름 배열을 anon 에게 돌려주므로, 그룹 링크가
-- 한 번이라도 새면 서로 모르는 지인들끼리 이름이 노출된다.
--
-- 그래서 제약을 푼다. group_id 가 null 인 행 = "그룹에 속하지 않은 개별 초대".
-- 이 사람에게는 개인 링크(/delivery?i=)만 발급되고, 그 주문은 개인 주문이다
-- (src/lib/orderKind.ts — 그룹 페이지가 아니면 개인 주문).
--
-- 파괴적 변경 아님: 기존 행은 전부 group_id 를 갖고 있어 그대로다.
-- 되돌리려면 group_id 가 null 인 행을 정리한 뒤 set not null 하면 된다.
--
-- 주의 — 이 컬럼을 읽는 곳은 조인 방식을 확인할 것:
--   resolveInvite / api/delivery/invite 는 groups 를 **left join** 해야 한다
--   (inner join 이면 그룹 없는 초대가 조용히 "토큰 없음"으로 떨어진다)
-- 집계는 이미 안전하다: api/admin/groups 의 roster 집계는 `if (m.group_id)` 로
-- 건너뛰고, get_group_status / get_group_orders 는 groups 와 조인하므로
-- 그룹 없는 행이 어느 그룹에도 섞이지 않는다.

alter table public.group_members alter column group_id drop not null;

-- 그룹 없는 개별 초대를 자주 훑으므로 부분 인덱스 하나
create index if not exists group_members_solo_idx
  on public.group_members (created_at)
  where group_id is null;
