# GitHub Actions self-hosted runner — 시놀로지 DS920+ (x86_64, Celeron J4125)
#
# 왜 컨테이너인가: DSM 에는 apt 가 없어서 러너가 요구하는 의존성(libicu 등)을
# 네이티브로 넣기가 고통스럽다. 컨테이너가 훨씬 단순하다.
#
# 베이스를 Playwright 공식 이미지로 잡는 이유: 브라우저 시스템 의존성이 이미
# 들어 있어 워크플로에서 `--with-deps`(=apt-get, 나스에선 sudo 없음)를 쓰지 않아도
# 된다. 태그의 버전은 package.json 의 @playwright/test 와 **맞춰야 한다** —
# 어긋나면 `playwright install` 이 없는 빌드를 찾는다.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

ARG RUNNER_VERSION=2.328.0

# docker CLI 는 2단계(db-verify·e2e-db)에서 필요하다. 지금은 쓰지 않지만 미리 넣어
# 두면 그때 이미지를 다시 만들지 않아도 된다 (데몬은 나스 것을 소켓으로 쓴다).
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates gnupg git jq postgresql-client \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
 && chmod a+r /etc/apt/keyrings/docker.gpg \
 && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu noble stable" \
      > /etc/apt/sources.list.d/docker.list \
 && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli \
 && rm -rf /var/lib/apt/lists/*

# Playwright 이미지의 기본 사용자(pwuser)로 돌린다 — 러너를 root 로 돌리면
# config.sh 가 거부한다.
USER pwuser
WORKDIR /home/pwuser/runner

RUN curl -fsSL -o runner.tar.gz \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
 && tar xzf runner.tar.gz && rm runner.tar.gz

# 토큰은 이미지에 굽지 않는다 — 컨테이너 시작 때 등록하고, 종료 때 해제한다.
# (등록 토큰은 1시간짜리라 이미지에 넣어도 곧 만료된다)
COPY --chown=pwuser:pwuser entrypoint.sh /home/pwuser/entrypoint.sh
ENTRYPOINT ["/home/pwuser/entrypoint.sh"]
