#!/usr/bin/env bash
# =============================================================================
# 알림 아웃박스 안전망 드레인 (docs/NOTIFICATIONS.md)
#
# "보낼 게 있으면 보내라" 신호를 공개 POST 로 보내고, 응답 계약을 검사해서
# **고장이면 0 이 아닌 코드로 끝난다.** 안전망이 안 도는 것 자체가 장애이므로
# 조용히 초록으로 넘기지 않는다.
#
# 두 곳에서 같은 파일을 쓴다 — 로직이 갈라지지 않게 하려는 것이다:
#   - GitHub Actions (.github/workflows/notify-drain.yml, 수동 실행용)
#   - 시놀로지 나스 DSM 작업 스케줄러 (정기 실행 — docs/NAS_RUNNER.md)
#
# 의존성: curl 만 있으면 된다. **jq 는 없어도 된다** — DSM 에 기본 탑재가 아니라
# 응답을 grep/sed 로 읽는다. 응답이 우리가 만든 평평한 JSON(중첩·배열 없음)이라
# 안전하다. 응답 모양을 바꾸면 여기 파서도 같이 봐야 한다.
#
# 환경변수:
#   NOTIFY_URL  드레인 엔드포인트 (기본: 운영)
#   MAX_ROUNDS  한 번에 최대 몇 회전 (기본 5 — POST 는 회당 5건까지 꺼낸다)
# =============================================================================
set -uo pipefail

NOTIFY_URL="${NOTIFY_URL:-https://kkachi.vercel.app/api/notify}"
MAX_ROUNDS="${MAX_ROUNDS:-5}"

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

# GitHub Actions 면 ::error:: 주석을 쓰고, 그 밖(나스)에서는 평문으로 남긴다
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  err() { echo "::error::$*"; }
  warn() { echo "::warning::$*"; }
else
  err() { echo "[ERROR] $*" >&2; }
  warn() { echo "[WARN] $*" >&2; }
fi

# 평평한 JSON 전용 파서 (중첩·배열·이스케이프된 따옴표는 다루지 않는다)
json_num() {
  local v
  v="$(grep -oE "\"$1\"[[:space:]]*:[[:space:]]*-?[0-9]+" "$OUT" | head -1 | grep -oE '\-?[0-9]+$')"
  echo "${v:-${2:-0}}"
}
json_str() {
  grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$OUT" \
    | head -1 | sed -E 's/.*:[[:space:]]*"(.*)"$/\1/'
}
json_has_false() {  # "key":false 인가
  grep -qE "\"$1\"[[:space:]]*:[[:space:]]*false" "$OUT"
}

total_sent=0
round=0
while [ "$round" -lt "$MAX_ROUNDS" ]; do
  round=$((round + 1))

  code="$(curl -sS -m 30 -X POST -o "$OUT" -w '%{http_code}' "$NOTIFY_URL")" || {
    err "드레인 요청 실패 (curl)"; exit 1; }
  cat "$OUT"; echo

  if [ "$code" != "200" ]; then
    err "드레인 실패 — HTTP $code"; exit 1
  fi

  claimed="$(json_num claimed)"
  sent="$(json_num sent)"
  failed="$(json_num failed)"
  total_sent=$((total_sent + sent))

  # 드레인 자체가 실패했다 (클레임 오류 등). 이때 sent/failed 숫자는 의미가 없다.
  # 예전엔 이 상황이 "0건 정상"으로 보고돼서 알림이 통째로 멈춰도 초록이었다.
  drain_err="$(json_str error)"
  if [ -n "$drain_err" ]; then
    err "드레인 실패 — $drain_err"; exit 1
  fi

  # 채널이 꺼져 있으면 한 건도 못 나간다. 클레임 자체를 안 하므로 반복해도 의미 없다.
  # 채널을 갈아끼우며 환경변수만 지우면 정확히 이 상태가 되는데 겉으로는 조용하다.
  if json_has_false ready; then
    err "알림 채널 미설정($(json_str channel)) — 발송되지 않는다"; exit 1
  fi

  # 보낼 게 없을 때 서버가 확인해 준 채널 연결 상태.
  #  - 카카오: refresh token 이 약 2개월 만료 → expired 면 재발급 필요
  #  - 텔레그램: 만료는 없고, error 면 봇 토큰이 잘못됐거나 봇이 차단·삭제됨
  # (간격 제한으로 확인을 건너뛴 회차는 값이 비어 있고, 그건 정상이다)
  ch="$(json_str channelStatus)"
  if [ "$ch" = "expired" ] || [ "$ch" = "error" ]; then
    err "알림 채널($(json_str channel)) 연결 끊김: $ch"; exit 1
  fi

  # 발송은 됐는데 DB 기록에 실패한 건 — 다음 회차에 중복 발송된다.
  # 조용히 넘기면 왜 같은 알림이 두 번 왔는지 알 길이 없다.
  pf="$(json_num persistFailed)"
  [ "$pf" != "0" ] && warn "발송 후 상태 기록 실패 ${pf}건 — 중복 발송될 수 있다"

  # 재시도 한도·7일 창을 넘겨 다시는 꺼내지지 않는 미발송 건.
  # 자동으로 뒤늦게 보내지 않는다 (예식 후 뜬금없는 알림 방지) — 사람이 봐야 한다.
  stuck="$(json_num stuck)"
  if [ "$stuck" != "0" ]; then
    err "재시도 한도/기간을 넘긴 미발송 알림 ${stuck}건 — 직접 확인 필요"; exit 1
  fi

  # 꺼냈는데 한 건도 못 보냈다 = 발송 자체가 깨진 상태.
  # 백오프가 걸려 지금 다시 꺼내도 소용없으니 멈추고, 조용히 넘기지 않는다.
  if [ "$claimed" != "0" ] && [ "$sent" = "0" ] && [ "$failed" != "0" ]; then
    err "클레임 ${claimed}건 중 발송 0건 — 발송이 깨졌다"; exit 1
  fi

  [ "$claimed" = "0" ] && break
done

echo "총 발송: $total_sent"
