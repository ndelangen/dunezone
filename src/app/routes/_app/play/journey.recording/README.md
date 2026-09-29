# Play journey recording

`journey.json` is one six-seat game the real game Worker played, recorded for the stories in
`../journey.stories.tsx` (Storybook: Pages / Play / Journey).

## Regenerate

```sh
bun run play:record
```

The recorder is `workers/game/journey.record.native.test.mjs`. It provisions a real game on the same isolated
Miniflare runtime every native suite uses, seats six synthetic accounts and a spectator, and plays drafting,
trading, Traitor selection, starting forces and one full turn with a spice blow, two Treachery purchases, a
shipment and a battle, then declares a winner. After each step it keeps the full view each seat and the
spectator received. Re-record after any change to the game Worker or the protocol that the stories should
show; `journey.stories.fixture.test.ts` fails when a recorded view no longer parses.

## Contents

- Content: the six public factions of `../product.stories.fixture/factions.json`, one Treachery deck of
  Snooper cards and one Spice deck of Broken Land cards (`.storybook/static/play-fixtures/dreamrules`).
  Only House Atreides and House Harkonnen have Traitor fronts among the story fixtures, so the other
  factions' Traitors deal without a face. The fixture troops carry no authored combat values, so the
  battle is fought with leaders and spice.
- People: the synthetic accounts are renamed to the public profiles the other Play stories seat
  (Twaffle, Thialfi, Fectumbra, Erickenneth, Ridwan, Argelius) and the spectator Klyzx.
- Faction assignment and shuffles are random, so each recording deals differently.
- Size: every value that repeats between viewers and steps is stored once in `pool` and referenced
  as `{ "$": key }`. Image addresses use `{{origin}}`, which the stories replace with Storybook's origin.
