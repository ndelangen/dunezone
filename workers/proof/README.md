# One-faction-sheet Queue-consumer proof

This is a non-production proof harness for exactly one faction-sheet PDF. Convex remains the sole
durable control plane. The Queue carries only a wake-up signal:

```text
annual inert Cron (not exercised)
authenticated manual enqueue
  -> one minimal Queue message
  -> independent Queue consumer invocation
  -> conditional fixed-key R2 claim
  -> before checkpoint -> one Browser Session -> PDF -> private R2 -> after checkpoint
```

The Queue message contains only `schemaVersion`, `scheduledCutoff`, and diagnostic `triggerId`. It
contains no faction payload, target id, claim, backlog state, or asset authority. This proof has no
publisher schema or durable lease yet. Before any Convex checkpoint or Browser work, the consumer
conditionally creates the fixed `proof/default-limit-experiment.claim.json` marker in the private R2
bucket. Strong consistency lets exactly one isolate win; configuration-level concurrency one and the
in-process guard remain secondary proof defenses. The marker is temporary proof state, not backlog
or publication authority, and Ticket 2 replaces it with the real Convex lease.

## Local verification

```bash
bun run proof:typecheck
bun run proof:test
bun run proof:assets
bun run proof:browser-regression
bun run proof:dry-run
```

`proof:browser-regression` performs real Chromium checks against fresh proof and Storybook builds.
It verifies corrupt HTTP-200 SVG image/use bodies fail readiness, the print document starts at the
physical page origin, Storybook fonts/images/SVGs settle without HTTP or browser errors, and both PDF
paths produce exactly two A4 (`210 mm x 297 mm`) pages. Every run replaces these ignored reference
files and prints their SHA-256 hashes and source identities:

```text
tmp/asset-publishing-proof/local-proof.pdf
tmp/asset-publishing-proof/storybook-reference.pdf
```

The unit suite also verifies empty versus eligible dispatch, minimal message validation, two fresh
consumer instances contending on one R2 claim backend, claim-store failure, duplicate and busy
acknowledgement, zero-retry unexpected-error handling, render timeout, invalid PDF structure, R2
failure, Convex checkpoint failure, and browser cleanup. There is no client-disconnect or Durable
Object evidence path.

For local Wrangler use, copy `.dev.vars.example` to `.dev.vars`, supply a local capture URL, and run
with local Queue support. The authenticated manual HTTP trigger is enqueue-only:

```bash
curl -fsS -X POST \
  'http://127.0.0.1:8787/__proof/enqueue' \
  -H "Authorization: Bearer $PROOF_TRIGGER_TOKEN"
```

The HTTP response is `202`; capture happens later in the Queue consumer invocation.

## Account and superseded-proof preflight

Do not run these commands while preparing or reviewing code. They are the deployment operator's
future runbook.

```bash
bunx wrangler whoami
export CLOUDFLARE_ACCOUNT_ID='<account id printed by wrangler whoami>'
```

The obsolete Durable Object Worker and namespace have already been deleted. The official namespace
API returned an empty list. Do not add a deletion migration: this Worker config intentionally has no
`durable_objects` or `migrations` block. Before deployment, re-check the account and stop if any old
`FactionSheetProof` namespace or Durable Object binding has reappeared.

The retained private Standard bucket is deliberately reused:

```bash
bunx wrangler r2 bucket info tanstack-start-asset-publisher-proof --json
bunx wrangler r2 bucket dev-url get tanstack-start-asset-publisher-proof
bunx wrangler r2 bucket domain list tanstack-start-asset-publisher-proof
```

Expected: the bucket exists, its `r2.dev` URL is disabled, and it has no custom domain. Delete both
`proof/default-limit-experiment.claim.json` and `proof/faction-sheet.pdf` before collecting new
evidence if either exists, then verify the strongly consistent bucket object list is empty. Do not
delete the bucket.

Create exactly one Queue before deploying the Worker:

```bash
bunx wrangler queues create faction-sheet-one-pdf-proof
bunx wrangler queues list
```

The checked config binds that Queue as producer `PROOF_QUEUE` and consumer with batch size one,
consumer concurrency one, and `max_retries: 0`. It deliberately omits the entire Worker `limits`
block, so this final experiment measures the actual default Queue-consumer CPU allowance on the
Workers Free account. The checked Cron is the inert annual `0 0 1 1 *` schedule.

The first deployment attempt is recorded history: Cloudflare rejected the reviewed custom
`limits.cpu_ms: 300000` setting on Workers Free before any consumer, Browser Session, Cron, or R2
write ran. That rejection authorized only this one default-limit, zero-retry experiment; it is not
permission to add another CPU setting or broaden the evidence run.

## Production Convex proof endpoints

The proof uses only two stateless, secret-gated endpoints on the existing DuneGen production
deployment. They have no database, schema, query, mutation, scheduler, or storage access.

```bash
export CONVEX_PROOF_URL='https://exuberant-finch-263.eu-west-1.convex.site/asset-publishing/proof/checkpoint'
export CONVEX_PROOF_ELIGIBILITY_URL='https://exuberant-finch-263.eu-west-1.convex.site/asset-publishing/proof/eligibility'
test "$(bunx convex dashboard --prod --no-open)" = \
  'https://dashboard.convex.dev/d/exuberant-finch-263'
```

Use local Convex OAuth, never a deploy key. A local production dry-run is a read-only review gate;
require no schema or index change:

```bash
test -z "${CONVEX_DEPLOY_KEY:-}" || { echo 'Refusing a deploy key' >&2; exit 1; }
bunx convex deploy --dry-run
```

Do not deploy production Convex functions from this workstation. The reviewed change must merge to
`main`, then the repository's existing **Deploy production** GitHub Actions workflow must deploy the
Convex functions and pass. Record the merge commit and successful workflow run before any Cloudflare
proof deployment. The ordered release remains GitHub-Actions-controlled; do not enable an independent
Cloudflare Git auto-deploy.

Create one scoped secret and initially force the eligibility endpoint to `empty`:

```bash
export CONVEX_PROOF_TOKEN="$(openssl rand -hex 32)"
printf '%s' "$CONVEX_PROOF_TOKEN" \
  | bunx convex env set ASSET_PUBLISHING_PROOF_SECRET --prod
printf '%s' 'empty' \
  | bunx convex env set ASSET_PUBLISHING_PROOF_ELIGIBILITY --prod
```

Cloudflare receives only the endpoint URLs and matching proof token. Never provide it a
`CONVEX_DEPLOY_KEY`, `CONVEX_DEPLOYMENT`, app auth secret, or general database credential.

## Build and deploy with the annual Cron

```bash
export PROOF_CAPTURE_TOKEN="$(openssl rand -hex 32)"
export PROOF_TRIGGER_TOKEN="$(openssl rand -hex 32)"
export PROOF_SECRETS_FILE="$(mktemp)"
chmod 600 "$PROOF_SECRETS_FILE"
printf 'PROOF_CAPTURE_TOKEN=%s\nPROOF_TRIGGER_TOKEN=%s\nCONVEX_PROOF_TOKEN=%s\n' \
  "$PROOF_CAPTURE_TOKEN" "$PROOF_TRIGGER_TOKEN" "$CONVEX_PROOF_TOKEN" \
  > "$PROOF_SECRETS_FILE"

bun run proof:assets
bun run proof:typecheck
bun run proof:test
bun run proof:dry-run
```

The dry-run must show the Queue, Browser, R2, Static Assets, and inert annual-Cron configuration. It
must not show a custom Worker CPU limit. Do not add a `limits` block if Wrangler reports the
provider default.

The first deployment keeps the annual Cron and uses a placeholder only to discover the workers.dev
origin. It must not invoke Browser Run:

```bash
bunx wrangler deploy \
  --config workers/proof/wrangler.jsonc \
  --secrets-file "$PROOF_SECRETS_FILE" \
  --triggers '0 0 1 1 *' \
  --var PROOF_CAPTURE_URL:'https://bootstrap.invalid/capture/proof/faction-sheet' \
  --var PROOF_FAILURE_MODE:none \
  --var PROOF_RENDER_TIMEOUT_MS:45000

export WORKER_URL='https://faction-sheet-one-pdf-proof.<workers-dev-subdomain>.workers.dev'

bunx wrangler deploy \
  --config workers/proof/wrangler.jsonc \
  --secrets-file "$PROOF_SECRETS_FILE" \
  --triggers '0 0 1 1 *' \
  --var PROOF_CAPTURE_URL:"$WORKER_URL/capture/proof/faction-sheet" \
  --var PROOF_FAILURE_MODE:none \
  --var PROOF_RENDER_TIMEOUT_MS:45000

rm -f "$PROOF_SECRETS_FILE"
unset PROOF_SECRETS_FILE
```

Do not arm a frequent or positive Cron at any point in this final experiment. The annual Cron stays
inert throughout; the only wake-up is the one authenticated manual message below.

`PROOF_RENDER_TIMEOUT_MS=45000` is one end-to-end Browser capture deadline covering Browser launch,
navigation, readiness, bounds validation, PDF generation, and parsing. It is not reset per phase.
On expiry the consumer immediately starts context/browser closure, waits at most 15 seconds for
cleanup, records `closed`, `error`, or `cleanup_timed_out`, checkpoints failure, and acknowledges the
ordinary handled failure. Code rejects a deadline above six minutes, leaving at least 1 minute 45
seconds including cleanup before the then-planned eight-minute production soft budget and far more
before the Queue's 15-minute wall limit. This proof-only historical bound is independent of the
current production publisher deadline.

## One manual Queue message

Start a tail before sending anything:

```bash
bunx wrangler tail faction-sheet-one-pdf-proof --format json \
  | tee /tmp/faction-sheet-queue-proof-tail.jsonl
```

Send exactly one explicit minimal message through the authenticated enqueue-only producer endpoint.
The installed Wrangler CLI does not expose a direct Queue-message command:

```bash
export PROOF_TRIGGER_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
export PROOF_CUTOFF="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
export PROOF_MESSAGE="$(jq -cn \
  --arg scheduledCutoff "$PROOF_CUTOFF" \
  --arg triggerId "$PROOF_TRIGGER_ID" \
  '{schemaVersion:1, scheduledCutoff:$scheduledCutoff, triggerId:$triggerId}')"
curl -fsS -X POST "$WORKER_URL/__proof/enqueue" \
  -H "Authorization: Bearer $PROOF_TRIGGER_TOKEN" \
  -H 'Content-Type: application/json' \
  --data "$PROOF_MESSAGE"
```

The endpoint validates and enqueues that message; it never captures inline. Do not invoke it a
second time, even after a failed or ambiguous consumer result. An empty request body remains locally
supported but is not used for final evidence because the explicit message identifies the sole run.

Require a Queue-consumer log with `action: "ack"`, `reason: "completed"`, attempt metadata, and a
proof report showing:

- `outcome: "success"` and `browserCloseOutcome: "closed"`;
- exactly two pages within 0.5 mm of A4 (`210 x 297`);
- one conditional claim-marker Class A write before proof work, one PDF R2 operation in the report,
  and two correlated Convex calls;
- finite before/after Convex latency, PDF bytes, browser duration, and wall duration;
- empty console and request-failure arrays.

Download through authenticated Wrangler access into the same ignored comparison directory:

```bash
mkdir -p tmp/asset-publishing-proof
bunx wrangler r2 object get \
  tanstack-start-asset-publisher-proof/proof/default-limit-experiment.claim.json \
  --remote --file=tmp/asset-publishing-proof/default-limit-experiment.claim.json
bunx wrangler r2 object get \
  tanstack-start-asset-publisher-proof/proof/faction-sheet.pdf \
  --remote --file=tmp/asset-publishing-proof/deployed-queue-proof.pdf
pdfinfo tmp/asset-publishing-proof/local-proof.pdf
pdfinfo tmp/asset-publishing-proof/storybook-reference.pdf
pdfinfo tmp/asset-publishing-proof/deployed-queue-proof.pdf
```

Rasterize every source with the identical command and resolution:

```bash
rasterize_pdf() {
  input="$1"
  output="$2"
  mkdir -p "$(dirname "$output")"
  pdftoppm -png -r 150 "$input" "$output"
}
rasterize_pdf tmp/asset-publishing-proof/local-proof.pdf \
  tmp/asset-publishing-proof/raster/local-proof/page
rasterize_pdf tmp/asset-publishing-proof/storybook-reference.pdf \
  tmp/asset-publishing-proof/raster/storybook-reference/page
rasterize_pdf tmp/asset-publishing-proof/deployed-queue-proof.pdf \
  tmp/asset-publishing-proof/raster/deployed-queue-proof/page
shasum -a 256 \
  tmp/asset-publishing-proof/local-proof.pdf \
  tmp/asset-publishing-proof/storybook-reference.pdf \
  tmp/asset-publishing-proof/deployed-queue-proof.pdf
```

Record the exact three paths, hashes, reference identities printed by the regression, raster command,
and comparison result. Compare both pages for fonts, artwork, backgrounds, clipping, and physical
size. A verbal comparison without reproducible files and hashes is not accepted evidence.

## Failure and delivery policy

The checked unit tests are the authoritative deterministic coverage for invalid checkpoint,
render-timeout, invalid PDF, R2 failure, Convex failure, duplicate/busy delivery, and unexpected
orchestration failure. Every delivery path acknowledges; none calls `message.retry`, and the Queue
configuration permits no provider redelivery.

The fixed claim is attempted before `runOnePdfProof`. A failed precondition means another isolate
already won: acknowledge/log `duplicate` and do no Convex, Browser, or PDF work. A claim PUT error is
acknowledged/logged `exhausted` and starts no proof work; because the sole attempt is then ambiguous,
the deployed experiment is NO-GO.

Do not deploy a failure mode or run deployed render-timeout, post-capture-failure, duplicate, busy,
or positive-Cron Browser captures. Those paths remain unit-test evidence only. Keep
`PROOF_FAILURE_MODE=none`, keep Convex eligibility `empty`, and preserve `max_concurrency: 1` as the
proof-only overlap fence. Ticket 2 must replace that fence with Convex leases.

## Free-tier GO / NO-GO gate

Use Workers Logs/Metrics for the Queue consumer invocation, not the producer Cron, to record CPU,
wall time, memory, subrequests, retry/ack result, and exceeded-resource status. Correlate Browser Run
session duration, daily browser usage, PDF bytes, R2 operations, and Convex checkpoint latencies from
the structured report, Browser Runs dashboard, R2 analytics, and Worker metrics.

```text
Decision: GO | NO-GO
Empty Cron CPU / outcome / Queue sends:
Eligible Cron CPU / outcome / Queue sends:
Queue consumer CPU / wall / memory / subrequests / exceededCpu:
Custom-limit rejection evidence reference:
Default-limit confirmation / custom CPU setting absent:
Queue message attempts / ack result:
Browser Session duration / close outcome / daily usage:
PDF bytes / pages / physical size / visual comparison:
R2 claim-marker Class A write / PDF write / object verification:
Convex before+after latency:
Unexpected console or network errors:
Reason and follow-up:
```

The Empty/Eligible Cron fields must record that both observations were intentionally not run and the
annual trigger remained inert. GO requires the one independent default-limit Queue consumer to
produce one clean, readable, correctly sized two-page PDF, close Browser Run, write once to private
R2 after its single successful claim-marker write, complete both stateless Convex checkpoints, and
leave unambiguous correlated metrics. Any
`exceededCpu`, memory termination, unclosed or unclear Browser cleanup, invalid or unreadable output,
unexpected extra delivery, or ambiguous evidence is definitive NO-GO. Do not send another message,
proceed to Ticket 2, or silently reintroduce Durable Objects after NO-GO.

## Cleanup after evidence

After recording GO or NO-GO, remove the temporary Worker (which also removes its inert annual
trigger), Queue, scoped Convex variables, claim marker, and proof PDF object. Retain the private
Standard R2 bucket, but verify it is empty and still has neither `r2.dev` access nor a custom domain.

```bash
bunx wrangler queues consumer remove \
  faction-sheet-one-pdf-proof faction-sheet-one-pdf-proof
bunx wrangler delete --name faction-sheet-one-pdf-proof
bunx wrangler queues delete faction-sheet-one-pdf-proof
bunx convex env remove ASSET_PUBLISHING_PROOF_SECRET --prod
bunx convex env remove ASSET_PUBLISHING_PROOF_ELIGIBILITY --prod
bunx wrangler r2 object delete \
  tanstack-start-asset-publisher-proof/proof/default-limit-experiment.claim.json --remote
bunx wrangler r2 object delete \
  tanstack-start-asset-publisher-proof/proof/faction-sheet.pdf --remote
bunx wrangler r2 bucket info tanstack-start-asset-publisher-proof --json
bunx wrangler r2 bucket dev-url get tanstack-start-asset-publisher-proof
bunx wrangler r2 bucket domain list tanstack-start-asset-publisher-proof
```

Cleanup is complete only when the Worker and Queue no longer exist, both scoped Convex variables are
absent, the strongly consistent R2 object list in the Cloudflare dashboard or API is empty, and the
retained bucket remains private. The aggregate bucket-info object counter may lag and is not enough
on its own. Remove local secret files and unset proof tokens as well. Do not delete the empty bucket.
