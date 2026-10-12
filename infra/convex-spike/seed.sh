#!/bin/bash
# Seeds the spike backend with synthetic data only: one users row, then the e2e baseline and the play catalogues.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
unset CONVEX_DEPLOY_KEY CONVEX_DEPLOYMENT CONVEX_URL
set -a
source "$HOME/.config/convex-spike/spike.env"
set +a
cd "$root"
owner=spike-owner@example.test
users=$(mktemp -d)/users.jsonl
echo "{\"email\":\"$owner\",\"name\":\"Spike Owner\",\"emailVerificationTime\":$(date +%s)000}" > "$users"
[ "${SKIP_USER_IMPORT:-}" = 1 ] || npx convex import --table users --append --yes "$users"
npx convex run e2e:seedBaseline "{\"ownerEmail\":\"$owner\"}"
npx convex run playTesting:seedRealGameCatalogue '{}'
npx convex run playTesting:seedPublicCatalogue '{}'
