#!/bin/bash
# Writes for <seconds>, sends <signal> to the container after <delay> seconds, then checks which acknowledged writes survived.
# Just before the signal it records the newest L0 replica objects and Litestream's metrics.
# Usage: kill-test.sh <out-dir> <signal> [delay] [seconds]
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=$1
signal=$2
delay=${3:-40}
seconds=${4:-70}
source "$HOME/.config/convex-spike/spike.env"
U=$CONVEX_SELF_HOSTED_URL
H="Authorization: Bearer $SPIKE_CONTROL_TOKEN"
mkdir -p "$out"
rm -f "$out/acked.log"
gen=$(curl -sS -H "$H" "$U/_spike/status" | python3 -c "import json,sys; print(json.load(sys.stdin)['runningGeneration'])")
echo "generation $gen"
bun "$here/writeloss.ts" write "$out/acked.log" "$seconds" 8 > "$out/writer.out" 2>&1 &
writer=$!
sleep "$delay"
curl -sS -m 30 -X POST -H "$H" "$U/_spike/sh" --data "date -u +%T.%3N; curl -s 'http://r2.internal/convex-spike-litestream?list-type=2&prefix=gen-$gen/0000/' | grep -o '<Key>[^<]*</Key><LastModified>[^<]*' | sed 's/<[^>]*>/ /g' | tail -3; curl -s 127.0.0.1:9090/metrics | grep -E '^litestream_(txid|sync_count|wal_size)'" > "$out/before-signal.txt"
echo "signal $signal at $(date -u +%T.%3N), $(wc -l < "$out/acked.log") acknowledged so far"
curl -sS -X POST -H "$H" "$U/_spike/signal?n=$signal"
echo
wait "$writer"
grep -v "^WebSocket\|^Attempting\|DOCTYPE\|^<" "$out/writer.out" | cut -c1-160
cat "$out/before-signal.txt"
bun "$here/writeloss.ts" check "$out/acked.log"
