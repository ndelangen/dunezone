# Scheduled asset publisher

The production Worker runs one `*/5 * * * *` Cron. Convex owns the durable
Publication jobs; the Worker only picks up work, renders it with the one deployed
Renderer, stores the result, and reports success or failure.

At the start of each invocation, Convex:

1. resets expired `in_progress` jobs to `pending` and increases their attempt count;
2. reads the administrator pickup switch once; and
3. when pickup is enabled, leases at most twenty pending jobs.

Turning pickup off only prevents new jobs from being leased. It does not interrupt
an invocation or capture already in progress. Expired work is recovered even while
pickup is off.

For every leased job, the Worker:

1. reads the job's embedded, validated `asset_data`;
2. renders it with the current Renderer and validates the exact two-page PDF;
3. replaces the asset's one stable R2 object and creates an opaque client cache buster; and
4. completes the job in Convex.

Successful completion updates `publication_assets` and deletes only that job. If a
save happened while the capture was in progress, its coalesced pending successor
remains for a later Cron and captures the newest saved data. A failure or expired
lease increases `attempt_counter`; the tenth failed attempt changes the job to
`error`.

The same Cron handles one preparing Rulebook HTML artifact before it leases Browser
capture work. Convex projects the frozen Edition into the shared render document,
and the Worker renders that document to static HTML without hydration or client
JavaScript. The first successful write owns the Edition's permanent R2 key. A
retry may reuse those bytes only when the stored artifact identity, byte length,
and content digest all match.

Worker source does not import the browser-only game renderer. `publisher:assets`
compiles that renderer and its stylesheet into a generated runtime module, verifies
the module's complete static document, and then bundles it through Wrangler's
module alias. The generated runtime bytes are part of Renderer identity.

The Worker uses one executor secret for its Convex calls. Browser capture uses the
opaque job ID to read the protected embedded render payload. The executor secret is
not checked in.

## Renderer revisions

There is one deployed Renderer for each asset type. A checked-in Renderer revision
is not a selectable Renderer version: increasing it tells Convex to enqueue fresh
captures for that asset type.

After the Worker has deployed and passed its release smoke, CI compares the
checked-in revision map with `admin_settings`. Higher checked-in values are
activated together and schedule bounded background scans. CI does not wait for
those scans or captures to finish.

## Runtime telemetry

The scheduled handler emits one bounded `asset_publisher_cron` JSON event per
invocation. Completed events report job and Browser-session counts; failures contain
bounded diagnostics. Capture and public-delivery failures emit separate sanitized
events.

`/__asset-publisher/health` is the no-store release identity endpoint. It reports
the twenty-job limit, Cron schedule, Renderer identity, Worker version metadata,
and deployed Git SHA used by release smoke checks.

Public assets use a stable path such as
`/published/factions/<faction-id>/sheet.pdf`. The path always selects the current
object. Query parameters do not select a version: bare URLs, arbitrary queries,
empty or repeated `v` values, and legacy signed `v` values all resolve the same
file. The optional cache buster only changes the URL seen by a client.

The bucket stays private and contains one current object per published asset. The
Worker checks the current R2 ETag before reusing its query-independent internal
cache. Browser responses use `Cache-Control: no-cache` with that ETag, so unchanged
conditional requests receive `304` and replacements are observed at the same path.

Rulebook HTML uses two public paths with different cache contracts. The permanent
`/published/rulebooks/<rulebook-id>/editions/<edition-number>/rulebook.html` path
serves immutable bytes with `X-Robots-Tag: noindex`. The revalidated
`/published/rulebooks/<rulebook-id>/rulebook.html` path resolves the highest ready
Edition on every request and supplies its canonical URL. A failed or preparing
newer Edition cannot move that selection backward, and a soft-deleted Rulebook is
not delivered even though its R2 bytes remain.

Administrators inspect jobs, change the pickup switch, and see Renderer revisions
at `/__jobs`. That route exposes no embedded `asset_data` and provides no manual job
actions.

## Local checks

```bash
bun run publisher:types
bun run publisher:types:check
bun run publisher:typecheck
bun run publisher:test
bun run publisher:assets
bun run publisher:assets:check
bun run publisher:font-regression
bun run publisher:capture-contract-regression
bun run publisher:dry-run
bun run publisher:manifest:verify-changed
bun run publisher:release:verify
bun run publisher:startup
```

`publisher:capture-contract-regression` serves the built capture bundle the narrow
Browser DTO in Chromium and verifies capture readiness, payload identity, physical
page bounds, corrupt-resource rejection, and the two-page PDF contract.

`publisher:release:verify` is the exact pre-PR publisher gate. It assembles and dry-runs the
unified Worker release, regenerates the Renderer manifest, and rejects an uncommitted manifest
change. The Renderer identity covers the capture bundle, renderer static assets, runtime closure,
and PDF contract. It deliberately excludes application-only SPA shell and hashed chunk files so
ordinary application UI changes do not create platform-specific Renderer identities.

The standard `bun run check` suite runs `publisher:manifest:verify-changed`. It compares the branch
with its main-branch merge base and skips the publisher build unless a Renderer-identity input
changed. The input classifier lives beside the manifest builder so the check includes capture
source, runtime files, static source assets, generators, and pinned toolchain versions. When an
input changed, the check runs the publisher dry-run and fails if that regenerates the tracked
Renderer manifest. The failure prints the exact rebuild and commit instructions.

The pull-request publisher job runs the same command on Linux with the production Convex URL.

The protected `main` workflow deploys Convex, initializes absent Publication
settings, builds and deploys the Worker with the merged Git SHA, smokes both public
origins, then asynchronously activates only higher checked-in Renderer revisions.
It never pauses current work and never selects an older Renderer.
