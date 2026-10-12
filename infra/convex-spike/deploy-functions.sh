#!/bin/bash
# Deploys Dune Zone's convex/ plus the spike-only spike_writes table to the spike backend, then sets test-only env vars.
# Reads CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY from ~/.config/convex-spike/spike.env.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
build=$(mktemp -d "${TMPDIR:-/tmp}/convex-spike-build.XXXXXX")
trap 'rm -rf "$build"' EXIT

# Never let an inherited deployment setting point the CLI at another deployment.
unset CONVEX_DEPLOY_KEY CONVEX_DEPLOYMENT CONVEX_URL
set -a
source "$HOME/.config/convex-spike/spike.env"
set +a

cp "$root/package.json" "$root/convex.json" "$build/"
[ -f "$root/tsconfig.json" ] && cp "$root/tsconfig.json" "$build/"
cp -R "$root/convex" "$build/convex"
ln -s "$root/node_modules" "$build/node_modules"
# convex/ imports shared code from src/.
ln -s "$root/src" "$build/src"
cp "$here/functions/spikeWrites.ts" "$build/convex/spikeWrites.ts"
# Add the spike table as the last entry of defineSchema.
python3 - "$build/convex/schema.ts" <<'EOF'
import sys
path = sys.argv[1]
text = open(path).read()
end = text.rstrip().rfind('});')
patched = text[:end] + "  spike_writes: defineTable({ n: v.number(), client: v.string() }).index('by_n', ['n']),\n" + text[end:]
open(path, 'w').write(patched)
EOF
# The seed helpers only run on a loopback backend. This scratch copy also admits the spike's own origin, and nothing else.
python3 - "$build/convex/lib/isolatedBackend.ts" "$CONVEX_SELF_HOSTED_URL" <<'EOF2'
import sys
path, origin = sys.argv[1], sys.argv[2]
text = open(path).read()
guard = "isLoopback(process.env.CONVEX_CLOUD_URL) && isLoopback(process.env.SITE_URL)"
assert guard in text, "isolatedBackend guard changed; update the spike patch"
text = text.replace(guard, f"(process.env.CONVEX_CLOUD_URL === '{origin}' || ({guard}))")
open(path, 'w').write(text)
EOF2

cd "$build"
started=$(date +%s)
npx convex deploy --typecheck disable --yes
echo "deploy took $(( $(date +%s) - started )) s"

if [ "${1:-}" = "--env" ]; then
  keys=$(mktemp -d)
  node -e '
    const { generateKeyPairSync } = require("crypto");
    const fs = require("fs");
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    fs.writeFileSync(process.argv[1] + "/private.pem", privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    fs.writeFileSync(process.argv[1] + "/jwks.json", JSON.stringify({ keys: [{ ...publicKey.export({ format: "jwk" }), use: "sig" }] }), { mode: 0o600 });
  ' "$keys"
  for pair in SITE_URL=http://localhost:3000 PLAY_SERVICE_URL=http://localhost:3000 IS_TEST=true E2E_LOCAL_AUTH=true PLAY_TEST_PASSWORD_HASH=pbkdf2; do
    npx convex env set "${pair%%=*}" "${pair#*=}"
  done
  npx convex env set JWT_PRIVATE_KEY --from-file "$keys/private.pem"
  npx convex env set JWKS --from-file "$keys/jwks.json"
  rm -rf "$keys"
fi
