# 하객 사진 NAS 자동 보관

`ops/photo-archive`의 Docker 프로그램이 Supabase `guest-photos`를 5분마다 NAS로 복사합니다. **코드 배포만으로 연결되지는 않습니다.** NAS 설치와 최초 복사 확인이 필요합니다.

## 저장 방식

- 업로드와 청첩장 사진 표시는 기존 Supabase를 사용합니다. NAS가 외부로 접속하므로 인터넷에 NAS 포트를 열 필요가 없습니다.
- NAS에는 `guest-photos/snap/파일명`으로 저장됩니다. 현재 앱이 업로드하는 압축·프레임 적용본이며, 촬영 원본 보관 기능은 아닙니다.
- 이미 복사된 사진은 청첩장에서 삭제해도 NAS에 남습니다. 같은 경로의 다른 내용은 덮어쓰지 않고 오류로 보고합니다.
- 최초 복사 전에 삭제된 사진은 보관할 수 없습니다. NAS가 꺼져 있으면 다시 켠 후 남아 있는 사진을 가져옵니다.
- 이름·축하글 등 DB 정보는 포함되지 않습니다. DB 백업은 [BACKUP.md](BACKUP.md)를 참고하세요.
- 청첩장에 표시할 사진은 NAS 복사 후에도 Supabase에서 삭제하지 마세요. 웹페이지는 계속 Supabase 주소를 사용합니다.

## 시놀로지 DSM 7 / Container Manager 설치

1. Container Manager를 설치합니다. `ops/photo-archive` 폴더 전체를 NAS의 `/volume1/docker/invitation-photo-archive`로 복사합니다.
2. 사진 폴더 `/volume1/photo/wedding-snaps`를 만듭니다. 다른 경로는 `compose.yaml`의 `/volume1/photo/wedding-snaps:/archive`에서 왼쪽만 변경합니다.
3. 실행할 NAS 사용자에게 사진 폴더 쓰기 권한과 프로그램 폴더 읽기 권한을 부여합니다. NAS SSH에서 `id 사용자명`으로 UID/GID를 확인합니다. `.env.example`을 `.env`로 복사해 두 숫자를 입력합니다. 사진은 이 사용자 소유로 저장됩니다.
4. Supabase Dashboard → 프로젝트 → Storage → S3 연결 설정에서 endpoint, region, Access Key ID, Secret Access Key를 확인하거나 발급합니다. `rclone.conf.example`을 `rclone.conf`로 복사해 입력합니다. region은 대시보드 값을 그대로 사용합니다.
5. S3 키는 Storage 전체에 접근하며 RLS를 우회합니다. 채팅·GitHub·프런트엔드 환경변수에 넣지 마세요. `rclone.conf`를 실행 사용자만 읽도록 권한을 제한하고 NAS에만 보관합니다. 프로그램은 사진 읽기만 수행하지만 키 자체는 읽기 전용이 아닙니다.
6. 아래 최초 확인을 마친 뒤 Container Manager → 프로젝트 → 생성에서 해당 폴더의 `compose.yaml`을 선택해 시작합니다. SSH에서는 `up -d`로 시작할 수 있습니다.

## 최초 연결 확인

NAS 터미널에서 실행합니다. DSM 설정에 따라 Docker 명령에 관리자 권한이 필요합니다.

```sh
cd /volume1/docker/invitation-photo-archive
# 복사 예정 항목 확인. 성공 상태를 기록하지 않음.
docker compose run --rm --no-deps photo-archive --dry-run
# 최초 복사
docker compose run --rm --no-deps photo-archive --once
cat /volume1/photo/wedding-snaps/.archive-status/last-result
cat /volume1/photo/wedding-snaps/.archive-status/last-success
```

`last-result`가 `success`인지 확인하고 `guest-photos/snap`에서 실제 사진을 열어 보세요. 소스가 비어 있으면 복사할 사진도 없습니다. 저장 경로를 바꿨다면 확인 경로도 변경합니다. 확인 후 자동 실행합니다.

```sh
docker compose up -d
docker compose ps
docker compose logs --tail=50 photo-archive
```

자동 실행 중에는 `--once`를 동시에 실행하지 마세요.

## 운영과 오류 확인

- NAS 재시작 후 컨테이너가 자동 재시작합니다. 복사 실패 시 로그와 `last-result=failed`를 남기고 다음 주기에 재시도합니다. 마지막 성공 시간은 유지합니다.
- healthcheck는 마지막 결과와 성공 시간을 검사합니다. 실패하거나 성공 기록이 오래되면 `unhealthy`입니다. 최초 대용량 복사 중에도 완료 전에는 unhealthy일 수 있습니다. 별도 알림 발송 기능은 없습니다.
- 인증 실패: endpoint·region·키와 인터넷 연결을 확인합니다. 키 교체 후 재시작합니다.
- 권한 오류: `.env` UID/GID와 NAS 폴더 권한을 확인합니다. 디스크 공간 부족은 공간 확보 후 재시도됩니다.
- 동일 경로 내용 충돌: 양쪽 파일을 확인하고 NAS 사본을 다른 폴더에 보관한 뒤 재실행하면 원격 파일을 새로 복사할 수 있습니다. 자동 덮어쓰기는 하지 않습니다.
- 완전 삭제하려면 NAS 사본도 직접 삭제해야 합니다. Supabase에 사진이 남아 있으면 다음 복사 때 다시 생깁니다.
- 초기 복사·재다운로드는 Supabase 트래픽을 사용합니다. NAS 용량과 사용량을 확인하세요.

## 검증 범위

CI는 공식 rclone 컨테이너와 임시 파일로 신규 복사, 반복 실행, 소스 삭제 후 사본 유지, 충돌 거부, 상태 기록을 검증합니다. 실제 NAS 권한·네트워크·Supabase 키 연결은 설치 시 최초 확인이 필요합니다.

공식 문서: [rclone copy](https://rclone.org/commands/rclone_copy/), [Docker 설치](https://rclone.org/install/#docker), [Supabase S3 인증](https://supabase.com/docs/guides/storage/s3/authentication).
