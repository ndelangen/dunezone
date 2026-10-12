#!/bin/bash
# Prints Litestream's txid, sync count and WAL size, the database size, and the newest L0 replica object every <interval> seconds.
# Usage: watch-replica.sh <interval> <samples>
set -uo pipefail
source "$HOME/.config/convex-spike/spike.env"
U=$CONVEX_SELF_HOSTED_URL
H="Authorization: Bearer $SPIKE_CONTROL_TOKEN"
for _ in $(seq 1 "${2:-60}"); do
  line=$(curl -sS -m 20 -X POST -H "$H" "$U/_spike/sh" --data '
    gen=$(cat /proc/1/environ | tr "\0" "\n" | sed -n "s/^GENERATION=//p")
    m=$(curl -s 127.0.0.1:9090/metrics | grep -E "^litestream_(txid|sync_count|wal_size|sync_error_count)" | sed "s/{[^}]*}//; s/litestream_//" | tr "\n" " ")
    l0=$(curl -s "http://r2.internal/convex-spike-litestream?list-type=2&prefix=gen-$gen/0000/" | grep -o "<LastModified>[^<]*" | sed "s/<LastModified>//" | sort | tail -1)
    echo "gen=$gen $m db=$(stat -c %s /data/convex.sqlite3) newest_l0=$l0"' 2>&1)
  echo "$(date -u +%T) $line"
  sleep "${1:-10}"
done
