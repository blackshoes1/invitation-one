# 나스로 옮긴 CI·안전망 (시놀로지 DS920+)

작성: 2026-09-08 · 예식 2026-10-18

## 왜 옮겼나

2026-09-08 에 **GitHub Actions 무료 한도가 소진돼 CI 가 통째로 멈췄다.** 증상이
특이한데, 잡이 "실패"로 표시되지만 **스텝을 하나도 실행하지 못한다**:

| | 값 |
|---|---|
| 소요 | 2~9초 |
| `runner_id` | `0` |
| `runner_name` | (빈 값) |
| 로그 | HTTP 404 (아예 없음) |

같은 커밋이 몇 시간 전엔 3분 동안 정상 통과했고, `main` 브랜치도 동시에 같은
증상이었다. 코드 문제가 아니라 **러너를 배정받지 못한 것**이다.

원인은 크론이다. `notify-drain` 이 30분 간격일 때 월 ~1,440분을 먹어 한 번
막혔고(그때 3시간으로 낮췄다), 그 뒤로도 월 ~240분을 계속 압박하다 결국 한도를
넘겼다. 분 단위 반올림 과금이라 1초를 돌아도 1분으로 계산된다.

**self-hosted 러너는 Actions 분을 전혀 소모하지 않는다.** 과금은 GitHub 이
빌려주는 러너에만 붙는다. 그래서 나스로 옮긴다.

> 비공개 저장소라 보안상 문제가 없다. GitHub 이 self-hosted 러너를 말리는 건
> **공개** 저장소 얘기다 — 포크 PR 이 남의 코드를 내 기계에서 실행시킬 수 있어서인데,
> 비공개 저장소에는 해당하지 않는다.

## 지금 어디까지 옮겼나

| | 어디서 도는가 | 상태 |
|---|---|---|
| `notify-drain` 정기 실행 | **나스 DSM 작업 스케줄러** | ✅ 1단계 |
| CI `verify` | **나스 self-hosted 러너** | ✅ 1단계 |
| CI `db-verify` | GitHub 러너 | ⏳ 2단계 |
| CI `e2e-db` | GitHub 러너 | ⏳ 2단계 |

2단계 두 잡은 Docker 소켓과 host 네트워크가 필요해 손이 더 간다. 한도가 막혀 있는
동안 이 둘은 계속 빨간불인데, **끄지 않고 남겨 둔다** — 검증을 지워서 초록을
만드는 건 고장을 감추는 것이다. 그동안은 로컬에서 돌린다:

```bash
docker run -d --name pgverify -p 54322:5432 -e POSTGRES_PASSWORD=postgres postgres:17
bash scripts/db-verify.sh          # 매번 컨테이너를 새로 — 빈 DB 전용이다
bash scripts/e2e-db-ci.sh          # supabase CLI + docker 필요
```

---

## 1단계 ① — 안전망 드레인을 나스로

판정 로직은 `scripts/notify-drain.sh` **한 곳에만** 있다. 나스와 GitHub 이 같은
파일을 쓴다 — 갈라지면 한쪽이 고장을 놓친다.

의존성은 `curl` 뿐이다. DSM 에 `jq` 가 없어서 응답을 grep/sed 로 읽는다.

### 설치

1. 스크립트를 나스에 올린다. 저장소를 통째로 클론해도 되고 파일 하나만 둬도 된다.

   ```bash
   # DSM → 제어판 → 터미널 및 SNMP → SSH 활성화 후
   ssh <계정>@<나스IP>
   mkdir -p ~/ops && cd ~/ops
   curl -fsSLO https://raw.githubusercontent.com/blackshoes1/invitation-one/main/scripts/notify-drain.sh
   chmod +x notify-drain.sh
   ./notify-drain.sh          # 한 번 손으로 돌려 본다
   ```

   정상이면 응답 JSON 과 `총 발송: 0` 이 찍히고 종료 코드가 0 이다.

2. DSM → **제어판 → 작업 스케줄러 → 생성 → 예약된 작업 → 사용자 정의 스크립트**

   | 항목 | 값 |
   |---|---|
   | 작업 이름 | `notify-drain` |
   | 사용자 | 본인 계정 (root 불필요) |
   | 일정 | 매일 · **반복 간격 1시간** |
   | 사용자 정의 스크립트 | `/var/services/homes/<계정>/ops/notify-drain.sh` |

3. **"실행 세부 정보에서 오류 발생 시 이메일 알림" 을 켠다.** 이게 핵심이다 —
   스크립트는 고장일 때 0 이 아닌 코드로 끝나므로, 그때만 메일이 온다.

### 왜 1시간인가

주 발송 경로는 따로 있다. 신청 API 의 `after()`, 하객 브라우저의
fire-and-forget, 그리고 **Supabase `pg_cron` 5분**이 실제 드레인을 담당한다.
나스 작업은 "그 셋이 다 죽었을 때 사람에게 알리는" 감시자라 1시간이면 충분하다.
더 촘촘히 하고 싶으면 30분으로 줄여도 비용은 0이다.

### 나스가 꺼져 있으면

알림은 계속 나간다 (`pg_cron` 이 5분마다 돈다). 잃는 건 감시뿐이다.
급하면 GitHub 에서 `notify-drain` 워크플로를 수동 실행(workflow_dispatch)할 수 있다 —
Actions 한도가 남아 있을 때 얘기지만.

---

## 1단계 ② — `verify` 잡을 나스 러너로

### 러너 설치

1. GitHub → 저장소 → **Settings → Actions → Runners → New self-hosted runner**
   → Linux x64 를 고르면 나오는 **등록 토큰**(`A...` 로 시작, **1시간 유효**)을 복사

2. `ops/nas/` 를 나스로 옮기고 `.env` 를 만든다

   ```bash
   cd ~/ops
   git clone https://github.com/blackshoes1/invitation-one.git repo
   cd repo/ops/nas
   echo "RUNNER_TOKEN=<복사한 토큰>" > .env
   chmod 600 .env
   ```

3. 빌드 후 실행

   ```bash
   sudo docker compose up -d --build
   sudo docker compose logs -f      # "Listening for Jobs" 가 나오면 성공
   ```

   Settings → Actions → Runners 에 `nas-ds920` 이 **Idle** 로 뜨면 끝이다.

   > DSM Container Manager GUI 로도 된다: 프로젝트 → 생성 → 경로에 `ops/nas` 지정.

### 짚고 갈 것

- **토큰은 등록용 1회성이다.** 컨테이너를 다시 만들 때마다 새로 받아야 한다.
  한 번 등록된 뒤 계속 도는 동안에는 필요 없다.
- **러너를 root 로 돌리면 `config.sh` 가 거부한다.** 이미지가 `pwuser` 로 돌게
  잡혀 있다.
- **인바운드 포트를 열지 않는다.** 러너가 GitHub 쪽으로 나가서 대기하는 구조라
  공유기 포트포워딩이 필요 없다. 나스를 외부에 노출시키지 않아도 된다.
- **작업 공간은 누적된다.** GitHub 러너는 매번 새 VM 이지만 나스는 아니다.
  `actions/checkout` 이 `git clean -ffdx` 를 하므로 `node_modules` 는 매번 지워지고
  `npm ci` 가 새로 돈다 — 느리지만 정확하다.
- **`_work` 는 SSD 볼륨에 두는 게 좋다.** DS920+ 의 NVMe 슬롯을 쓰면 빌드가
  눈에 띄게 빨라진다. HDD 에 두면 아래 추정치의 위쪽에 가깝다.

### 속도 기대치

J4125 는 4코어라 GitHub 러너보다 느리다.

| 잡 | GitHub | DS920+ (추정) |
|---|---|---|
| `verify` | ~3분 | 8~15분 |
| `db-verify` (2단계) | ~1분 | 2~4분 |
| `e2e-db` (2단계) | ~5분 | 20~40분 |

`verify` 의 `timeout-minutes` 를 15 → 30 으로 올려 뒀다.

### 러너가 꺼져 있으면

잡이 **실패하지 않고 queued 로 대기한다.** 나스를 켜면 그때 실행된다.
빨간불이 아니라 회색으로 멈춰 있는 게 정상이다.

---

## 2단계 (예식 후에 해도 된다)

`db-verify` · `e2e-db` 를 옮기려면 `ops/nas/docker-compose.yml` 에서 주석 처리된
두 줄을 풀어야 한다.

```yaml
- /var/run/docker.sock:/var/run/docker.sock   # 형제 컨테이너 기동
network_mode: host                            # 127.0.0.1:54322 가 붙게
```

**소켓을 주면 이 컨테이너가 사실상 나스 root 권한을 갖는다.** 내 코드만 도는
비공개 저장소라 감수할 만하지만, 1단계에서는 필요 없으므로 열어 두지 않는다.

워크플로 쪽에서는 `db-verify` 의 `services:` 블록을 명시적 `docker run` 으로
바꿔야 한다. self-hosted 에서는 서비스 컨테이너의 published 포트가 러너 컨테이너의
localhost 와 다른 네임스페이스에 있기 때문이다.

```yaml
- run: |
    docker rm -f pgverify 2>/dev/null || true
    docker run -d --name pgverify -p 54322:5432 -e POSTGRES_PASSWORD=postgres postgres:17
    until pg_isready -h 127.0.0.1 -p 54322 -U postgres; do sleep 1; done
- run: bash scripts/db-verify.sh
- run: docker rm -f pgverify
  if: always()
```

`e2e-db` 는 `supabase start` 가 컨테이너 8~10개를 띄우므로 램(16GB면 충분)보다
**CPU 가 병목**이다. `timeout-minutes: 25` 를 60 정도로 올려야 한다.

## 되돌리려면

`runs-on` 을 `ubuntu-latest` 로 되돌리고 `notify-drain.yml` 에 `schedule:` 을
다시 넣으면 된다. 나스 쪽 컨테이너와 DSM 작업은 지우면 끝이고, 저장소에 남는
흔적은 없다.

## 관련 파일

`scripts/notify-drain.sh` (판정 로직 · 나스와 GitHub 공용) ·
`ops/nas/Dockerfile` · `ops/nas/entrypoint.sh` · `ops/nas/docker-compose.yml` ·
`.github/workflows/ci.yml` · `.github/workflows/notify-drain.yml` ·
`docs/NOTIFICATIONS.md` (알림 파이프라인 전체)
