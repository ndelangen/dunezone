# Play bot prototype

An early experiment for [#2226](https://github.com/ndelangen/dunezone/issues/2226): a language-model bot that takes a seat at a
Dune Play table, for a few 1v1 development games and a tech demo. It is not a product feature and nothing here ships.

## What it does

- Joins a game through the same messages a player's page sends, so it sees only its own seat's view and the room checks
  everything it does as it checks a human.
- **Wakes only when someone writes to it**, at the table or in private chat. Nothing else (not its faction token, not the
  bidding) makes it act.
- **Plays the whole game from the draft.** Before factions are dealt there is no chat, so it drafts the faction you name with
  `--want`, confirms Ready, and in trading swaps for that faction if the deal gave it another (`lobby.ts`). From setup on it
  follows the table: it keeps its Traitor and returns the rest, draws starting cards when told, takes starting spice if its
  reserve does not already hold it, places starting troops and confirms Ready.
- **Accounts for everything it owns.** Its view lists its spice reserve, every card in hand by kind (Traitor, Treachery,
  Spice, alliance), each leader and where it is, each troop kind split between reserve, territories and the Tanks.
- Thinks with an agent CLI that is already signed in on your machine (**Claude Code** or **Codex**), so a game costs nothing
  beyond that subscription. Each wake is one non-interactive run of about 10 to 20 seconds.
- Acts through game tools served over a small MCP bridge: `look`, `territories`, `faction_sheet`, `move_pieces`,
  `undo_last_move`, `keep_traitors`, `draw_card`, `take_spice`, `set_ready`, `say`, `command` (any game command as JSON),
  `command_help`, `rulebook` and `note`.
- Keeps private notes between wakes (deals, plans, rulings), so "that's not legal" becomes a ruling it remembers.
- **Remembers what its seat saw without relying on the model** (`memory.ts`): every change since the game began (the
  table itself keeps only 8 events) and the cards it has seen outside its hand. Play gives a card a new id when it moves
  into or out of a hand, so the harness follows cards as a person would: a peeked card that leaves its pile as one
  faction's hand grows is now in that hand. Each wake shows that knowledge and the changes since the last one.

## The whole demo in one command

```bash
bun run play:bot:up            # GF9 with two bot accounts; --bots 3 for more, --ruleset <slug> for another ruleset
```

It copies the ruleset's catalogue from the live site the first time (read-only; `--pull` copies it again), starts the
local stack (backend and frontend) on that copy, then the bots' manager page, and prints what to do: sign in, create the
game, paste its URL into the manager page with the bots' factions, and approve each seat request. Ctrl-C stops
everything, the bots included.

## Start and watch the bots

One harness is one bot: a process that holds that bot's seat, serves its tools as an MCP endpoint (`/mcp`, which the
bot's agent CLI reaches with its seat token in the connection header) and shows that bot on a page of its own.
One page manages them all:

```bash
bun run play:bot:watch                                                # http://127.0.0.1:4747
bun run play:bot:harness -- --game <URL> --faction fremen             # or one harness by hand
```

On the manager page, paste the game's URL, list the factions and press Start bots: it starts one harness process per
faction. Each claims a bot account no other harness holds (an account whose harness ended is free again), so harnesses
never sign in as the same bot, and takes a free port for its own page. The manager shows every bot on the machine,
however it was started, with its status (joining, asking for a seat, seated, playing, thinking, not running), a link to
its harness and a Stop button, which ends that harness and gives its account back. The harnesses keep running if the
manager page stops. Per bot it lists what woke it (or why a message did not), every tool call and whether the room refused
it, what it concluded, how long it thought, and its tokens (with the share read from the cache) and cost so far. Private
notes stay hidden unless you tick "Show private notes", so a screen recording does not give a bot's plans away.
`--dir` points the page at a demo's output instead, such as `tools/play-bot/out/three-player-<stamp>`.

## What a wake costs, and the rules

Each wake is one prompt, built so the model learns the most from the fewest tokens:

- **A stable opening** (how to play, the tools, the bot's faction sheet with its leaders and advantages as short lines)
  comes first and stays the same between wakes, so the CLI's prompt cache serves it at a tenth of the price after the first.
- **The board, compact**: your own holdings in full with their ids, the board by territory, everyone else's off-board
  pieces as counts, and only the table log since the bot last looked. About 10,000 characters (some 2,500 tokens) in setup.
- **The rulebook is never in the prompt.** `bun run play:bot:pull` also copies the ruleset's published Rulebooks into
  `rulebook.md` beside the catalogue. The `rulebook` tool lists its sections, searches them (a few words return the best
  matching sections, cut to about 2,400 characters) or reads one by title or page anchor (`#traitors`), so a bot that is
  unsure reads one section, not 18,000 tokens of rules. The bot can cite the anchor when it justifies a move. The headless
  demos use the GF9 core rules from `content/gf9/core-rules.json`.

The transcript ends every wake with its time, tokens and cost, as Claude Code (`--output-format json`) and Codex
(`--json`) report them.

## Rules for whoever runs it

- **Never create a game for the bot.** The person creates the game in their browser and gives you its URL; the bot joins only
  that game. If something fails, report it instead of starting another game.
- Everything stays local: no deploys, no production writes. The catalogue copy below only reads public pages.

## Real content: copy the GF9 catalogue

```bash
bun run play:bot:pull                  # GF9; --ruleset <slug> for another
```

This reads the live site's public catalogue (the same queries a signed-out visitor's game makes) and downloads every image
those answers name, into `tools/play-bot/out/mirror/gf9/`. It needs network access to dune.zone and its Convex deployment.

## Try it without a browser

A scripted player and the bot play the opening of a real game on the game Worker, under Play's own test runtime: no Docker,
no Convex, no accounts. It runs the draft, trading, the Traitor deal, starting cards and spice, starting troops, then a
"that's not legal" challenge and a private deal offer.

```bash
PLAY_BOT_BRAIN=claude PLAY_BOT_MIRROR=tools/play-bot/out/mirror/gf9 bun run play:bot:demo
```

Leave out `PLAY_BOT_BRAIN` for a scripted brain that checks the plumbing, and `PLAY_BOT_MIRROR` to use the tutorial's
catalogue copy that is in the repository. `PLAY_BOT_FACTION` and `PLAY_HUMAN_FACTION` choose the factions (Fremen and
Emperor). The transcript and the bot's notes land in `tools/play-bot/out/`.

## Play against it in the browser

1. `bun run play:bot:stack -- --mirror tools/play-bot/out/mirror/gf9` boots the isolated local Play stack, installs the
   mirrored images, and creates two accounts. It prints where to sign in and the password. The game Worker reads the
   ruleset's decks and factions from the mirror through `catalogue-proxy.ts`. Games play their draft, trading and setup.
2. Sign in as `player@example.invalid` and create a 2-player game on "GF9 (local copy)".
3. `bun run play:bot -- --game <your game page URL> --brain claude --want fremen` (or `--brain codex`). Approve the bot's
   seat request. Draft your own faction and confirm Ready; the bot drafts Fremen.
4. From setup on, talk to the bot when you want it to act. Tell it "that's not legal" and why, and it takes the move back.

`--style "<a sentence>"` gives the bot a personality and strength, and `--model` picks the model its CLI uses.

## One person and two bots

Each bot is a separate `bun run play:bot` process with its own account, its own notes and transcript under
`tools/play-bot/out/bots/<name>/`, and its own CLI working directory outside the repository. Nothing at the table marks a
seat as a bot: the accounts have ordinary names (Alex, Sam, ...), and each bot is told to treat every other player as a person.

1. `bun run play:bot:pull` copies GF9 and stops early if it cannot deal Fremen, Harkonnen and Emperor or lacks a deck.
2. `bun run play:bot:stack -- --mirror tools/play-bot/out/mirror/gf9 --bots 2`
3. Create a 3-player game on "GF9 (local copy)" as `player@example.invalid`, draft Emperor and confirm Ready.
4. `bun run play:bot:watch` in another terminal, open http://127.0.0.1:4747 beside the game, paste the game URL and
   press Start bots with `fremen,harkonnen`: two harnesses, one per bot starts two separate bots: account 1 drafts Fremen, account 2 Harkonnen
   (`--factions` changes that). Approve both seat requests. The deal is random among the three drafted factions; during
   trading each bot offers a swap to whoever holds its faction, so accept the swap offers you get.
6. Name the faction you are talking to at the table ("Fremen, ..."). At a table of three or more a bot wakes on table
   messages only when its faction is named, and on every private message. Each bot wakes at most 12 times in ten minutes
   (`--max-wakes`), so two bots cannot talk to each other without end.

The headless check: `bun run play:bot:demo -- tools/play-bot/three-player.demo.ts` (add `PLAY_BOT_BRAIN=claude` to have
Claude Code think for both). It checks that naming one faction wakes only that bot and that neither bot ever sees the other's
notes.

Isolation of the CLI itself: Claude Code runs with `--setting-sources project,local` (so your own ~/.claude settings and
CLAUDE.md stay out), `--no-session-persistence` and auto-memory off; Codex runs in the bot's own directory but still reads
your ~/.codex configuration. Both use your machine's sign-in, so both bots share your subscription's usage.

A game with only bots is possible in principle: a person still creates the game and holds its first seat, which a third
bot cannot take over yet.

## Limits

- The create page's preview of the ruleset still lists the local placeholder decks and factions; the game itself deals the
  mirrored ones.
- Moving pieces drops them at the middle of a territory; the room settles them in. It does not handle sectors or the
  storm itself, so the rules stay with the players, as Play intends.
- Battle plans and bidding go through the raw `command` tool with its JSON schema, so expect the bot to ask or fumble there.
- The pull and the browser path have not been run yet; the headless demo passes with the scripted brain.
