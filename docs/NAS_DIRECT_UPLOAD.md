# NAS 직접 사진 업로드

## 개발 완료와 실제 연결은 별개

이 코드는 NAS 업로드 서비스를 제공하지만 NAS에 설치하거나 운영 설정을 전환하지는 않았습니다. `GUEST_PHOTO_STORAGE=nas` 설정 전에는 기존 Supabase 업로드가 유지됩니다. NAS 모드를 켠 뒤 NAS가 꺼지거나 연결이 실패하면 오류를 표시하며 Supabase에 대신 저장하지 않습니다.

사용자가 확인한 NAS 주소는 `https://bokbok9.synology.me:1018/`입니다. 1018 포트에서 어떤 서비스가 실행 중인지는 확인되지 않았습니다. **이 주소가 DSM 관리 화면이면 업로드 주소로 사용하지 말고 그대로 유지하세요.** 아래는 별도 HTTPS 포트 10443을 사용하는 설치 예시입니다. 실제 사용 가능 여부와 공유기 연결은 NAS에서 확인해야 합니다.

## 데이터 흐름

1. 청첩장 서버가 현재 업로드 세션·횟수·파일 크기를 확인하고, 파일 경로·해시·작성자에 묶인 10분짜리 권한을 발급합니다.
2. 하객 브라우저가 사진 본문을 NAS로 직접 PUT 전송합니다. Vercel과 Supabase Storage를 통과하지 않습니다.
3. NAS는 서명·크기·실제 파일 형식·SHA-256을 검증하고 파일을 저장한 후 서명된 완료 확인서를 반환합니다.
4. 청첩장 서버는 확인서와 NAS 파일 존재·해시를 확인하고 Supabase DB에 사진 주소·작성자·축하글만 저장합니다. 같은 확인서를 다시 처리해도 기존 ID를 재사용하며 숨김 상태를 덮어쓰지 않습니다.
5. 앨범은 NAS 사진을 직접 표시합니다. 기존 Supabase 사진도 계속 표시됩니다.

현재 브라우저의 프레임 적용·압축 동작을 유지합니다. 촬영 원본을 따로 저장하는 변경은 아닙니다. 전처리에 실패하거나 압축 결과가 더 크면 기존 동작에 따라 입력 파일을 사용하므로 모든 사진에서 EXIF 제거를 보장하지는 않습니다.

## NAS 설치

1. Container Manager를 설치하고 `ops/nas-upload` 전체를 `/volume1/docker/invitation-nas-upload`에 복사합니다.
2. 사진 폴더 `/volume1/photo/wedding-direct`를 만듭니다. 실행할 NAS 사용자에게 읽기·쓰기 권한을 줍니다.
3. `env.example`을 `.env`로 복사합니다. `id 사용자명`으로 확인한 UID/GID를 입력하고, 필요하면 사진 폴더 경로를 바꿉니다.
4. `openssl rand -hex 32` 등으로 무작위 비밀키를 생성해 `.env`의 `NAS_PHOTO_SECRET`에 입력합니다. 같은 값을 나중에 Vercel **서버 전용** 변수에 넣습니다. DSM 비밀번호나 Supabase 서비스 키를 사용하지 마세요. 키를 GitHub나 채팅에 게시하지 않습니다.
5. `ALLOWED_ORIGINS=https://kkachi.vercel.app`을 설정합니다. 다른 실제 청첩장 도메인이 있으면 쉼표로 추가합니다. 와일드카드는 지원하지 않습니다.
6. Container Manager 프로젝트로 `compose.yaml`을 실행하거나 NAS 터미널에서 실행합니다.

```sh
cd /volume1/docker/invitation-nas-upload
docker compose up -d
docker compose ps
docker compose logs --tail=50 nas-photos
curl --fail http://127.0.0.1:18080/health
```

health 응답은 `{"service":"invitation-nas-photos","version":1}`입니다. 이 검사는 서비스와 폴더 접근만 확인하며 실제 저장 검증은 아래 사진 테스트가 필요합니다.

## HTTPS 연결

DSM 역방향 프록시에서 별도 규칙을 만듭니다. DSM 버전에 따라 로그인 포털의 고급 설정 또는 응용 프로그램 포털에 있습니다.

| 항목 | 예시 |
| --- | --- |
| 외부 프로토콜 | HTTPS |
| 외부 호스트 | bokbok9.synology.me |
| 외부 포트 | 10443 (사용 가능 여부 확인) |
| 내부 프로토콜 | HTTP |
| 내부 호스트 | 127.0.0.1 |
| 내부 포트 | 18080 |

유효한 `bokbok9.synology.me` TLS 인증서를 이 규칙에 지정합니다. 공유기를 사용한다면 외부 TCP 10443을 NAS의 같은 포트로 연결합니다. 내부 HTTP 18080은 공개하지 않습니다. 기존 DSM 1018 포트 설정은 변경하지 않습니다. 역방향 프록시는 PUT·HEAD·DELETE·OPTIONS와 Authorization 헤더를 전달하고, 최소 6MB 요청 본문과 90초 전송 시간을 허용해야 합니다. TLS 검사 무시 옵션으로 우회하지 마세요.

휴대폰의 Wi-Fi를 끄고 `https://bokbok9.synology.me:10443/health`에서 서비스 JSON이 나오는지 확인합니다. DSM 로그인 화면이나 HTML이 나오면 업로드 서비스로 연결된 것이 아닙니다.

## 청첩장 설정과 전환

NAS 확인 후 Vercel 서버 환경변수에 아래를 설정하고 재배포합니다. 주소는 경로 없는 HTTPS origin으로 설정합니다.

```text
GUEST_PHOTO_STORAGE=nas
NAS_PHOTO_BASE_URL=https://bokbok9.synology.me:10443
NAS_PHOTO_SECRET=NAS의 .env에 설정한 동일한 무작위 키
```

`NEXT_PUBLIC_` 접두사를 붙이지 않습니다. 키는 서버와 NAS만 보관합니다. 주소는 업로드 권한 응답으로 브라우저에 전달됩니다. CSP와 이미지 허용 목록에도 적용되므로 변수 변경 후 재배포가 필요합니다.

먼저 Preview에서 테스트한다면 해당 Preview의 정확한 origin을 NAS `ALLOWED_ORIGINS`에 추가하고 컨테이너를 다시 생성합니다. 검증 후 운영 환경에 적용합니다.

## 실제 연결 검증 순서

- 사진 한 장 업로드: 브라우저 네트워크에서 NAS로 PUT이 전송되고 `/api/guest-photos/direct`에는 JSON만 전송되는지 확인합니다.
- NAS의 `snap/UUID.jpg` 등을 실제로 열고 앨범 표시를 확인합니다. Supabase Storage에 새 파일이 생성되지 않아야 합니다.
- 관리자 숨김/공개를 확인합니다. 숨김은 앨범 목록에서만 제외하며 URL을 이미 아는 사람의 접근까지 차단하지 않습니다. 기존 공개 사진 정책과 같습니다.
- 관리자 삭제 시 NAS 파일이 삭제되고 주소가 410으로 응답하는지 확인합니다. 삭제 표식은 `deleted` 폴더에 남아 만료 전 업로드 권한 재사용을 차단합니다.
- NAS 서비스를 중지한 상태에서 새 업로드가 실패하고 Supabase로 우회 저장되지 않는지 확인한 뒤 서비스를 다시 시작합니다.

## 장애·보관

NAS는 새 사진의 주 저장소입니다. 전원·인터넷·디스크 장애 시 새 업로드와 NAS 사진 보기가 중단됩니다. 별도 NAS 백업은 사용자가 설정해야 하며, 앞서 만든 Supabase→NAS 복사 프로그램과는 용도가 다릅니다.

메타데이터 등록만 실패하면 동일 확인서로 최대 3회 자동 재시도합니다. 끝내 실패하면 사진 파일만 NAS에 남을 수 있습니다. 이 파일은 자동으로 지우지 않습니다. 관리자 삭제 중 DB 장애가 나면 재시도하여 행 삭제를 완료하세요. 삭제 표식 폴더를 임의로 지우지 마세요.

기존 Supabase 사진은 이전하지 않습니다. 롤백은 `GUEST_PHOTO_STORAGE=supabase` 후 재배포합니다. 이미 등록된 NAS 사진을 표시·삭제하려면 NAS 서비스와 URL/비밀키 설정은 유지해야 합니다. NAS 주소 변경은 기존 DB 사진 주소 이전 작업도 필요합니다.

자동 검증: `npm test`, `node --test ops/nas-upload/server.test.mjs`. CI는 실제 운영 데이터 대신 임시 폴더와 공식 Node 컨테이너로 업로드·검증·중복 확인·삭제 후 재업로드 차단을 검증합니다. 실제 NAS 접속과 업로드는 위 절차를 마쳐야 검증 완료입니다.
