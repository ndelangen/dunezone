# Discord voice and nudges

The creator can choose Discord voice during game creation. Each opted-in game gets one ordinary
voice channel and reusable invite. The game menu uses the same invite for players and spectators.
Discord applies the server and category permissions. Dune Zone does not grant individual channel
access.

## Manual nudges

During setup or play, a seated player can choose a Nudge command in the Compass for another
occupied seat. The commands appear when the game has a ready Discord voice channel and can be
found by the player's name, faction name or "nudge". Spectators, recall and playback cannot nudge.
Chat messages never trigger nudges, including names, `@mentions` and `/nudge` text.

The browser sends one nudge request through its existing game connection. The Worker validates
the current sender and target seats, then makes one authenticated Convex action call with their
identities and the sender faction reference. It does not wait for the directory summary to publish.
The request creates no chat message or saved game action and is not replayed on reconnect. A failed
call is logged without scheduling another attempt.

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
Chat does not call Convex for nudges. Only an explicit Compass command requests a nudge, and
non-Discord directory summaries skip the channel lookup.

One attempted nudge uses one Worker-to-Convex action call and at most one Discord POST. The
rate-limit mutation reads current eligibility and spends the per-seat quota. There are no delivery
or expiry jobs. Idle channel reconciliation uses the existing 15-minute cron, with no Discord
request when nothing is due. The admin page has bounded reads and manual orphan refresh.

After a release, check both Worker health identities, create an opted-in game, and verify the invite
and VC text message destination. Choose a Nudge command in the Compass, repeat it inside its
cooldown and check that no second message appears. Send a player name, `@mention` and `/nudge`
as chat messages and check that none sends a Discord message. Check unlinked recipients and
paused integration with synthetic local data.
Inspect Convex logs for dropped Discord nudges and Worker diagnostics for operation `nudge`. Use the existing [Convex usage report](./convex-usage.md) to compare execution and database
usage; do not infer invoice savings from request counts alone.

There are no automatic waiting or offline triggers, chat commands or DMs. A few real multiplayer
games and native notification checks are adoption evidence, separate from automated delivery tests.

## Sources

- [Discord messages and allowed mentions](https://docs.discord.com/developers/resources/message)
- [Discord rate limits](https://docs.discord.com/developers/topics/rate-limits)
- [Discord server limits](https://support.discord.com/hc/en-us/articles/33694251638295-Discord-Account-Caps-Server-Caps-and-More)
- [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)
- [Discord voice events and intents](https://docs.discord.com/developers/events/gateway)
- [Convex Node actions](https://docs.convex.dev/functions/runtimes#nodejs-runtime)
