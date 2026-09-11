#!/bin/sh
# Isolated Docker integration test; never contacts production storage.
set -eu
root="$(pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/source/guest-photos/snap" "$tmp/archive"
printf '[supabase]\ntype = local\n' > "$tmp/rclone.conf"
printf 'first-photo' > "$tmp/source/guest-photos/snap/first.jpg"
run() {
  docker run --rm --user "$(id -u):$(id -g)" --read-only --tmpfs /tmp \
    -v "$root/ops/photo-archive:/app:ro" -v "$tmp/rclone.conf:/config/rclone.conf:ro" \
    -v "$tmp/source:/source:ro" -v "$tmp/archive:/archive" -w /source \
    --entrypoint /bin/sh rclone/rclone:1.75.1 "$@"
}
run /app/archive.sh --dry-run
[ ! -e "$tmp/archive/.archive-status/last-success" ]
[ ! -e "$tmp/archive/guest-photos/snap/first.jpg" ]
run /app/archive.sh --once
cmp "$tmp/source/guest-photos/snap/first.jpg" "$tmp/archive/guest-photos/snap/first.jpg"
run /app/healthcheck.sh
run /app/archive.sh --once
rm "$tmp/source/guest-photos/snap/first.jpg"
printf 'second-photo' > "$tmp/source/guest-photos/snap/second.jpg"
run /app/archive.sh --once
[ "$(cat "$tmp/archive/guest-photos/snap/first.jpg")" = first-photo ]
cmp "$tmp/source/guest-photos/snap/second.jpg" "$tmp/archive/guest-photos/snap/second.jpg"
printf 'changed-photo' > "$tmp/source/guest-photos/snap/second.jpg"
if run /app/archive.sh --once; then echo 'Expected immutable conflict' >&2; exit 1; fi
[ "$(cat "$tmp/archive/guest-photos/snap/second.jpg")" = second-photo ]
[ "$(cat "$tmp/archive/.archive-status/last-result")" = failed ]
if run /app/healthcheck.sh; then echo 'Expected unhealthy after failure' >&2; exit 1; fi
printf 'second-photo' > "$tmp/source/guest-photos/snap/second.jpg"
run /app/archive.sh --once
run /app/healthcheck.sh
printf 'Photo archive integration passed\n'
