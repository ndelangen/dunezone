# Discord voice and nudges

The creator can choose Discord voice during game creation. Each opted-in game gets one ordinary
voice channel and reusable invite. The game menu uses the same invite for players and spectators.
Discord applies the server and category permissions. Dune Zone does not grant individual channel
access.

## Manual nudges

In the existing faction or table conversation, a message containing only another seated player's
faction or display name requests a nudge. Matching ignores case and surrounding whitespace, and
accepts an optional `@` or `/nudge` prefix. A faction conversation can nudge only its peer. Ambiguous
names, self names and recall chat do nothing. The message itself is saved and displayed normally.

After saving a matching message, the Worker makes one authenticated Convex action call with the
sender and target seat identities and the sender faction reference. It does not wait for the directory
summary to publish. Conversation text stays in the Worker, and a failed call does not delay chat or
schedule another attempt.

Convex checks the game's credential, live state, voice setting and channel, then resolves the current
seat occupants and the target's linked Discord account. Both sender and recipient must resolve to
active, nonanonymous accounts, including through merge aliases. Its rate limiter is the only cooldown
authority: one nudge per target seat every five minutes. Linking Discord identifies a mention target;
it does not control voice access. Convex compares those identities with its current directory seats
and drops mismatches, so a late seat update cannot mention the previous occupant. Activity-only
directory updates do not block pings.

The message says `<@target> Faction is waiting on you in Game.` Its mention allowlist contains only
that target, with automatic mention parsing disabled. Public names are escaped as Discord markdown.
Discord applies channel access and notification settings; an accepted message does not prove a
phone or desktop notification.

New Workers call the `sendNudge` action. During rollout, the old `publishNudge` mutation stays
authenticated and acknowledges legacy events without sending them. A new Worker whose action is
not deployed yet logs and drops that attempt while its chat message remains saved.

A nudge makes one POST. Discord errors, including 429 responses, are logged and dropped. There is
no outbox, retry, nonce or per-nudge delivery record. An explicit global Discord 429 holds other bot
REST work until its deadline; a channel or route limit holds requests in that scoped bucket. The
failed nudge itself is not retried.

## Configuration and administration

Production needs `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` and comma-separated
`DISCORD_GAMES_CATEGORY_IDS` in Convex environment variables. Never put them in `admin_settings`
or a snapshot. New games use the current configuration; existing channel records keep their own
server and channel IDs. Cloud development remains unconfigured.

The Discord page under Admin tools can pause creation, pings and cleanup without a deploy.
Existing channels and invites remain available while paused. Its deployment-local setting is
excluded from snapshots and cannot enable an unconfigured deployment.

The page lists tracked channels and cleanup deadlines. It fetches a
bounded page only while open. Cleanup distinguishes active inactivity deadlines, finished setup or
rename work, hourly occupancy checks and completed removal. Paused rows show that cleanup is paused.
Pending and creating rows offer Retry now, which queues the guarded reconciliation and records its
scheduled time. It cannot bypass a live lease or a Discord request's rate limit.
Untracked channels are discovered only on explicit refresh, only in
configured Games categories, and only after the creation window has passed. They are never deleted
automatically. A deliberate removal rechecks the target before deleting it.

Before creating a channel, Convex saves an exact temporary name, `dune-play-{gameId}`, and the selected
category. The temporary name is briefly visible. A successful response saves the channel ID before
renaming it to the game name or requesting an invite. A lost response leaves that attempt marked as
creating. Recovery lists the saved guild after the old owner has released or lost its 31-minute lease.
One exact matching voice channel in the saved category is adopted. A replacement requires a complete
successful listing, the saved category visible as a category, and no visible marker match or conflict.
The replacement rechecks its lease, creation attempt, current game need and deletion intent, and spends
a new creation reservation. Each ambiguous replacement goes through the same recovery process.

This establishes that no matching room is visible, not that none exists. Administrator renames, moves
or permission changes, and late Discord commits, can defeat correlation. Conflicting matches or a
missing category remain retryable without another POST. Older uncertain attempts without a saved
marker need administrator inspection. Configuration changes affect new reservations only; existing
creation, recovery and cleanup stay pinned to their saved guild and category, using the current token.

Discarding a game schedules its channel for immediate deletion. When a game finishes, the channel
is renamed with an `(ended)` suffix. Hourly cleanup deletes ended channels that are empty. If play
continues before deletion commits, the channel stays and its original name is restored. A committed
deletion cannot be reversed. Active games still lose their channel after 14 days without game activity.
Missing channels are treated as already removed only when Discord returns Unknown Channel.
An hourly check that confirms Unknown Channel retires the tracked record directly after rechecking
the game, channel identity, revision and pause setting. It sends no redundant DELETE.
The empty observation commits deletion. Discord has no atomic delete-if-empty operation, so a
join after that decision does not cancel it.

Hourly cleanup runs as a short Node action in Convex. It opens a Discord Gateway connection with
intents 129, reads current voice occupancy, then disconnects. There is no connection between checks.
An unavailable or incomplete snapshot leaves the channel for a later check. The bot token stays in
Convex, and voice participant identities are never saved. This uses the existing bot permissions.

Pausing the integration blocks new channel work and hourly occupancy checks. Deletion rechecks the
pause setting and the game's current stage before committing, so a stale snapshot cannot delete a
continued game.

## Cost and monitoring

Hourly cleanup uses brief action time on the existing Convex deployment. It adds no Worker service
or continuously active Durable Object. With no ended channels to check, it makes no Discord request.
Ordinary chat does not call Convex for nudges. Games without Discord voice skip nudge matching,
and non-Discord directory summaries skip the channel lookup.

One attempted nudge uses one Worker-to-Convex action call and at most one Discord POST. The
rate-limit mutation reads current eligibility and spends the per-seat quota. There are no delivery
or expiry jobs. Idle channel reconciliation uses the existing 15-minute cron, with no Discord
request when nothing is due. The admin page has bounded reads and manual orphan refresh.

The creator cap counts pending, creating and ready tracking rows. A legacy discarded game can retain
a ready row until its stored reconciliation deadline arrives. Creator backfill preserves that deadline,
so the row keeps its cap slot until normal retirement changes its state. Cap checks add no provider
requests or game scans to reconcile those older records.

Lifecycle REST calls make one attempt. A definite short rate limit schedules up to two retries at
Discord's deadline, then uses the existing 15-minute backoff. Each scheduled retry acquires a fresh
lease and rechecks current work. The channel keeps the short retry budget so scheduled work and
cron recovery use the same attempts. Its deadline and revision fence stale work. A retry of the same
definitely rejected creation reuses its creation reservation. Ambiguous attempts use the recovery
checks above and cannot borrow that short-retry reservation. Interactive
admin requests retain their two short retries; nudges and occupancy checks never retry inline.

Every request checks a persisted gate. Only explicit global limits block all bot work. Other limits,
including shared limits, use the observed bucket plus major guild or channel ID. Without a bucket
header, the exact method/route template and major resource identify the hold. A new lifecycle operation
does not inherit an old operation's scoped delay. Route aliases are written only when changed; a 429
combines its alias and hold update. A rate limit received by an in-flight request survives pause and
resume; pausing still blocks new requests. Rare observation mutations prune at most eight expired scoped
holds through an expiry index. No cleanup cron is added. The admin page does not read these holds
for every displayed row.

Finish transitions compare the previous and accepted directory stages in one transaction. The
obsolete `ended_at` channel marker remains in the schema only for the retirement window.
`discordMigrations:discord_channel_end_marker_retire_v1` removes that field in batches of 50, and
`discord_channel_end_marker_verify_v1` checks completion. Run retirement only within the confirmed
production scope, after the new transition code is deployed. No channel, game, invite, lease or
ownership value changes in that retirement.

After a release, check both Worker health identities, create an opted-in game, and verify the invite
and VC text message destination. Repeat a nudge inside its cooldown and check that no second
message appears. Check unlinked recipients and paused integration with synthetic local data.
Inspect Convex logs for dropped Discord nudges and Worker diagnostics for operation `nudge`. Use the existing [Convex usage report](./convex-usage.md) to compare execution and database
usage; do not infer invoice savings from request counts alone.

The automatic-waiting triggers, DMs, community-server move and voice-presence display remain later
work. A few real multiplayer games and native notification checks are adoption evidence, separate
from automated delivery tests.

## Sources

- [Discord messages and allowed mentions](https://docs.discord.com/developers/resources/message)
- [Discord rate limits](https://docs.discord.com/developers/topics/rate-limits)
- [Discord server limits](https://support.discord.com/hc/en-us/articles/33694251638295-Discord-Account-Caps-Server-Caps-and-More)
- [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [Discord voice events and intents](https://docs.discord.com/developers/events/gateway)
- [Convex Node actions](https://docs.convex.dev/functions/runtimes#nodejs-runtime)

## Retiring the old nudge table

The first release stops all nudge-table writes and leaves the legacy schema in place. The internal
`discordNudgeMigrations:retire` migration deletes only rows in `play_game_discord_nudges`, in batches
of 100. It runs only after approval of that production cleanup; it is deliberately absent from the
automatic migration manifest until then. `discordNudgeMigrations:verifyRetired` proves the table is
empty. The dashboard returns an empty legacy `nudgeErrors` array so older admin tabs keep working.
Keep its snapshot-policy and provisioning-contract entries during this compatibility window.

After the new Worker has deployed and the approved retirement has finished, a separate narrowing
release removes the table, its active provisioning entries, the dashboard compatibility field and the
temporary migration module. Its snapshot exclusion moves to the retired-table list because Convex
exports can retain removed tables. Deleting these delivery records does not affect games, seats, linked accounts or
voice channels. The records are disposable;
recovery means fixing forward while nudges continue as best-effort requests, not replaying old pings.
