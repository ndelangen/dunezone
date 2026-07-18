# Scheduled faction-sheet publisher

The production Worker uses one `*/5 * * * *` Cron. Each invocation calls Convex `take-work` once.
An empty result exits without opening Browser Rendering; an assigned result contains at most twenty
independent item claims and is processed sequentially in one Browser session within a four-minute
work window. There is no Queue, item-count setting, poll endpoint, provider quota ledger, batch, or
run entity.

The Worker uses one server-side executor secret for `take-work`, `revalidate-item`, `complete-item`,
and `fail-item`. Browser capture uses the item's opaque claim token directly to read the protected
render payload. The separate cache-token signing secret is shared out of band with Convex. Neither
secret is checked in.

For every item, the Worker:

1. renders the protected payload and validates an exact two-page PDF;
2. revalidates the claim and generation immediately before storage;
3. creates the next public cache token;
4. conditionally overwrites `factions/<faction-id>/sheet.pdf`, storing that token with generation,
   renderer, and payload-hash custom metadata; and
5. starts exact Convex completion with the same token, etag, and byte count.

Rendering continues while bounded completion promises settle. The Browser is closed in `finally`
before outstanding completions are awaited or retried. Target-attributable render/output failures
call `fail-item`; Browser, network, R2, Convex, and deadline failures leave their claims leased so
claim expiry remains the recovery mechanism.

Public delivery requires a valid faction/type token. Objects written by this protocol additionally
require exact equality with `publisherCacheToken` in R2 custom metadata, so an interrupted overwrite
cannot expose unpublished bytes at an old URL. Objects without that metadata retain the legacy
valid-token behavior until their first new overwrite. The bucket stays private and retains exactly
one stable object per published faction.

The checked-in release contract keeps the private R2 binding, Browser binding, exact production
Convex URLs, a 30-second CPU limit, the four-minute work window, and the 8,000,000-byte PDF safety
cap. Remote Queue deletion and deployment are intentionally separate operations.

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
bun run publisher:startup
```

`publisher:capture-contract-regression` serves the built capture bundle a complete production-shaped
Convex item envelope in Chromium and requires the capture marker, payload hash, and two-page PDF
contract to succeed. The protected Convex producer and capture client also parse the same shared
strict schema, so adding or removing response fields cannot be accepted on only one side.

The PR publisher-release job builds on Linux with the exact production Convex URL and rejects any
change to `renderer-manifest.generated.ts`. Treat that CI-produced manifest as authoritative; a
manifest generated on another operating system may differ because it covers assembled build
artifacts as well as renderer source.

The protected `main` workflow runs source/config preflight, generated-type check, typecheck, one
production-URL asset build, assembled-asset verification, Wrangler dry-run, strict SHA-tagged
deploy, and health smoke. It pauses an active Convex publisher before the producer deploy and
reactivates the exact checked-in renderer only after the Worker smoke succeeds. An already paused
or disabled publisher retains that operator intent. The workflow does not provision or delete
Cloudflare resources, install or read secret values, or mutate publisher items directly.

**A failed production release intentionally leaves the Convex publisher paused.** Diagnose the
failed release and confirm producer/consumer compatibility before manually reactivating. After a
successful release, observe the first scheduled invocation and investigate any infrastructure
failure before remote Queue cleanup.
