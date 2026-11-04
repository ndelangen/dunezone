# Play bot prototype

An early experiment for [#2226](https://github.com/ndelangen/dunezone/issues/2226): a language-model bot that takes a seat at a
Dune Play table, for a few 1v1 development games. It is not a product feature and nothing here ships.

## What it does

- Joins a game through the same messages a player's page sends, so it sees only its own seat's view and the room checks
  everything it does as it checks a human.
- Wakes when a player **picks up its faction token**, talks to it at the table or privately, or the bidding comes to it.
- Thinks with an agent CLI that is already signed in on your machine (**Claude Code** or **Codex**), so a game costs nothing
  beyond that subscription. Each wake is one non-interactive run of about 10 to 20 seconds.
- Acts through a handful of game tools, which the CLI reaches through a small MCP bridge: `look`, `territories`,
  `faction_sheet`, `move_pieces`, `undo_last_move`, `say`, `command` (any game command as JSON), `command_help` and `note`.
- Keeps private notes between wakes (deals, plans, rulings), so "that's not legal" becomes a ruling it remembers.

## Try it without a browser

A scripted player and the bot play a short exchange on the real game Worker, under Play's own test runtime: no Docker, no
Convex, no accounts.

```bash
PLAY_BOT_BRAIN=claude bun run play:bot:demo   # or codex; leave it out for a scripted brain that checks the plumbing
```

The transcript and the bot's notes land in `tools/play-bot/out/`.

## Play against it in the browser

1. `bun run play:bot:stack` boots the isolated local Play stack (the one the hosted browser flows use), seeds the test
   ruleset, makes games start at Turn 1, and creates two accounts. It prints where to sign in and the password.
2. Sign in as `player@example.invalid` and create a 2-player game on the seeded ruleset.
3. `bun run play:bot -- --game <your game page URL> --brain claude` (or `--brain codex`). Approve the bot's seat request.
4. Pick up the bot's faction token when you want it to act, or talk to it. Tell it "that's not legal" and why, and it takes
   the move back.

`--style "<a sentence>"` gives the bot a personality and strength, and `--model` picks the model its CLI uses.

## Limits

- Moving pieces drops them at the middle of a territory; the room settles them in. It does not handle sectors or the
  storm itself, so the rules stay with the players, as Play intends.
- Battle plans and bidding go through the raw `command` tool with its JSON schema, so expect the bot to ask or fumble there.
- Codex is wired the same way as Claude Code but has not been tried yet.
