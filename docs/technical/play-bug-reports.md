# Play bug reports

The compass's **Report a bug** command opens a panel with one required problem description.
The player must acknowledge that the report publishes hidden game information before sending it.
The panel shows collection and GitHub progress, then links to the issue labelled `reported-bug` in
`ndelangen/dunezone`.
The issue title comes from the first 120 characters of the description, with whitespace collapsed.

## What a report contains

The game's Durable Object exports its current stored snapshot, including every faction's hand,
deck order, unrevealed predictions and battle plans. It also exports the retained ruleset and faction
captures, active carries and pointers. It omits room metadata, authentication credentials and
account identifiers. Conversations include IDs, timestamps, faction pairs, ordering and read
positions. Message text becomes `-redacted message, original length: n-`, where `n` counts Unicode
characters. Author names are omitted. The server includes the latest 10,000 messages and records
the total and any omitted count.
The export also includes the latest page of Game and Audit events, with each page's continuation flag.

The browser contributes its current game snapshot and local table projection, playback state,
selected piece, connection state, viewport, pixel ratio, language, user agent and online status.
It also includes censored chat history, pending sends, delivery errors and history-loading state.
The browser sends its conversation data to the game room over the authenticated request. The room
censors it before serializing the public export. Known message bodies in console strings are also
censored, including messages serialized as JSON. Existing censorship markers keep their original
length on repeated passes.
Its console output, resource errors, uncaught exceptions and unhandled promise rejections are
captured while the Play page is mounted. The buffer holds at most 500 entries and 256,000
characters, with at most 8,192 characters per entry. It records how many entries were dropped or
clipped. Timestamps measure milliseconds since browser navigation. Credentials and email addresses
are redacted before export. Browser data and the problem description remain untrusted input.

The Game log records the player's export request before the room returns any state. On success it
records the public issue link. Both entries use a stable export ID, so retries cannot duplicate them.
Open Game logs receive the entries immediately; older pages keep their selected cursor. The log
keeps the activity after account deletion, with the existing deleted-account name treatment.

## Authentication and delivery

The browser sends an existing game-scoped seat pass to the same-origin Game Worker. It never sends
its Convex login token to the Worker. The room checks the pass signature, expiry, game and account
revocation cutoff. A read-only Convex function also checks the current account and session, so
sign-out, deletion and inactivity expiry take effect for report submissions and status reads.
Convex stores no report, progress, attachment or receipt.

One `BugReports` Durable Object per authenticated account owns the rate limit and receipts.
An account may submit one report per minute and five per hour. A client-generated request ID
deduplicates concurrent submissions and retries within that account. Each accepted report gets a
separate server-generated export ID, so copying another report's public ID cannot overwrite its
attachment. Receipts retain only IDs, times, status and the resulting issue URL.

The full JSON export lives in the private R2 bucket `dunezone-bug-report-states`. The Game Worker
serves individual exports through the download link published in the GitHub issue. These exports
are public to anyone with the link. The bucket has no public listing, public bucket URL or custom
domain. Downloads use attachment disposition, JSON content type, `nosniff` and no caching.

The GitHub App's private key stays in Worker secrets. The Worker creates a short-lived app JWT,
requests an installation token scoped to dunezone and issue-write permission, then creates an issue
with the fixed label. Clients cannot choose a repository, label, API URL or permission.
The Worker refuses redirects from GitHub. Report text cannot insert HTML or notify arbitrary
GitHub users through mentions.

The receipt moves to `creating` before the GitHub POST. If the response is lost or the object
restarts, it searches recent labelled issues for the report's marker. It never repeats an ambiguous
issue POST. A completed receipt retries delivery of its Game log entry until the room acknowledges
it. Failed collection leaves the description available in the panel.

## Service setup

Register a private GitHub App owned by `ndelangen`, with repository **Issues: read and write**
and GitHub's mandatory metadata read permission. Leave webhooks, OAuth callbacks, user
authorization and all other optional permissions disabled. Install it on **only dunezone**.

The registered app is [Dune Zone Play Reports](https://github.com/apps/dune-zone-play-reports),
app ID `5478813`, installation ID `175428436`. The installation selects only `ndelangen/dunezone`.
Its [512px bot logo](play-bug-reports/bot-logo.png) is a gold scarab with an exclamation mark on charcoal.

Set these secrets on the existing `dunezone-game` Worker using `wrangler secret put` with stdin
from a protected file, never a command-line secret value:

- `BUG_REPORT_GITHUB_APP_ID`
- `BUG_REPORT_GITHUB_INSTALLATION_ID`
- `BUG_REPORT_GITHUB_PRIVATE_KEY`

Create the private `dunezone-bug-report-states` bucket before deployment with
`wrangler r2 bucket create dunezone-bug-report-states`. The configured bucket name disables
automatic provisioning. Keep public bucket access disabled; individual exports are served by the Worker.

Create the `reported-bug` repository label before the first report. The checked-in Worker
configuration adds the R2 binding and the `v3` SQLite migration for the report coordinator.
The deployment and live-drift contracts check those exact bindings and allow only the three named
GitHub secrets. The established main deployment publishes both the Convex authorization function
and the Worker. Until all GitHub secrets are set, reporting returns an unavailable message.

No production application records need administrative edits or migration. Rolling back the
application can hide the command; existing exports and issues remain available. Revoke the
GitHub App installation to stop its issue access. Remove an exported R2 object only as a deliberate
data-deletion operation, and remove or edit its GitHub issue separately if needed.
