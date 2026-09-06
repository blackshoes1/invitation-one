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
