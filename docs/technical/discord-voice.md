# Discord voice and nudges

The creator can choose Discord voice during game creation. Each opted-in game gets one ordinary
voice channel and reusable invite. The game menu uses the same invite for players and spectators.
Discord applies the server and category permissions. Dune Zone does not grant individual access,
poll membership, or connect a gateway bot.

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

Normal cleanup deletes a channel 24 hours after the game first ends or is discarded, or after
14 days without game activity. Activity cannot reverse an already committed deletion. Missing
channels are treated as already removed only when Discord returns Unknown Channel.

## Cost and monitoring

There is no additional bot runtime. The feature still consumes usage on the existing services.
Ordinary chat does not call Convex for nudges. Explicitly disabled games skip nudge storage reads,
and non-Discord directory summaries skip the channel lookup. The pending outbox and cooldown are
bounded by the game's seats. No polling or permanent connection is added.

One successful nudge uses one Discord POST. The existing Convex scheduler runs delivery and expiry;
the rate limiter, claim, pause check and result write add backend work. Idle channel reconciliation
uses the existing 15-minute cron, 96 executions per day, with no Discord request when nothing is due.
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
