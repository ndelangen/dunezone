#!/bin/bash
# Writes for up to <seconds> and polls Litestream's txid; when it stops advancing for 15 s while writes continue,
# saves Litestream's goroutine dump, its sockets and a fresh request to the shim, then stops.
# Usage: catch-stall.sh <out-dir> [seconds]
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=$1
seconds=${2:-300}
source "$HOME/.config/convex-spike/spike.env"
U=$CONVEX_SELF_HOSTED_URL
H="Authorization: Bearer $SPIKE_CONTROL_TOKEN"
mkdir -p "$out"
bun "$here/writeloss.ts" write "$out/acked.log" "$seconds" 8 > "$out/writer.out" 2>&1 &
writer=$!
last=""
since=$(date +%s)
end=$(( $(date +%s) + seconds ))
while [ "$(date +%s)" -lt "$end" ]; do
  txid=$(curl -sS -m 10 -X POST -H "$H" "$U/_spike/sh" --data 'curl -s 127.0.0.1:9090/metrics | grep "^litestream_txid" | cut -d" " -f2')
  if [ "$txid" != "$last" ]; then
    last=$txid
    since=$(date +%s)
  elif [ $(( $(date +%s) - since )) -ge 15 ]; then
    echo "$(date -u +%T) txid $txid unchanged for 15 s; capturing"
    curl -sS -m 30 -X POST -H "$H" "$U/_spike/sh" --data '
      p=$(pgrep -x litestream)
      echo "== sockets of litestream"; for f in /proc/$p/fd/*; do l=$(readlink $f); case $l in socket:*) i=${l#socket:[}; i=${i%]}; grep -h " $i " /proc/net/tcp /proc/net/tcp6 | awk "{print \$2, \$3, \$4, \$5}";; esac; done
      echo "== fresh request to the shim"; curl -s -m 10 -o /dev/null -w "%{http_code} %{time_total}s\n" "http://r2.internal/convex-spike-litestream?list-type=2&prefix=none/"
      echo "== goroutines"; curl -s "127.0.0.1:9090/debug/pprof/goroutine?debug=2"' > "$out/stall.txt"
    break
  fi
  sleep 2
done
kill "$writer" 2>/dev/null
wait "$writer" 2>/dev/null
echo "saved $(wc -l < "$out/stall.txt" 2>/dev/null || echo 0) lines"
