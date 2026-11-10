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
seat occupants and the target's linked Discord account. Its rate limiter is the only cooldown
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
REST work until its deadline; a channel or route limit affects only that attempted nudge.

## Configuration and administration

Production needs `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` and comma-separated
`DISCORD_GAMES_CATEGORY_IDS` in Convex environment variables. Never put them in `admin_settings`
or a snapshot. New games use the current configuration; existing channel records keep their own
server and channel IDs. Cloud development remains unconfigured.

The Discord page under Admin tools can pause creation, pings and cleanup without a deploy.
Existing channels and invites remain available while paused. Its deployment-local setting is
excluded from snapshots and cannot enable an unconfigured deployment.

The page lists tracked channels and cleanup deadlines. It fetches a
bounded page only while open. Untracked channels are discovered only on explicit refresh, only in
configured Games categories, and only after the creation window has passed. They are never deleted
automatically. A deliberate removal rechecks the target before deleting it. An unconfirmed creation
must be inspected in Discord; never blindly retry its POST.

Discarding a game schedules its channel for immediate deletion. When a game finishes, the channel
is renamed with an `(ended)` suffix. Hourly cleanup deletes ended channels that are empty. If play
continues before deletion commits, the channel stays and its original name is restored. A committed
deletion cannot be reversed. Active games still lose their channel after 14 days without game activity.
Missing channels are treated as already removed only when Discord returns Unknown Channel.
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
empty. Keep its snapshot-policy and provisioning-contract entries during this compatibility window.

After the new Worker has deployed and the approved retirement has finished, a separate narrowing
release removes the table, those entries and the temporary migration module. Deleting these delivery
records does not affect games, seats, linked accounts or voice channels. The records are disposable;
recovery means fixing forward while nudges continue as best-effort requests, not replaying old pings.
