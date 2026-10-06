#!/usr/bin/env bash
# 러너 등록 → 실행 → 종료 시 해제.
#
# 등록 해제를 안 하면 GitHub 쪽에 죽은 러너가 계속 쌓이고, 그쪽으로 잡이
# 배정되면 영원히 queued 로 매달린다. 그래서 trap 으로 반드시 지운다.
set -euo pipefail

: "${RUNNER_REPO_URL:?RUNNER_REPO_URL 이 필요합니다 (예: https://github.com/blackshoes1/invitation-one)}"
: "${RUNNER_TOKEN:?RUNNER_TOKEN 이 필요합니다 (Settings → Actions → Runners → New self-hosted runner 에서 발급)}"

NAME="${RUNNER_NAME:-nas-ds920}"
LABELS="${RUNNER_LABELS:-self-hosted,linux,x64}"

cleanup() {
  echo "[runner] 등록 해제 중…"
  ./config.sh remove --token "$RUNNER_TOKEN" || true
}
trap cleanup EXIT INT TERM

./config.sh \
  --unattended \
  --replace \
  --url "$RUNNER_REPO_URL" \
  --token "$RUNNER_TOKEN" \
  --name "$NAME" \
  --labels "$LABELS" \
  --work _work

./run.sh
