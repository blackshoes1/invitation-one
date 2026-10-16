# 운영 배포의 이전 커밋 덮어쓰기 방지

운영 대상은 Vercel `invitation-one` 프로젝트와 `https://kkachi.vercel.app`이다.
GitHub `blackshoes1/invitation-one`의 `main` 최신 커밋만 운영 빌드를 통과한다.

## 적용 방식

Vercel **Project Settings → Build and Deployment → Build Command**에
`scripts/deploy/production-guard.mjs --project-settings`가 생성하는 `buildCommand`를 설정한다.
검사 코드를 명령 안에 포함하므로 이 파일이 없던 과거 커밋의 재배포도 검사한다.
저장소 파일만 실행하도록 설정하면 과거 소스에서 검사가 사라지므로 그렇게 바꾸지 않는다.

1. 빌드 시작 직전에 Vercel의 배포 브랜치가 `main`인지 확인한다.
2. 공개 GitHub 저장소에 `git ls-remote`로 조회한 최신 `main` SHA와 비교한다.
3. `npm run build`가 성공한 직후 같은 검사를 다시 실행한다. 빌드 중 `main`이 바뀌면 실패한다.
4. 구버전, 누락된 Git 정보, 조회 오류/20초 시간 초과는 모두 빌드 실패로 처리한다. 기존 운영 배포는 유지된다.

Preview와 로컬 빌드는 영향을 받지 않는다. 최신 커밋의 정상 재배포는 허용한다.
별도 토큰이나 GitHub Actions 실행 시간에 의존하지 않는다.
공개 저장소가 비공개로 변경되면 조회 인증 방식부터 검토해야 한다.

## 변경과 검증

```sh
node --test scripts/deploy/production-guard.test.mjs
node scripts/deploy/production-guard.mjs --project-settings
```

두 번째 명령의 JSON을 검토한 뒤, 인증된 Vercel CLI의
`api /v9/projects/prj_9BQshOpd1X5K86ZvoX77b4FJDXlu -X PATCH --input <json-file>`로 적용한다.
팀 scope는 `geunyoungs-projects-0d71c3ce`다. 응답의 환경변수나 비밀 값은 출력하지 않는다.
적용 후 프로젝트의 `buildCommand`가 생성된 명령과 같은지 읽어서 비교한다.

`vercel.json`의 `buildCommand`는 프로젝트 설정보다 우선하므로 추가하지 않는다.
검사 로직을 고칠 때는 테스트와 프로젝트 설정을 함께 갱신한다.
프로젝트 Build Command의 256자 제한 때문에 250자의 독립적인 셸 명령을 사용한다.
테스트는 생성된 실제 명령을 Bash에서 실행하며 GitHub 조회와 Next 빌드만 대역으로 바꾼다.

## 운영 규칙과 범위

- 정상 배포는 최신 `main` push로 진행한다. 예전 SHA를 재배포해 복구하지 않는다.
- 구버전 소스는 검사 실패가 정상이다. 검사를 지우거나 빌드 명령을 재정의하지 않는다.
- 이미 빌드된 배포를 **Promote / Instant Rollback / alias 변경**으로 강제 지정하는 관리자 작업,
  `--prebuilt` 업로드는 원격 빌드를 거치지 않으므로 이 검사 범위 밖이다.
  이런 작업은 명시적인 롤백 요청을 받은 경우에만 수행하고, 평소 배포에 사용하지 않는다.
- 마지막 검사와 Vercel의 도메인 할당은 원자적 작업이 아니다. 그 짧은 사이에 `main`이 바뀌는
  경우까지 잠그는 전역 배포 잠금은 제공하지 않는다. 이 검사는 구버전 재빌드 및 빌드 중 역전환을 막는다.

공식 근거: [Build Command 우선순위](https://vercel.com/docs/project-configuration/vercel-json#buildcommand),
[프로젝트 설정 API](https://vercel.com/docs/rest-api/projects/update-an-existing-project),
[Promote와 Rollback](https://vercel.com/docs/deployments/promoting-a-deployment).
