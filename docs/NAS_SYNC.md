# 하객 스냅 → 시놀로지 DS920+ 자동 아카이브 (GS-5)

하객이 올린 사진은 Supabase Storage `guest-photos` 버킷에 저장됩니다.
DS920+의 **Cloud Sync**가 이 버킷을 NAS 폴더로 자동 내려받아 원본을 보관합니다.
NAS를 외부에 개방할 필요가 없어 안전합니다.

## 1. Supabase에서 S3 액세스 키 발급

1. Supabase 대시보드 → 프로젝트(Invitation) → **Project Settings → Storage**
2. **S3 Connection** 섹션에서 확인/발급:
   - **Endpoint**: `https://ljrwfhcksjjdmvtwpxdh.storage.supabase.co/storage/v1/s3`
   - **Region**: `ap-northeast-1` (프로젝트 리전)
   - **Access key / Secret key**: "New access key"로 발급 → 안전하게 보관
   - (S3 연결이 비활성화면 "Enable" 먼저)

## 2. DS920+ Cloud Sync 설정 (DSM 7)

1. **패키지 센터**에서 **Cloud Sync** 설치 후 실행
2. **+** → 클라우드 공급자 목록에서 **S3 Storage** (또는 "S3 Compatible Storage") 선택
3. 연결 정보 입력:
   - **Server address / Endpoint URL**: 위 Supabase S3 Endpoint 호스트
     (예: `ljrwfhcksjjdmvtwpxdh.storage.supabase.co`, 경로형 URL 옵션 사용)
   - **Signature version**: v4
   - **Access key / Secret key**: 1단계에서 발급한 값
   - **Bucket**: `guest-photos`
4. 동기화 설정:
   - **로컬 경로**: NAS의 원하는 폴더 (예: `/photo/wedding-snaps`)
   - **동기화 방향**: **원격 → 로컬만 다운로드** (Download remote changes only)
     → NAS에서 지운 게 원본에 영향 주지 않도록 단방향 권장
   - **스케줄**: 실시간 또는 5~15분 간격
5. 적용 → 첫 동기화 후 `snap/` 폴더의 사진들이 NAS로 내려옵니다.

## 참고

- 앱에서 하객이 사진을 올리면 → 버킷 `snap/…jpg` 생성 → 다음 동기화 때 NAS로 복사.
- 관리자 페이지 "하객스냅" 탭에서 **삭제**하면 버킷 파일도 지워집니다.
  단방향(다운로드 전용)이면 이미 NAS로 내려온 원본은 그대로 남습니다.
- 사진은 업로드 전 브라우저에서 압축(긴 변 2000px) + **EXIF(위치정보) 제거**됩니다.
- 용량이 커지면 버킷을 주기적으로 비우고 NAS 원본만 보관해도 됩니다.
