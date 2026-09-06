# 그룹/개인 주문 분리 — 1단계 현황 조사

작성: 2026-09-06 · 조사 시점 커밋 `bb4aa5c` · **코드 변경 없음, 조사 결과만**

2단계(설계안 제시) 전에 사실을 고정해 두기 위한 문서다. 여기 적힌 내용은
운영 DB 와 코드에서 직접 확인한 것이고, 추측한 부분은 그렇게 표시했다.

---

## 요약

**1. 주문의 종류는 어디에도 저장돼 있지 않다.** `deliveries` 에 `kind` 같은
컬럼이 없고, 개인/그룹은 `group_id` 의 null 여부로만 사후 추론된다. 그래서
같은 판정이 **5곳에서 각자 다시 계산**된다.

**2. 판정 입력에 하객이 만질 수 있는 값이 섞여 있다.** 연락처 토글
(`useInvitePhone`)이 판정에 들어가서, 하객이 "다른 번호 쓰기"를 누르면
**그 사람이 명단의 누구인지 연결이 끊긴다.** (아래 결함 ①)

**3. 애매한 제3상태는 아직 실제로 발생하지 않았다.** 개인 초대 링크가 1건만
발급됐기 때문이다. 링크를 본격적으로 뿌리기 시작하면 바로 생긴다 —
**지금이 고치기 가장 싼 시점이다.**

---

## 1. 개인/그룹이 갈리는 지점 (5곳)

| # | 위치 | 판정 근거 | 신뢰 주체 |
|---|---|---|---|
| ① | `DeliveryForm.tsx:214` | `!group?.id && useInvitePhone && inviteToken` | 클라이언트 |
| ② | `api/delivery/create/route.ts:50-52` | `b.personal` 를 그대로 신뢰 → `groupId` 결정 | 클라이언트 값 |
| ③ | `api/delivery/join/route.ts:50` | `d.group_id !== null && !== invite.groupId` 면 거부 | 서버 |
| ④ | `api/admin/groups/[id]/members/route.ts:32-39` | `group_id` 유무로 `personal` 재계산 | 서버(읽기) |
| ⑤ | `delivery/group/[groupId]/page.tsx:49` | `invite.groupSlug === slug` 아니면 토큰 무시 | 클라이언트 |

RPC 층(`create_delivery_v3` → `create_delivery_v2`)에는 **개인/그룹 개념이 아예
없다.** `p_group_id` 를 그대로 받아 넣을 뿐이고, `p_invite_token` 은 연락처를
채우는 용도(`_invite_phone`)로만 쓴다. 즉 판정은 전부 앱 계층에 있다.

### ②가 특히 문제인 이유

```ts
const personal = b.personal === true;                       // 클라이언트 body
const groupId = personal ? null : invite ? invite.groupId : clientGroupId;
...
if (invite) await linkGroupMember(row.participant_id, invite.memberId);  // personal 무관
```

주석은 "초대가 있으면 group 은 항상 토큰의 group (클라이언트 값 불신)"이라고
돼 있지만, 실제로는 **`personal` 한 줄로 그 원칙이 우회된다.** 클라이언트가
`personal: true` 를 보내면 서버는 검증 없이 그룹을 떼어낸다.

권한 문제는 아니다(그룹을 *바꿔치기*하는 게 아니라 *없애는* 것이라 남의 그룹에
끼어들 수 없다). 하지만 "종류를 클라이언트가 정한다"는 구조 자체가 분리의
걸림돌이다.

---

## 2. 가능한 주문 상태와 운영 데이터 분포

`deliveries.group_id` × `participants.group_member_id` 조합:

| 상태 | group_id | 명단 연결 | 주문 | 참여자 | 실제 주문상태 |
|---|:---:|:---:|---:|---:|---|
| **A** 그룹주문 + 명단연결 | 있음 | 있음 | 3 | 10 | 대기중·완료·확정 |
| **B** 그룹주문 + 명단연결 없음 | 있음 | 없음 | 7 | 8 | 대기중·완료·취소 |
| **C** 개인주문 + 명단연결 ← 제3상태 | 없음 | 있음 | **0** | 0 | — |
| **D** 순수 개인주문 | 없음 | 없음 | 6 | 6 | 대기중·완료·취소 |

합계 16주문 / 24참여자. 명단(49명) 중 신청 연결은 10명이고, 전부 A 에 있다.

### B 가 7건이나 되는 이유

그룹 링크(`/delivery/group/<slug>`)로 들어와 **초대 토큰 없이** 이름만 적고
신청한 경우다. 그룹 주문이지만 명단의 누구인지는 모른다. 현재 명단 49명 중
연락처 보유자가 1명뿐이라 개인 초대 링크를 거의 못 뿌렸고, 그래서 대부분이
이 경로로 들어왔다.

### C 는 왜 0건인가 — 그리고 이게 왜 중요한가

C 를 만들려면 개인 초대 링크(`/delivery?i=`)로 들어와 초대 연락처를 그대로
쓰고 신청해야 한다. 그런데 **개인 초대 발급이 지금까지 1건뿐**이라 아직
발생하지 않았다.

즉 **C 는 설계상 만들어질 수 있는데 아직 안 만들어진 상태**다. 프롬프트 1단계
질문("제3상태가 의도인가 부작용인가")에 대한 답:

> **의도된 것이다.** `create/route.ts:47-49` 주석이 "명단 연결(group_member_id)은
> 그대로라 관리자는 누가 신청했는지 볼 수 있다"고 명시하고, 어드민 UI 도
> `신청(개인)` 배지로 이 상태를 표현한다(`GroupsTab.tsx:770-772`).
>
> **다만 이름이 잘못됐다.** 이건 "개인 주문"이 아니라 *"명단에 속한 사람이
> 그룹과 별개로 낸 주문"* 이다. 진짜 개인 주문(D, 명단과 무관한 하객)과
> 데이터상 구분되지 않는다 — 둘 다 `group_id = null` 이다. 구분은 오직
> `group_member_id` 유무로만 가능하고, 그마저 아래 결함 ①로 소실될 수 있다.

---

## 3. 조사 중 발견한 결함 3개

### ① 하객이 "다른 번호 쓰기"를 누르면 명단 연결이 끊긴다 — 영향 큼

`useInvitePhone` 은 초대 링크로 들어오면 `true` 로 시작하고, 하객이
"다른 번호 쓰기"(`InvitePhoneBox`)를 누르면 `false` 가 되는 **일방향 토글**이다
(`DeliveryForm.tsx:51, 330`). 되돌리는 UI 는 없다.

`false` 가 되면 제출 payload 에서 `inviteToken: null` 이 되고
(`DeliveryForm.tsx:212`), 서버는 초대가 없다고 판단해 `linkGroupMember` 를
실행하지 않는다(`create/route.ts:100`).

**결과: 관리자가 "이 사람이 명단의 누구인지" 를 잃는다.** 하객이 회사 번호 대신
개인 번호를 쓰고 싶었을 뿐인데, 명단 관리가 깨진다.

- 개인 링크에서 누른 경우 → 상태 D (순수 개인주문). 명단에선 계속 "미신청"
- 그룹 링크에서 누른 경우 → 상태 B (그룹주문, 명단연결 없음)

현재 B 가 7건인 데에 이 경로가 섞여 있을 수 있다(초대 토큰 없이 들어온 것과
데이터상 구분 불가).

### ② 다른 그룹의 초대 토큰이 조용히 무시된다 — 영향 중간

`delivery/group/[groupId]/page.tsx:49`:

```ts
if (j?.invite && j.invite.groupSlug === slug) setInvite(j.invite);
```

A그룹 멤버가 B그룹 링크를 열면 토큰이 **말없이 버려진다.** 하객에게는 아무
안내가 없고, 폼은 초대 없이 진행돼 B그룹 주문 + 명단연결 없음(상태 B)이 된다.

서버는 이걸 막을 수 없다 — 클라이언트가 토큰을 아예 안 보내기 때문이다.
(`create/route.ts:45-46` 의 `invite_group_mismatch` 403 은 토큰이 전송된
경우에만 동작한다.)

### ③ 어드민의 `personal` 판정이 세 번째 독립 계산이다 — 영향 작음

`api/admin/groups/[id]/members/route.ts:32-39`:

```ts
applied.set(p.group_member_id, applied.get(p.group_member_id) || !!p.group_id);
personal: applied.has(m.id) && applied.get(m.id) === false
```

"한 명이 여러 주문을 냈고 그중 하나라도 그룹 주문이면 그룹으로 표시"라는
규칙인데, 클라이언트(①)·서버(②)의 판정과 무관하게 읽기 시점에 다시 계산된다.
세 곳의 정의가 어긋나면 어드민 표시와 실제 데이터가 다르게 보일 수 있다.

---

## 4. 합석(join)과 그룹 제안 수락(accept) 동작

### 합석 `POST /api/delivery/join`

| 대상 주문 | 초대 토큰 없이 | 초대 토큰 있음 |
|---|---|---|
| 그룹 주문 (같은 그룹) | 허용, 명단 연결 없음 | 허용 + 명단 연결 |
| 그룹 주문 (다른 그룹) | 허용 ⚠️ | **403** `invite_group_mismatch` |
| 개인 주문 (`group_id` null) | 허용, 명단 연결 없음 | 허용 + 명단 연결 → **상태 C 생성** |

⚠️ 토큰 없이 다른 그룹 주문에 합석하는 것은 막히지 않는다. `deliveryId` 만
알면 되는데, 그룹 페이지에 주문 목록이 노출되므로 같은 그룹 사람끼리는 자연히
알 수 있다. 다른 그룹 주문 ID 를 알아내기는 어렵지만 구조적으로 열려 있다.

### 그룹 제안 수락 `POST /api/delivery/group/accept`

`accept_group_offer_v2(p_slug, p_name, p_phone, p_convert_token, p_invite_token)` —
슬러그 기반이라 **항상 그룹 주문에 붙는다.** 개인 주문 경로가 없다.
초대 토큰은 연락처 채우기 용도로만 쓰인다.

---

## 5. 2단계로 넘길 결정 사항

조사만으로는 정할 수 없고, 제품 판단이 필요한 것들:

**(a) "개인 주문"의 정의를 무엇으로 할 것인가**

지금 `group_id = null` 하나에 서로 다른 두 가지가 섞여 있다:
- 명단에 없는 하객이 낸 주문 (상태 D)
- 명단에 있는 사람이 그룹과 별개로 낸 주문 (상태 C)

이 둘을 구분할 것인지, 아니면 "명단 연결"과 "그룹 소속"을 아예 별개 축으로
볼 것인지가 설계의 출발점이다.

**(b) 종류를 저장할 것인가, 계속 파생할 것인가**

`deliveries.kind` 를 두면 판정이 한 곳으로 모이고 어드민 표시가 데이터로
설명된다. 대신 마이그레이션이 필요하고, 기존 16건을 분류해야 한다
(위 표대로면 A·B → group, D → personal 로 기계적 분류 가능).

**(c) 결함 ①을 어떻게 볼 것인가**

"다른 번호 쓰기"를 눌러도 명단 연결은 유지하는 게 맞다고 보는데
(연락처와 신원은 별개 문제다), 이건 분리 작업과 독립적으로 먼저 고칠 수도 있다.
분리 설계를 기다릴 필요가 없는 결함이다.

---

## 부록 — 재현용 쿼리

```sql
-- 상태 분포
with cls as (
  select d.id, d.status, d.group_id,
         count(p.id) n_part, count(p.group_member_id) n_linked
  from deliveries d left join participants p on p.delivery_id = d.id
  group by d.id, d.status, d.group_id)
select case
  when group_id is not null and n_linked > 0 then 'A 그룹+명단'
  when group_id is not null then 'B 그룹only'
  when n_linked > 0 then 'C 개인+명단'
  else 'D 순수개인' end as 상태,
  count(*) 주문, sum(n_part) 참여자
from cls group by 1 order by 1;

-- 명단 연결 현황
select count(*) filter (where phone is not null and phone <> '') 연락처보유,
       count(*) filter (where invite_token_hash is not null) 초대발급,
       count(*) 전체
from group_members;
```

---
---

# 2단계 — 설계안

작성: 2026-09-06 · 1단계 조사 결과를 전제로 함

## 먼저: 조사하면서 내 판단이 바뀐 부분

1단계를 끝내고 "`deliveries.kind` 를 저장하면 나머지가 따라온다"고 말했는데,
FK 정의와 삭제 경로를 확인한 뒤 **그 판단을 수정한다.**

`group_id IS NOT NULL` 은 이미 "그룹 주문"의 결정적이고 올바른 정의다.
문제는 정의가 없는 게 아니라 **그 정의를 5곳에서 각자 다시 계산하고, 그중
하나(클라이언트)가 결정권을 쥐고 있다**는 것이다. 종류를 한 번 더 저장하면
진실의 출처가 둘이 되어 어긋날 수 있는 새 버그 종류가 생긴다.

즉 **문제는 스키마가 아니라 앱 계층에 있다.** 아래 A안이 그 판단을 반영한 것이다.

다만 `kind` 를 둘 근거가 아예 없지는 않다 — 뒤의 "C안" 과 스키마 안정성 항목에서
다룬다.

---

## 스키마 안정성 — 파생이 조용히 바뀔 수 있는가

| FK | 동작 | 결과 |
|---|---|---|
| `deliveries.group_id → groups` | **ON DELETE SET NULL** | 그룹을 지우면 그 그룹 주문이 전부 개인 주문이 된다 |
| `group_members.group_id → groups` | ON DELETE CASCADE | 명단도 함께 사라진다 |
| `participants.group_member_id → group_members` | **ON DELETE SET NULL** | 명단에서 한 명 지우면 그 사람의 신원 연결이 끊긴다 |

**그룹 삭제는 현재 앱에서 도달 불가능하다** — 삭제 API 가 없다
(`api/admin/groups/[id]/route.ts` 에 DELETE 핸들러 없음). Supabase 콘솔에서
직접 지우는 경우에만 발생한다. 그래서 이건 "잠재 위험"이지 "현재 결함"은 아니다.

반면 **명단 한 명 삭제는 도달 가능하다** (`GroupsTab.tsx:313` "명단에서
삭제할까요?"). 지우면 그 사람 주문의 `group_member_id` 가 조용히 null 이 되고,
어드민에서 누구인지 알 수 없게 된다. 이건 실제 결함에 가깝다.

---

## A안 — 판정을 서버 한 곳으로 (스키마 변경 없음) ★ 추천

### 핵심

주문의 종류는 **하객이 어느 링크로 들어왔는가**로만 결정된다. 클라이언트는
그 사실을 계산하지 않고, 서버가 진입 정보로 판정한다.

```
/delivery?i=<token>              → 개인 주문 (group_id = null)
/delivery/group/<slug>[?i=]      → 그룹 주문 (group_id = 그 그룹)
/delivery (토큰 없음)             → 개인 주문
```

### 구체적 변경

1. **클라이언트의 `personal` 플래그 제거.**
   `DeliveryForm.tsx:214` 의 `personal: !group?.id && useInvitePhone && inviteToken`
   를 없앤다. 대신 폼은 자기가 어느 맥락인지만 보낸다 (`groupSlug` 유무).
   `create/route.ts:50` 의 `b.personal === true` 도 제거.

2. **서버가 종류를 판정하는 단일 함수.**
   `src/lib/orderKind.ts` (새 파일):
   ```ts
   /** 주문 종류는 진입 경로가 결정한다. 클라이언트가 보낸 값은 신뢰하지 않는다. */
   export function resolveOrderKind(input: {
     groupSlug: string | null;      // 그룹 페이지에서 왔는가
     invite: ResolvedInvite | null; // 초대 토큰이 유효한가
   }): { kind: 'group' | 'personal'; groupId: string | null }
   ```
   `create` · `join` · 어드민 읽기가 모두 이 함수(또는 같은 규칙)를 쓴다.

3. **명단 연결을 연락처와 분리 (결함 ① 수정).**
   지금은 "다른 번호 쓰기"를 누르면 `inviteToken: null` 이 되어 신원까지 사라진다.
   토큰은 항상 보내고, **연락처를 직접 입력했는지 여부만 별도 플래그로** 보낸다:
   ```ts
   inviteToken,                       // 항상 전송 (신원)
   phone: useInvitePhone ? null : phone.trim(),   // 연락처만 분기
   ```
   서버는 `phone` 이 오면 그걸 쓰고, 없으면 `_invite_phone` 으로 채운다.
   `linkGroupMember` 는 토큰이 유효하면 항상 실행 — 연락처와 무관하게.

4. **타그룹 토큰을 조용히 버리지 않는다 (결함 ② 수정).**
   `group/[groupId]/page.tsx:49` 에서 슬러그 불일치 시 토큰을 무시하는 대신,
   하객에게 안내한다: "이 링크는 ○○ 그룹 초대예요. 그 그룹으로 갈까요?"
   → 맞는 그룹 페이지로 이동시키거나, 개인 주문으로 진행할지 고르게 한다.

### 답해야 할 질문들

| 질문 | 답 |
|---|---|
| 기존 초대 링크가 계속 동작하는가 | **그렇다.** URL 형식·토큰 검증 로직을 바꾸지 않는다 |
| 기존 16건 마이그레이션 | **불필요.** 데이터는 그대로, 해석 규칙만 한 곳으로 모은다 |
| 되돌릴 수 있는가 | **코드 revert 만으로 완전히 되돌아간다.** 스키마·데이터 변경 없음 |
| `group_member_id` | 그룹 소속과 **독립된 신원 축**으로 유지. 오히려 ①수정으로 더 안정적이 됨 |
| 개인 주문에 합석 허용? | **유지**(현행대로 허용). 다만 규칙을 `orderKind.ts` 주석에 명문화 |

### 장점

- 42일 남은 시점에 **스키마·데이터를 건드리지 않는다**
- 실제 결함 두 개(①②)를 같이 고친다 — 이게 사용자가 체감하는 문제다
- 되돌리기가 `git revert` 하나

### 단점

- "종류"가 여전히 파생값이라, 그룹을 DB 에서 직접 지우면 주문이 개인으로 바뀐다
  (현재 도달 불가능하지만 구조적으로 열려 있음)
- 어드민의 `신청(개인)` 배지가 계속 `group_member_id` 에 의존 — 명단 행을 지우면
  표시가 바뀐다

---

## B안 — A안 + `deliveries.kind` 저장

A안을 하고, 거기에 종류를 명시적으로 기록한다.

```sql
alter table deliveries add column kind text
  check (kind in ('group','personal'));

-- 기존 16건 분류: C상태가 0건이라 기계적으로 확정된다
update deliveries set kind = case when group_id is null then 'personal' else 'group' end;

alter table deliveries alter column kind set not null;

-- 두 값이 어긋나지 않게 강제
alter table deliveries add constraint deliveries_kind_shape
  check ((kind = 'group' and group_id is not null)
      or (kind = 'personal' and group_id is null));
```

> 마이그레이션이 지금 안전한 이유: 1단계에서 확인했듯 **상태 C(개인+명단연결)가
> 0건**이라 `group_id` 만으로 모든 기존 행이 결정적으로 분류된다. 개인 초대
> 링크를 본격적으로 뿌린 뒤에는 이 분류가 애매해진다.

### 답해야 할 질문들

| 질문 | 답 |
|---|---|
| 기존 링크 | 동작함 (A안과 동일) |
| 16건 마이그레이션 | 위 UPDATE 한 줄. group_id 기준 결정적 |
| 되돌릴 수 있는가 | **컬럼 DROP 으로 가능.** 다만 CHECK 제약이 붙은 뒤에는 그룹 삭제가 막힌다(ON DELETE SET NULL 이 제약을 위반) — **이게 숨은 비용이다** |
| `group_member_id` | A안과 동일 |
| 합석 | A안과 동일 |

### 장점

- 종류가 데이터로 남아 감사 가능. 어드민 표시가 파생이 아니라 사실
- 그룹이 지워져도 "원래 그룹 주문이었다"가 보존됨

### 단점

- **진실의 출처가 둘.** `kind` 와 `group_id` 가 어긋날 수 있고, CHECK 로 막으면
  이번엔 `ON DELETE SET NULL` 과 충돌한다 (그룹 삭제 시 제약 위반으로 실패).
  FK 를 `ON DELETE RESTRICT` 로 바꾸든지 트리거를 두든지 추가 결정이 필요하다
- 42일 전 운영 DB 스키마 변경. A안보다 되돌리기가 무겁다

---

## C안 — 라우트·API 완전 분리

`/api/delivery/create` 를 `create/personal` 과 `create/group` 으로 나누고,
폼 컴포넌트도 `PersonalOrderForm` / `GroupOrderForm` 으로 분리한다.

### 장점
- 종류가 **URL 자체**로 드러나 재계산 여지가 원천 차단됨
- 각 흐름을 독립적으로 바꿀 수 있음 (그룹 전용 기능 추가가 쉬워짐)

### 단점
- `DeliveryForm` 이 이미 스텝·검증·초대·전환(마음배송→직접배달)을 다 담고 있어
  분리하면 **중복이 크게 생긴다.** 공통 추출까지 하면 작업량이 A안의 몇 배
- 기존 클라이언트가 구 엔드포인트를 호출할 여지 (배포 중 과도기)
- 42일 전에 하기엔 위험 대비 이득이 낮다

**결론: 지금은 아니다.** 예식 후 정리할 항목으로 남긴다.

---

## 추천과 근거

**A안을 먼저 하고, `kind` 저장(B안)은 예식 후로 미룬다.**

근거:

1. **사용자가 겪는 문제는 결함 ①②지, 종류가 저장 안 된 것이 아니다.**
   "다른 번호 쓰기"로 명단 연결이 끊기는 건 지금 당장 데이터를 망가뜨린다.
   A안이 이걸 고친다.

2. **42일 남았다.** A안은 스키마·데이터를 안 건드려 `git revert` 로 완전히
   돌아간다. B안은 운영 DB 에 제약을 추가하고, 그 제약이 기존 FK 동작과
   충돌해 추가 결정을 부른다.

3. **B안의 이득은 지금 실현되지 않는다.** `kind` 가 지켜주는 건 "그룹이 지워져도
   원래 종류를 안다"인데, 그룹 삭제는 현재 도달 불가능하다.

4. **B안은 나중에 해도 비용이 같다** — 단, 개인 초대 링크를 본격적으로 뿌리기
   전에 해야 한다. 상태 C 가 쌓이면 기계적 분류가 애매해진다.
   → **개인 링크 대량 발송 계획이 있다면 그 전에 B안까지 하는 게 맞다.**

### 그래서 결정이 필요한 것

> **개인 초대 링크를 명단 49명에게 본격적으로 뿌릴 계획인가?**
>
> - **예** → A안 + B안을 함께. 링크 뿌리기 전에 종류를 확정해 둔다
> - **아니오 / 미정** → A안만. B안은 예식 후

---

## A안 작업 순서 (합의 시)

1. `src/lib/orderKind.ts` — 판정 단일화. 유닛 테스트 먼저
2. `create` · `join` 라우트에서 `b.personal` 제거, `orderKind` 사용
3. `DeliveryForm` — `personal` 계산 제거, 토큰은 항상 전송·연락처만 분기 (결함 ①)
4. 그룹 페이지 타그룹 토큰 안내 (결함 ②)
5. 어드민 읽기(`members/route.ts`)도 같은 규칙 사용
6. E2E: 개인 링크 신청 / 그룹 링크 신청 / "다른 번호 쓰기" 후에도 명단 연결 유지 /
   타그룹 토큰 안내 / 기존 링크 호환

각 단계는 독립 커밋. 3번(결함 ①)은 단독으로도 가치가 있어 먼저 배포 가능.
