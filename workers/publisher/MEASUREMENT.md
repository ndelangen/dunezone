# Publisher telemetry and observation contract

This Worker no longer measures or promotes queue-based capacity. The current release is one
scheduled `*/5 * * * *` Cron that asks Convex for one bounded item list and either exits empty or
processes that list in one Browser session.

There is no Queue message, promotion state machine, quota admission ledger, or runtime batch-size
dial to observe.

## Structured logs emitted by the Worker

The Worker emits bounded JSON logs only. Every log is sanitized through
`serializePublisherLogEvent`, then truncated by `boundedPublisherTelemetryEvent` if the final event
would exceed 8,192 UTF-8 bytes.

### `asset_publisher_cron`

Exactly one `asset_publisher_cron` event is emitted per scheduled invocation.

Empty invocation:

- `result: "empty"`
- `reason: "disabled" | "busy" | "no_eligible_work"`
- `leaseExpiresAt` when Convex reports a live claim

Successful invocation:

- `result: "completed"`
- `assigned`
- `rendered`
- `completed`
- `targetFailed`
- `stale`
- `unprocessed`
- `browserOpened`
- `browserClosed`
- `browserSessionId`

Failed invocation:

- `result: "failed"`
- bounded `error`

Every cron event also carries a fresh `invocationId` and the Cloudflare `scheduledTime`.

### `asset_publisher_item_read_error`

The capture route emits `asset_publisher_item_read_error` when the protected render read fails
before a PDF is captured. The log is sanitized and bounded like every other event.

## Health and release identity

`/__asset-publisher/health` is the release smoke and identity endpoint. It must report:

- `ok: true`
- `maxItems: 20`
- `schedule: "*/5 * * * *"`
- the configured renderer version and supported renderer list
- Worker version metadata from `CF_VERSION_METADATA`
- renderer identity derived from the generated renderer manifest

The health response is intentionally `Cache-Control: no-store`.

## What to observe after deploy

Before activation:

1. Confirm the health response matches the checked-in contract and deployed Git SHA.
2. Observe at least one `asset_publisher_cron` event with `result: "empty"`.
3. If Convex is paused or disabled, expect `reason: "disabled"`.
4. If an old claim is still leased, expect `reason: "busy"` and the reported `leaseExpiresAt`.
5. Confirm that empty outcomes open no Browser session.

After activation:

1. Capture one representative invocation that publishes multiple items in one Browser session.
2. Record the cron result counts (`assigned`, `rendered`, `completed`, `targetFailed`, `stale`,
   `unprocessed`) together with Browser Run and Cloudflare Worker platform evidence.
3. Verify stable delivery behavior by checking that an old cache-token URL fails after an overwrite
   until Convex completion exposes the new token.
4. Verify that repeated target-attributable failures park a generation only on the tenth
   consecutive failure, while infrastructure failures leave the claim leased for expiry recovery.

## Non-goals for telemetry

- no Queue attempt or ack metrics;
- no batch-promotion or rollout recommendation model;
- no provider-quota accounting or allowance reconciliation;
- no inference of final platform CPU, wall, or memory from internal phase timings; and
- no logging of claim tokens, secrets, raw URLs, payloads, or unsanitized diagnostics.
