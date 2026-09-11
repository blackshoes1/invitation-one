#!/bin/sh
# One-way archive. Never use sync/move/delete/purge here.
set -eu
umask 077
mode="${1:-loop}"
case "$mode" in loop|--once|--dry-run) ;; *) echo "Use --once or --dry-run" >&2; exit 2;; esac
interval="${ARCHIVE_INTERVAL_SECONDS:-300}"
case "$interval" in ''|*[!0-9]*) echo "Invalid archive interval" >&2; exit 2;; esac
if [ "$interval" -lt 60 ] || [ "$interval" -gt 86400 ]; then
  echo "Archive interval must be 60..86400 seconds" >&2; exit 2
fi
config="${RCLONE_CONFIG:-/config/rclone.conf}"
dest="${ARCHIVE_DEST:-/archive/guest-photos}"
state="${ARCHIVE_STATE:-/archive/.archive-status}"
case "$dest" in /*) ;; *) echo "Archive destination must be an absolute local path" >&2; exit 2;; esac
if [ ! -f "$config" ] || grep -q 'REPLACE_' "$config"; then
  echo "Configure rclone.conf with your Supabase S3 connection first." >&2; exit 2
fi
copy_photos() {
  exec rclone copy supabase:guest-photos "$dest" --config "$config" --immutable --checksum --transfers 2 --checkers 4 --retries 3 --low-level-retries 5 --contimeout 15s --timeout 60s --max-duration 15m --stats 60s --stats-one-line --log-level NOTICE "$@"
}
if [ "$mode" = "--dry-run" ]; then
  copy_photos --dry-run
  exit $?
fi
mkdir -p "$dest" "$state"
write_state() {
  printf '%s\n' "$2" > "$state/$1.tmp"
  mv "$state/$1.tmp" "$state/$1"
}
child=""
stop() {
  if [ -n "$child" ]; then kill -TERM "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; fi
  exit 0
}
trap stop INT TERM
while :; do
  write_state last-attempt "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Starting photo archive"
  # Background the transfer so container stop reaches the process promptly.
  copy_photos &
  child=$!
  result=0
  wait "$child" || result=$?
  child=""
  if [ "$result" -eq 0 ]; then
    write_state last-success-epoch "$(date +%s)"
    write_state last-success "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    write_state last-result success
    echo "Photo archive completed"
  else
    write_state last-result failed
    echo "Photo archive failed (exit $result); saved photos retained" >&2
  fi
  if [ "$mode" = "--once" ]; then exit "$result"; fi
  sleep "$interval" &
  child=$!
  wait "$child" || true
  child=""
done
