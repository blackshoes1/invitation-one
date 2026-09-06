# DB 마이그레이션

## 구조

| 경로 | 성격 | 적용 방법 |
|---|---|---|
| `db/*.sql` | **레거시(과거 이력)** — 초기 스키마부터 v25 까지. 수정 금지. | 이미 운영 DB 에 적용됨. 새 환경이면 아래 순서대로 SQL Editor 에서 실행 |
| `supabase/migrations/<YYYYMMDDhhmmss>_<name>.sql` | **표준 마이그레이션** — 이후의 모든 DB 변경 | Supabase SQL Editor 에 붙여넣기, 또는 `supabase db push` |

규칙
- 과거 파일(`db/*.sql`, 이미 적용된 `supabase/migrations/*`)은 **수정하지 않는다**. 고칠 게 있으면 새 파일을 추가한다.
- 추가 전용(additive)·멱등(`if not exists`, `create or replace`, `drop … if exists` 후 재생성)으로 작성한다. 파괴적 변경(drop table/column, 데이터 삭제) 금지.
- 권한 회수처럼 앱 배포와 순서가 얽히는 변경은 두 단계로 나눈다 (예: `…000100` 추가 → 앱 배포 → `…000200` 회수).
- pgcrypto 는 Supabase 에서 `extensions` 스키마에 있다. `set search_path = public` 함수 안에서는 `extensions.digest(...)`, `extensions.gen_random_bytes(...)` 처럼 스키마를 붙인다.

## 레거시 적용 순서 (새 환경 구축 시)

```
db/rsvp.sql → db/deliveries.sql → db/groups.sql → db/group_members.sql
→ db/v2_updates.sql → v3 → v4 → … → v23_drop_messages.sql
→ v24_checkin_v2.sql → v24_notify_once.sql → v25_merge_deliveries.sql
```
(각 파일 첫 줄 주석에 선행 파일이 적혀 있다)

## 표준 마이그레이션 목록

| 파일 | 내용 |
|---|---|
| `20260731000100_manage_token_rate_limit.sql` | P0-2 관리 토큰(`participants.manage_token_hash`), 토큰 발급/조회 함수, `*_v2/v3` 생성 RPC, `rate_limits` + `rl_hit()` |
| `20260731000200_revoke_anon_participant_rpc.sql` | P0-2 2단계 — participant UUID 를 받는 구 RPC 의 anon 실행 권한 회수 (앱 배포 후 적용) |
| `20260821000100_admin_sessions.sql` | P1-1 관리자 세션 테이블 (토큰 해시만 저장) |
| `20260821000200_notification_outbox.sql` | P1-3 카카오 알림 아웃박스 + participants insert 트리거 + `claim_notifications()` |
| `20260821000300_group_member_invites.sql` | 개인 초대 링크 — `group_members.phone/invite_token_hash/invited_at`, `_invite_phone()`, `create_delivery_v3`·`join_delivery_v2`·`accept_group_offer_v2` 에 `p_invite_token` 추가(구 시그니처 drop 후 재생성, 기존 호출 호환) |
| `20260822000100_heart_privacy.sql` | 마음배송 공개 설정(`display_mode/is_private/show_region`)·참석 여부(`attendance`), `_mask_name()`, `get_celebrations` 마스킹/비공개 제외, `send_heart_v2` 인자 추가(구 시그니처 drop 후 재생성) — 기존 마음배송 행은 `name` 유지 |
| `20260823000100_anon_alias.sql` | 익명 별명(`participants.anon_alias`, `_anon_alias()`), 기존 마음배송 전부 익명 전환, `get_celebrations` 별명 표시, `send_heart_v2` 에 `p_anon_alias` 추가 |
| `20260905000100_participant_phone_optional.sql` | 관리자 일괄 신청 처리용 — `participants_delivery_shape` 에서 직접배달 phone 필수 조건 제거 (delivery_id 필수는 유지) |
| `20260906000100_outbox_claim_window_7d.sql` | `claim_notifications` 클레임 창 2일 → 7일. 드레인이 이틀 넘게 멈추면 그 사이 알림이 재시도 대상에서 영구히 빠지던 문제 (2026-09-05 안전망 401 장애에서 드러남) |
| `20260906000200_groupless_invites.sql` | 그룹 없이 개별 초대 — `group_members.group_id` 를 nullable 로. 개인 한 명에게 자동 입력 링크를 주려고 그 사람만을 위한 그룹을 만들어야 하던 문제. **읽는 쪽은 `groups` 를 left join 할 것** (inner 면 그룹 없는 초대가 조용히 사라진다) |

## 적용 확인

```sql
-- 함수 권한
select p.proname, has_function_privilege('anon', p.oid, 'execute') anon_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by 1;
-- 테이블
select table_name from information_schema.tables where table_schema = 'public' order by 1;
```
