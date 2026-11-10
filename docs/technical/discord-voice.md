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

The Worker commits a bounded nudge outbox entry with the saved message. It enforces a five-minute
cooldown per target seat before any Convex call, so repeated names do not cause repeated network
work. Only delivery identifiers and the waiting faction's public name leave the Worker;
conversation text stays there. Delivery runs after the chat commits and does not delay the chat response.

Convex checks the game's credential, opt-in and channel, then resolves the target's current linked
Discord account. Its rate-limiter component enforces the same per-seat spacing. Before every POST,
it checks current seat occupancy, account state, the original account link and the deployment
switch. Linking Discord identifies a mention target; it does not control voice access.

The message says `<@target> Faction is waiting on you in Game.` Its mention allowlist contains only
that target, with automatic mention parsing disabled. Discord applies channel access and the
recipient's notification settings. An accepted message does not prove a desktop or phone push.

Undelivered nudges expire after two minutes. Transport retries and definite Discord 429 responses
are bounded. A lost or ambiguous Discord response is never replayed, because the message might
already exist. Discord's nonce deduplication is additional protection with a short, unspecified
window, not a durable delivery guarantee.

Successful and dropped delivery records expire after two minutes. Sanitized failures remain for
one day, with recipient identity removed. An interrupted send becomes an unconfirmed outcome and
is not replayed. Expiry jobs check the event ID before changing a reused seat record.

## Configuration and administration

Production needs `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` and comma-separated
`DISCORD_GAMES_CATEGORY_IDS` in Convex environment variables. Never put them in `admin_settings`
or a snapshot. New games use the current configuration; existing channel records keep their own
server and channel IDs. Cloud development remains unconfigured.

The Discord page under Admin tools can pause creation, pings and cleanup without a deploy.
Existing channels and invites remain available while paused. Its deployment-local setting is
excluded from snapshots and cannot enable an unconfigured deployment.

The page lists tracked channels, cleanup deadlines and sanitized delivery failures. It fetches a
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
Ordinary chat does not call Convex for nudges. Explicitly disabled games skip nudge storage reads,
and non-Discord directory summaries skip the channel lookup. The pending outbox and cooldown are
bounded by the game's seats.

One successful nudge uses one Discord POST. The existing Convex scheduler runs delivery and expiry;
the rate limiter, claim, pause check and result write add backend work. Idle channel reconciliation
uses the existing 15-minute cron, with no Discord request when nothing is due.
The admin page has bounded reads and manual orphan refresh. Do not add polling or aggregate tables
without measured need.

After a release, check both Worker health identities, create an opted-in game, and verify the invite
and VC text message destination. Repeat a nudge inside its cooldown and check that no second
message appears. Check unlinked recipients and paused integration with synthetic local data.
Inspect the admin page for unconfirmed or failed sends, and Worker diagnostics for operation
`nudge`. Use the existing [Convex usage report](./convex-usage.md) to compare execution and database
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
