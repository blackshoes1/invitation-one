# 현장 체크인 · 좌석 안내 시스템 요구사항 정의서 (확정판)

> RSVP 정보와 현장 체크인을 연결하는 개인 QR 체크인 + 좌석 관리 기능.
> 초안 검토(코드베이스 대조) 후 8개 지적 사항과 권장 사항을 반영한 **확정 개정안**이다.
> 보안 경계: **원문 UUID 토큰 + 서버 API + 공개 DB 쓰기 권한 회수**.
> 잔여 위험(이름+연락처만으로 RSVP 수정 가능)은 MVP에서 수용하되, 그 경로로 패스 토큰이 탈취되지 않도록 분리한다. OTP 인증은 후속 기능.

관련 기존 자산: `db/rsvp.sql` `db/v5_rsvp.sql`(submit_rsvp) `db/v22_checkin.sql`(GX-4 공용 체크인) `src/app/checkin/page.tsx` `src/components/sections/Rsvp.tsx` `db/v17_site_settings.sql` `src/lib/adminAuth.ts`

---

# 1. 기능 목표

RSVP 정보와 현장 체크인을 연결해 다음 질문에 실시간으로 답할 수 있어야 한다.

- 참석 예정자는 몇 명인가?
- 지금까지 몇 명이 도착했는가?
- 아직 도착하지 않은 팀은 누구인가?
- RSVP보다 실제 방문 인원이 늘거나 줄었는가?
- 하객이 어느 테이블로 가야 하는가?
- 중복 체크인이나 잘못된 체크인을 취소·수정할 수 있는가?

핵심 사용자 경험:

```text
RSVP 제출
→ 개인·가족 QR 발급
→ 예식장에서 QR 스캔
→ 예약 정보 확인
→ 실제 방문 인원 확인
→ 체크인 완료
→ 테이블 위치 안내
```

# 2. 범위

## MVP 포함

- RSVP 팀별 개인 QR 발급 (기존 참석 RSVP 전건 백필 포함)
- QR 링크를 다시 열어도 동일한 RSVP 확인
- 예상 인원 자동 표시
- 실제 방문 인원 변경
- 중복 체크인 방지
- 체크인 성공 후 좌석 안내
- 관리자 좌석 배정
- 관리자 체크인 현황 조회
- 관리자 수동 체크인·수정·취소
- 공용 QR을 통한 현장 등록
- RSVP 예정 인원과 실제 참석 인원 비교
- **CSV 내보내기** (RSVP·체크인 확장 + 관리자 전용 QR 발송 목록)

## 후속 기능

- QR 문자 자동 발송
- 테이블 배치도 이미지
- 동반인 이름 개별 등록
- 식권·답례품 수령 체크
- QR 이미지 Wallet 저장
- 하객별 감사 메시지 자동 발송
- 네트워크 장애 시 오프라인 체크인
- RSVP 수정 OTP 인증 (잔여 위험 해소)

# 3. 사용자 구분

## 하객

- RSVP를 제출한다.
- 개인 QR 또는 체크인 링크를 받는다.
- 예식장에서 QR을 연다.
- 예약 이름과 예상 인원을 확인한다.
- 실제 도착 인원을 선택한다.
- 체크인 후 테이블 위치를 확인한다.

## 안내데스크 담당자

- 하객 이름 또는 연락처 뒤 4자리로 검색한다.
- 하객을 수동 체크인한다.
- 실제 방문 인원을 수정한다.
- QR이 없는 현장 하객을 등록한다.
- 중복 체크인을 확인한다.
- 테이블 위치를 안내한다.

## 관리자

- 테이블을 생성하고 정원을 설정한다.
- RSVP 팀을 테이블에 배정한다.
- 미배정·초과 배정 상태를 확인한다.
- 예상/도착/미도착 인원을 확인한다.
- 잘못된 체크인을 수정하거나 취소한다.
- 데이터를 CSV로 내보낸다.

# 4. 상세 사용자 흐름

## 4.1 RSVP 제출 및 QR 발급

1. 하객이 RSVP 폼을 제출한다. **브라우저의 Supabase 직접 RPC 호출은 중단하고 서버 API(`POST /api/rsvp`)로 전환한다.**
2. 참석 여부가 `참석`이면 RSVP 팀에 체크인 토큰을 발급한다.
3. 제출 완료 화면에 다음 내용을 표시한다.

```text
참석 의사가 전달되었습니다.
홍길동님 외 2명
신랑측 · 총 3명
[내 입장 QR 보기]
[체크인 링크 복사]
[캘린더에 추가]
```

4. QR에는 이름, 전화번호, 테이블 번호를 직접 넣지 않는다.
5. QR은 불투명한 토큰을 가진 URL만 포함한다.

```text
https://도메인/checkin?t=<opaque-token>
```

6. RSVP를 수정해 불참으로 변경하면 QR을 비활성화한다.
7. 다시 참석으로 변경하면 **기존 토큰을 재사용하지 않고 신규 토큰으로 로테이션**한다.
8. 같은 이름과 연락처로 RSVP를 수정해도 중복 QR이 생성되지 않아야 한다.

### 토큰 반환 정책 (보안 확정)

이름과 전화번호는 인증 수단이 아니므로 **기존 RSVP의 토큰을 공개 API로 반환하지 않는다.**

**신규 RSVP** (`result: "inserted"`):

- RSVP 저장 → 참석이면 토큰 발급 → **생성된 토큰을 응답에 한 번 반환** → 완료 화면에서 QR 표시

```json
{ "result": "inserted", "passToken": "uuid", "passUrl": "/checkin?t=uuid" }
```

**기존 RSVP 수정** (`result: "updated"`):

- 참석 정보는 수정하되 **기존 토큰은 응답하지 않는다** (`passToken: null`)
- 토큰을 이미 가진 사용자는 기존 링크 계속 사용
- 기존 참석자는 관리자 링크 복사 또는 SMS로 QR 수령

> **잔여 위험 명시**: 현재 RSVP 수정은 이름과 전체 연락처를 아는 사용자가 기존 내용을 변경할 수 있는 구조다. MVP에서는 이를 수용하되 토큰은 반환하지 않는다. OTP 인증은 후속 보안 기능으로 분리한다.

## 4.2 개인 QR 체크인

QR 진입 시 서버에서 토큰을 검증한 후 다음 화면을 보여준다.

```text
홍길동님, 환영합니다
예약 인원
성인 2명 · 어린이 1명
총 3명
오늘 함께 오신 인원이 맞나요?
[−] 3명 [+]
[3명 체크인하기]
```

요구사항:

- 예상 인원은 `1 + companion_count`로 계산한다. (어린이는 동반 인원에 포함 — 현재 폼 구조와 일치 확인됨)
- 초기 실제 방문 인원은 예상 인원과 동일하게 설정한다.
- 실제 방문 인원은 1~20명 범위에서 변경할 수 있다.
- 예상 인원과 달라지면 관리자 화면에서 차이를 표시한다.
- 이미 체크인한 QR이면 새 기록을 만들지 않는다.
- 이미 체크인한 경우 기존 체크인 정보와 수정 버튼을 보여준다.

## 4.3 체크인 성공 및 좌석 안내

체크인 성공 후:

```text
체크인이 완료되었습니다 🎉
홍길동님 외 2명
신랑측 A구역 · 7번 테이블
연회장 입구에서 오른쪽 두 번째 줄입니다.
[좌석 위치 보기]
[사진 미션 참여하기]
```

좌석이 미배정된 경우:

```text
체크인이 완료되었습니다 🎉
좌석은 안내데스크에서 안내해 드릴게요.
이 화면을 직원에게 보여주세요.
```

- 체크인 전에는 테이블 정보를 반환하지 않는다 (토큰 사전 조회 범위 축소).
- 테이블 정원이 부족해도 체크인을 막지 않는다. 관리자 화면에서 좌석 초과 경고만 표시한다.

## 4.4 공용 QR 및 현장 하객

기존 `/checkin` 공용 QR은 유지하되 두 경로를 제공한다.

```text
[RSVP를 제출했어요]
[현장에서 바로 등록할게요]
```

### RSVP 검색

- 이름 + 전화번호 뒤 4자리
- 동명이인이면 전체 전화번호 또는 신랑/신부측으로 추가 확인
- 검색 성공 후 개인 QR 체크인과 같은 흐름으로 진행

### 현장 등록

- 이름 / 신랑측·신부측 / 실제 인원 / 식사 인원 / 관리자 메모
- `rsvp_id=null`, `source='walk_in'`으로 저장 (측 구분은 `groom`/`bride` 영문 코드로 저장)

# 5. 좌석 관리 요구사항

## 5.1 테이블 정보

각 테이블: 테이블명(`7번 테이블`, `A-03`) · 구역(`신랑측 A구역`) · 측 구분(groom/bride/common) · 정원 · 층/홀 · 위치 안내 문구 · 정렬 순서 · 활성 상태

## 5.2 관리자 좌석 배정

- RSVP 팀을 테이블에 배정 / 여러 팀 같은 테이블 배정 / 이동 / 배정 취소
- 신랑측·신부측 필터 / 미배정 필터 / 정원 초과 필터 / 이름·연락처 검색

테이블별 상태 표시:

```text
A-07 · 신랑측
8 / 10명 배정
6 / 10명 도착
홍길동 외 2명   도착
김영희 외 1명   미도착
박철수          도착
```

## 5.3 정원 계산

- 배정 인원: 참석 RSVP의 예상 인원 합계
- 도착 인원: 활성 체크인의 실제 인원 합계
- 잔여 좌석: 정원 − 배정 인원 / 실제 잔여 좌석: 정원 − 도착 인원
- 정원 초과는 허용하되 시각적으로 경고

## 5.4 테이블 삭제 정책

- `rsvp.table_id` FK는 기본 `NO ACTION` — 배정된 RSVP가 있는 테이블 삭제를 **DB에서 차단**한다.
- 운영 중 테이블 숨김은 삭제 대신 `active=false`.
- 관리자 UI: 배정 없는 테이블만 삭제 가능, 배정 있는 테이블은 삭제 버튼 비활성화 + "운영에서 숨기기" 제공. 비활성 테이블은 신규 배정 목록에서 제외하되 기존 배정 기록은 유지.

# 6. 관리자 체크인 화면

기존 관리자 대시보드에 `현장 운영` 탭을 추가한다.

## 상단 지표

참석 예정 팀 / 참석 예정 인원 / 체크인 완료 팀 / 실제 도착 인원 / 미도착 팀 / 현장 추가 인원 / 신랑측·신부측 도착 인원 / 식사 예정 인원 / 식사 미정 인원 / 실제 식사 인원

```text
예정 142명 · 도착 96명 · 미도착 46명 · 현장 추가 +4명 · 도착률 67.6%
```

## 목록 필터

전체 / 도착 / 미도착 / 현장 등록 / 인원 변경 / 좌석 미배정 / 중복 의심 / 신랑측 / 신부측

## 관리자 작업

수동 체크인 / 실제 인원 수정 / 좌석 변경 / 체크인 취소 / 현장 하객 등록 / 중복 기록 병합 / 메모 작성 / QR 재발급 / 체크인 링크 복사

### QR 재발급 의미 (고정)

1. 기존 토큰을 즉시 사용할 수 없게 한다.
2. 새 UUID를 발급한다.
3. 발급 시각을 갱신한다.
4. 기존 URL 접근 시 `invalid_pass`를 반환한다.
5. 활성 체크인 기록은 변경하지 않는다.

이미 체크인한 RSVP에 재발급 시 경고를 표시한다:

```text
이미 체크인한 하객입니다.
QR을 재발급해도 기존 체크인 기록은 유지됩니다.
```

# 7. 데이터 모델

## 7.1 side 값 통일 (전 테이블 영문 코드)

| 테이블 | 허용 값 |
|---|---|
| `rsvp.side` | `groom`, `bride` |
| `checkins.side` | `groom`, `bride` |
| `seating_tables.side` | `groom`, `bride`, `common` |

UI 표시는 변환 맵으로만 처리한다:

```ts
const SIDE_LABEL = { groom: "신랑측", bride: "신부측", common: "공통" };
```

기존 `checkins.side` 한글 값 마이그레이션:

```sql
alter table public.checkins
  drop constraint if exists checkins_side_check;
update public.checkins
set side = case side
  when '신랑' then 'groom'
  when '신부' then 'bride'
  else side
end;
alter table public.checkins
  add constraint checkins_side_check
  check (side is null or side in ('groom', 'bride'));
```

## 7.2 `seating_tables`

```sql
create table public.seating_tables (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  zone text,
  side text check (side in ('groom', 'bride', 'common')),
  capacity int not null check (capacity between 1 and 50),
  floor text,
  location_note text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 7.3 `rsvp` 확장 + 토큰 백필

토큰은 해시가 아닌 **원문 UUID 저장으로 확정**한다.
(근거: 단일 예식 수백 명 규모 · 관리자 링크 복사 필요 · 후속 QR 문자 발송 필요 · 재발급 운영 단순화 · rsvp 테이블은 RLS로 직접 조회 차단됨)

```sql
alter table public.rsvp
  add column if not exists table_id uuid
    references public.seating_tables(id),
  add column if not exists checkin_token uuid,
  add column if not exists checkin_token_active boolean not null default false,
  add column if not exists qr_issued_at timestamptz;

create unique index if not exists rsvp_checkin_token_uniq
  on public.rsvp(checkin_token)
  where checkin_token is not null;

alter table public.rsvp
  add constraint rsvp_active_token_shape
  check (checkin_token_active = false or checkin_token is not null);
```

**기존 참석 RSVP 전건 백필** (첫 마이그레이션에 포함):

```sql
update public.rsvp
set checkin_token = gen_random_uuid(),
    checkin_token_active = true,
    qr_issued_at = now()
where attending = true
  and checkin_token is null;
```

- 불참 RSVP: `checkin_token=null`(또는 기존 토큰 보존) + `checkin_token_active=false` 유지.
- 백필된 토큰은 관리자 링크 복사·CSV·후속 SMS 발송에 사용.

토큰 규칙:

- `gen_random_uuid()` 생성 · URL에는 토큰만 포함 (이름·연락처·RSVP ID 금지)
- 관리자 API 외에는 원문 토큰 목록 조회 금지
- 공개 API는 전달받은 토큰과 일치 여부만 검사
- 재발급은 반드시 로테이션 (기존 토큰 즉시 무효화 + 신규 UUID + `active=true` + `qr_issued_at` 갱신). 단순 재활성화 금지.

## 7.4 `checkins` 확장 + 기존 데이터 백필

```sql
alter table public.checkins
  add column if not exists rsvp_id uuid references public.rsvp(id),
  add column if not exists expected_party_size int,
  add column if not exists actual_party_size int,
  add column if not exists meal_count int,
  add column if not exists source text,
  add column if not exists status text not null default 'active',
  add column if not exists checked_in_by text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists canceled_at timestamptz,
  add column if not exists admin_memo text;

alter table public.checkins
  add constraint checkins_source_check
  check (source in ('personal_qr', 'common_qr', 'admin', 'walk_in', 'legacy'));

alter table public.checkins
  add constraint checkins_status_check
  check (status in ('active', 'canceled', 'merged'));

-- meal_count 는 0..actual_party_size 범위
alter table public.checkins
  add constraint checkins_meal_count_range
  check (
    meal_count is null
    or (meal_count >= 0
        and (actual_party_size is null or meal_count <= actual_party_size))
  );

-- 동일 RSVP 활성 체크인은 최대 1건 (동시 요청도 DB 가 보장)
create unique index checkins_active_rsvp_uniq
  on public.checkins(rsvp_id)
  where rsvp_id is not null and status = 'active';
```

**기존 체크인 백필**:

```sql
update public.checkins
set actual_party_size = party_size,
    expected_party_size = null,
    meal_count = null,
    source = 'legacy',
    status = 'active',
    checked_in_by = 'legacy'
where source is null;
```

- 기존 `party_size`는 호환성을 위해 1차 마이그레이션에서 유지하고, 애플리케이션 전환 완료 후 별도 마이그레이션에서 제거한다.

# 8. API 및 RPC 요구사항

## 8.1 `POST /api/rsvp` (신설 — 공개)

서버 API가 service-role로 RSVP를 생성·수정한다. 브라우저의 `submit_rsvp` 직접 호출은 중단.
내부적으로 전용 함수 `submit_rsvp_v2(...)`(security definer, **anon grant 없음**)가 다음을 원자적으로 처리한다:

- 신규 생성 또는 기존 수정 (충돌 키: 이름+연락처)
- 참석 여부 전환 판정
- 토큰 발급·비활성화·로테이션
- 결과 반환 (§4.1 토큰 반환 정책 적용)

## 8.2 `GET /api/checkin/pass?t=...` (공개)

토큰 검증 후 최소 정보만 반환. 체크인 전에는 테이블 정보를 반환하지 않는다.

```json
{
  "valid": true,
  "alreadyCheckedIn": false,
  "guest": { "displayName": "홍길동", "side": "groom", "expectedPartySize": 3 }
}
```

토큰 오류는 존재 여부를 구분할 수 없게 **모두 동일한 형태**로 응답한다:

```json
{ "valid": false, "error": "invalid_pass" }
```

## 8.3 `POST /api/checkin/pass` (공개)

```json
{ "token": "...", "actualPartySize": 3, "mealCount": 3 }
```

응답:

```json
{
  "result": "checked_in",
  "checkin": { "actualPartySize": 3, "checkedInAt": "2026-10-18T02:30:00Z" },
  "seat": { "tableName": "A-07", "zone": "신랑측 A구역", "floor": "2층", "locationNote": "입구 오른쪽 두 번째 줄" }
}
```

가능한 결과:

```text
checked_in / already_checked_in / invalid_pass(토큰 오류 통합)
not_attending / checkin_not_enabled / checkin_not_open / checkin_closed
invalid_party_size
```

- 체크인 생성은 원자적으로 처리하고, 동일 토큰 반복 요청은 기존 결과를 반환한다(멱등).

## 8.4 공개 API 필수 응답 헤더

```http
Cache-Control: no-store, private
Pragma: no-cache
Referrer-Policy: no-referrer
X-Robots-Tag: noindex, nofollow
```

체크인 페이지 metadata에도 `robots: { index: false, follow: false }` 적용.

## 8.5 관리자 API

```text
GET    /api/admin/checkins
POST   /api/admin/checkins
PATCH  /api/admin/checkins/[id]
DELETE /api/admin/checkins/[id]
GET    /api/admin/seating
POST   /api/admin/seating
PATCH  /api/admin/seating/[id]
DELETE /api/admin/seating/[id]
PATCH  /api/admin/rsvp/[id]/seat
POST   /api/admin/rsvp/[id]/issue-pass
```

관리자 API는 기존 `checkAdmin()` 인증을 반드시 사용한다.

## 8.6 기존 공개 쓰기 표면 폐기 (마이그레이션 필수 항목)

```sql
-- 레거시 anon 직접 insert 정책 제거 (rsvp.sql 의 rsvp_anon_insert)
drop policy if exists "rsvp_anon_insert" on public.rsvp;
revoke insert, update, delete on public.rsvp from anon;

-- 기존 submit_rsvp 공개 호출 중단
revoke execute on function public.submit_rsvp(
  text, text, text, boolean, int, int, boolean, text, text
) from anon;

-- 기존 submit_checkin(무제한 anon insert) 공개 호출 중단
revoke execute on function public.submit_checkin(text, int, text) from anon;
```

기존 함수는 히스토리 호환을 위해 당장 삭제하지 않아도 되지만 **공개 실행 권한은 반드시 회수**한다.
새 체크인은 서버 API 또는 신규 제한 RPC로만 생성한다.

# 9. 핵심 비즈니스 규칙

1. 참석 RSVP만 개인 QR을 사용할 수 있다.
2. RSVP 한 건은 가족·일행 한 팀을 의미한다.
3. 예상 인원은 `1 + companion_count`이다.
4. 어린이 수는 동반 인원에 포함된 것으로 간주한다.
5. 동일 RSVP의 활성 체크인은 최대 한 건이다.
6. QR을 여러 번 눌러도 중복 체크인이 생성되지 않는다.
7. 실제 방문 인원은 예상 인원과 달라도 저장할 수 있다.
8. 인원이 달라지면 관리자 화면에 차이를 표시한다.
9. 좌석 미배정 상태에서도 체크인은 가능하다.
10. 테이블 정원 초과 상태에서도 체크인은 가능하되 경고한다.
11. 체크인 취소 기록은 삭제하지 않고 상태로 보존한다.
12. 불참으로 변경한 RSVP의 QR은 **같은 트랜잭션에서** 즉시 비활성화한다.
13. 체크인은 관리자가 설정한 기간에만 가능하다 (관리자 수동 체크인은 예외).
14. 공용 체크인은 개인 QR 체크인의 대체 경로로 동작한다.
15. 불참 후 재참석 전환 시 기존 토큰을 재사용하지 않고 로테이션한다.

## 불참 전환 처리 (실행 지점 확정)

`/api/rsvp`의 DB 트랜잭션(= `submit_rsvp_v2`) 안에서 처리한다.

```text
attending: true → false
- checkin_token_active=false
- 기존 활성 체크인이 있으면 자동 삭제하지 않음
- 관리자 화면에 "RSVP 불참 전환 후 체크인 존재" 경고

attending: false → true
- 기존 토큰이 없으면 신규 발급
- 기존 토큰이 있더라도 신규 토큰으로 로테이션
- checkin_token_active=true / qr_issued_at 갱신
```

# 10. 체크인 운영 시간

`site_settings`(v17)에 **서버 전용** 설정으로 저장한다.

```json
{
  "checkin_enabled": true,
  "checkin_open_at": "2026-10-18T00:30:00+09:00",
  "checkin_close_at": "2026-10-18T07:00:00+09:00"
}
```

- `get_site_settings()` 공개 RPC 화이트리스트에는 **추가하지 않는다**.
- 체크인 API가 service-role로 직접 설정을 조회해 판정하고 `checkin_not_enabled` / `checkin_not_open` / `checkin_closed`를 반환한다.
- 상태별 화면: 오픈 전 "체크인은 예식 당일 오전 10시부터 가능합니다." / 운영 중 정상 / 종료 후 "현장 체크인이 종료되었습니다."
- 관리자 수동 체크인은 운영 시간 제한을 적용하지 않는다.

# 11. 보안·개인정보 요구사항

- QR URL에 이름, 연락처, RSVP ID를 넣지 않는다.
- 공개 API는 전체 전화번호를 반환하지 않는다.
- 토큰 비교는 서버에서만 수행한다.
- 체크인 생성은 원자적으로 처리한다.
- 동일 토큰 반복 요청은 기존 결과를 반환한다.
- 토큰 조회 실패와 존재하지 않는 토큰의 응답을 동일하게 처리한다 (`invalid_pass` 통합).
- 공개 API 응답은 캐시·색인되지 않는다 (§8.4 헤더).
- 체크인 목록은 관리자에게만 공개한다. 좌석별 전체 하객 명단을 공개하지 않는다.
- 행사 종료 후 토큰 일괄 비활성화 기능을 제공한다.
- 개인정보 보존 기간과 삭제 기능을 관리자 화면에 표시한다.
- anon의 `rsvp`·`checkins` 직접 쓰기와 레거시 RPC 공개 실행을 회수한다 (§8.6).

## Rate limit (구현 수단 확정)

인메모리 방식은 서버리스에서 무의미하므로 사용하지 않는다. **Upstash Redis 기반 토큰 버킷**으로 확정.

| API | 제한 예시 |
|---|---:|
| RSVP 제출·수정 | IP당 10회/10분 |
| 패스 조회 | IP당 60회/분 |
| 체크인 생성 | IP당 10회/분 |
| 공용 RSVP 검색 | IP당 20회/10분 |

- 운영 환경에서 Upstash 미설정 시 공개 쓰기 API는 **fail-closed**.
- 관리자 API는 기존 관리자 인증 적용 (rate limit 대상 아님).
- 추가 환경변수 (구현 시 `.env.local.example`에도 반영할 것):

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

# 12. 예외 처리

| 상황 | 동작 |
|---|---|
| QR이 손상됨 | 공용 QR 또는 안내데스크 검색 안내 |
| 이미 체크인됨 | 기존 체크인 시각·인원·좌석 표시 |
| 불참 RSVP의 QR | 체크인 차단 후 안내데스크 문의 |
| RSVP 수정으로 인원 변경 | 최신 예상 인원 표시 |
| 좌석 미배정 | 체크인은 완료하고 안내데스크 안내 |
| 테이블 삭제 시도 | 배정된 RSVP가 있으면 삭제 차단 (FK) |
| 네트워크 오류 | 재시도 버튼과 안내데스크 경로 제공 |
| 동시 체크인 | DB unique 제약으로 한 건만 성공 |
| 실제 인원 0명 | 체크인 불가 |
| 예상보다 많은 인원 | 허용하되 관리자에게 경고 |
| 잘못된 체크인 | 관리자가 취소 후 재체크인 |
| 동명이인 검색 | 전화번호 뒤 4자리 추가 확인 |
| 연락처 없는 레거시 RSVP | 공용 검색 불가 — 안내데스크 수동 체크인으로 처리 |

# 13. UI 요구사항

## 모바일 체크인

- 한 손 조작 큰 버튼 · 인원 스텝퍼(숫자 입력 대신) · 최소 터치 영역 44px · 입력 폰트 16px 이상
- 성공/실패를 색상 + 아이콘 + 문구로 표시 · 연속 클릭 방지 · 처리 중 로딩 표시
- 좌석 번호를 화면에서 가장 크게 표시 · 어르신 모드 적용 · 스크린샷하기 쉬운 좌석 안내 카드

## 관리자 현장 모드

- 모바일·태블릿 우선 · 검색창 상단 고정 · 체크인 버튼 크게
- 도착/미도착을 색상과 텍스트로 구분 · 새로고침 없이 통계 반영
- 체크인 취소는 확인 절차 제공

## 기존 localStorage 처리

- 기존 키 `checkin-done`은 체크인 상태 판단에 사용하지 않으며, 페이지 최초 진입 시 `localStorage.removeItem("checkin-done")`으로 제거한다.
- 개인 QR의 체크인 상태는 항상 서버의 활성 체크인 기록으로 판단한다.
- UI 편의 캐시가 필요하면 `checkin-v2-last-token:<token>` 형식의 토큰별 키를 쓰되, 권위 있는 상태로 사용하지 않는다.

# 14. 통계 정의 (확정 산식)

```text
참석 예정 팀   = count(rsvp) where attending=true
참석 예정 인원 = Σ(1 + companion_count) where attending=true

도착 팀        = count(checkins) where status='active' and rsvp_id is not null
실제 도착 인원 = Σ(actual_party_size) where status='active'      -- 모든 활성 체크인
미도착 팀      = 참석 예정 팀 − 도착 팀

RSVP 체크인 인원 차이
  = Σ(actual_party_size − expected_party_size)
    where status='active' and rsvp_id is not null
  ※ 현장 등록 인원은 포함하지 않는다.

현장 추가 인원
  = Σ(actual_party_size)
    where status='active' and rsvp_id is null
      and source in ('walk_in', 'common_qr')
```

> **legacy 각주**: `source='legacy'` 행(rsvp_id 없음)은 "실제 도착 인원"에는 포함되지만
> "현장 추가 인원"과 "RSVP 인원 차이"에는 포함되지 않는다. 따라서 legacy 데이터가 있는 동안
> `실제 도착 ≠ RSVP연결 도착 + 현장 추가`일 수 있다. 대시보드에 legacy 인원을 별도 표기해 합계 불일치 혼동을 막는다.

## 식사 지표 (MVP 근사치 확정)

```text
식사 예정 인원 = Σ(1 + companion_count) where attending=true and eating='yes'
식사 미정 인원 = Σ(1 + companion_count) where attending=true and eating='undecided'
유아식 요청 팀 = count(rsvp) where attending=true and kids_meal=true
               ※ 현재 스키마에 유아식 개수가 없으므로 팀 수로만 집계 (수량으로 해석 금지)
실제 식사 인원 = Σ(meal_count) where status='active'
               ※ meal_count 는 0..actual_party_size 범위 (DB check 제약)
```

# 15. CSV 내보내기 (MVP 포함 확정)

기존 관리자 export를 확장한다.

**RSVP·체크인 CSV** 추가 컬럼:

```text
RSVP ID / 이름 / 연락처 / 신랑·신부측 / 참석 여부 / 예상 인원 / 식사 여부 / 유아식 요청
테이블 / 구역 / 체크인 여부 / 체크인 시각 / 실제 도착 인원 / 실제 식사 인원 / 인원 차이 / 체크인 경로
```

- **체크인 토큰과 패스 URL은 일반 RSVP CSV에 넣지 않는다.**

**관리자 전용 `QR 발송 목록` CSV** (별도 내보내기):

```text
이름 / 연락처 / 패스 URL / QR 발급 시각 / 토큰 활성 상태
```

# 16. 완료 조건

## MVP 기본 조건

- RSVP 제출 후 개인 QR을 확인할 수 있다.
- QR에는 개인정보가 포함되지 않는다.
- QR을 열면 정확한 예상 인원이 표시된다.
- 한 QR로 체크인이 중복 생성되지 않는다.
- 실제 방문 인원을 변경할 수 있다.
- 체크인 성공 후 배정된 테이블이 표시된다.
- 좌석 미배정 상태에서도 체크인할 수 있다.
- 관리자가 테이블을 생성·수정할 수 있다.
- 관리자가 RSVP 팀을 테이블에 배정할 수 있다.
- 관리자가 도착·미도착 하객을 검색할 수 있다.
- 관리자가 체크인 인원을 수정·취소할 수 있다.
- 공용 QR로 현장 하객을 등록할 수 있다.
- 관리자 통계에서 예상 인원과 도착 인원이 구분된다.
- 동시 체크인 테스트에서 한 건만 저장된다.
- 불참으로 변경한 RSVP QR이 차단된다.
- 체크인 운영 시간 밖에서는 공개 체크인이 차단된다.

## 개정 추가 조건

- 기존 `attending=true` RSVP 전건에 토큰이 발급된다.
- 토큰이 없는 RSVP는 `checkin_token_active=true`가 될 수 없다 (check 제약).
- 기존 체크인의 한글 side가 영문 코드로 변환된다.
- 기존 체크인은 모두 `source='legacy'`로 보존된다.
- RSVP 인원 차이와 현장 추가 인원이 분리 집계된다.
- 식사 예정·미정·실제 식사 인원의 산식이 서로 구분된다.
- anon 사용자는 `rsvp`와 `checkins`에 직접 insert할 수 없다.
- 기존 `submit_rsvp`, `submit_checkin` RPC를 anon이 호출할 수 없다.
- 기존 RSVP 수정 응답에서 저장된 토큰이 노출되지 않는다.
- 불참 전환 시 같은 트랜잭션에서 토큰이 비활성화된다.
- 재참석 또는 관리자 재발급 시 토큰이 로테이션된다.
- 운영 시간 밖의 공개 체크인이 거부된다.
- 체크인 응답이 브라우저·CDN에 캐시되지 않는다.
- 기존 `checkin-done` 값이 화면 흐름에 영향을 주지 않는다.
- 배정된 테이블은 DB FK에 의해 삭제가 차단된다.
- rate limit이 여러 서버리스 인스턴스에서 동일하게 작동한다.

# 17. 개발 순서 (확정)

1. `seating_tables` 생성
2. `rsvp` 토큰·테이블 컬럼 추가
3. 기존 참석 RSVP 전건 토큰 백필
4. `checkins` v2 컬럼 및 영문 side 마이그레이션
5. 기존 체크인에 `source='legacy'` 백필
6. 기존 anon insert 정책과 RPC 실행 권한 회수
7. `site_settings` 체크인 운영 시간 설정 추가
8. Upstash 기반 rate limit 구성 (+ `.env.local.example`에 UPSTASH 키 반영)
9. 서버 기반 `/api/rsvp` 구현 (`submit_rsvp_v2`)
10. 신규 RSVP 토큰 일회 반환 구현
11. 불참 전환·재참석 토큰 로테이션 구현
12. 개인 QR 및 패스 조회 API 구현
13. 원자적·멱등 체크인 API 구현
14. 기존 `/checkin` localStorage 의존 제거
15. 공용 QR RSVP 검색 및 현장 등록 구현
16. 관리자 테이블·좌석 배정 UI 구현
17. 관리자 체크인 수정·취소·병합 구현
18. 통계 산식과 현장 운영 대시보드 구현
19. RSVP·체크인 CSV 확장 + QR 발송 목록 내보내기
20. 동시 요청·권한·마이그레이션 테스트 (모바일 실기기 포함)

> 1~6단계는 하나의 마이그레이션 파일(`db/v24_checkin_v2.sql` 권장)로 묶어 순서를 보장한다.
> `table_id` FK가 `seating_tables`를 참조하므로 테이블 생성이 반드시 선행되어야 한다.
