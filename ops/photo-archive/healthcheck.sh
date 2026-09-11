#!/bin/sh
set -eu
state="${ARCHIVE_STATE:-/archive/.archive-status}"
interval="${ARCHIVE_INTERVAL_SECONDS:-300}"
case "$interval" in ''|*[!0-9]*) exit 1;; esac
[ "$(cat "$state/last-result" 2>/dev/null)" = success ] || exit 1
last="$(cat "$state/last-success-epoch" 2>/dev/null)"
case "$last" in ''|*[!0-9]*) exit 1;; esac
age=$(( $(date +%s) - last ))
[ "$age" -ge 0 ] && [ "$age" -le $((interval * 3 + 1800)) ]
