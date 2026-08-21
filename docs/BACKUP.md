# DB 백업

신청·방명록·RSVP·체크인 등 모든 실데이터는 Supabase 한 곳에 있고
무료 티어는 자동 백업이 없으므로, 아래 스크립트로 수동 백업합니다.

## 사용법

```bash
npm run backup
```

- 모든 테이블을 `backups/<날짜시각>/<테이블>.json` 으로 저장합니다 (git 미추적)
- `.env.local` 의 Supabase 접속 정보를 사용합니다 (별도 설정 불필요)

## 권장 시점

- **예식 전날 + 당일 아침** 각 1회 (가장 중요)
- 평소엔 주 1회 정도, 신청이 몰린 날 저녁

## 복원

```bash
npm run restore -- backups/<스탬프>            # 폴더 안 모든 테이블
npm run restore -- backups/<스탬프> rsvp,checkins
```

- 기본키 기준 **upsert** — 백업에 있는 행은 되살리고/덮어쓰고, 백업에 없는 행은 건드리지 않습니다 (삭제 동기화 없음).
- FK 부모(groups → deliveries → participants …)부터 넣도록 스크립트가 순서를 맞춥니다.
- 특정 행만 되돌릴 땐 JSON 에서 필요한 행만 남겨 복원하거나 SQL Editor 에서 직접 넣으면 됩니다.
- 복원 전 현재 상태를 한 번 더 `npm run backup` 해 두세요.

## 포함되지 않는 것

- **Storage 사진 원본**
  - `guest-photos`(하객 스냅): NAS Cloud Sync 로 자동 보관 — `docs/NAS_SYNC.md`
  - `invitation-media`(갤러리/앨범/메인): 원본을 이미 갖고 있는 사진들.
    필요 시 Supabase 대시보드 → Storage 에서 수동 다운로드
- 새 테이블을 만들면 `scripts/backup-db.mjs` 의 `TABLES` 목록에 추가하세요
