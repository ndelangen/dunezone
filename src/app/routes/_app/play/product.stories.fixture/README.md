# Play page fixtures

These stories use one set of six faction definitions copied from the public Dune Zone catalogue on
21 September 2026. `factions.json` preserves each production id, slug, definition and update time.
`ruleset.json` preserves the Dreamrules public record, including its empty About field.

## Sources

- Public faction pages: `https://dune.zone/factions/<slug>` for House Atreides, House Harkonnen,
  Emperor, Spacing Guild, Fremen and Bene Gesserit. The public catalogue queries supplied the JSON.
- Faction tokens: `/published/faction-tokens/<faction id>/token.jpg` on `https://dune.zone`.
- Leaders: `/published/leaders/<faction id>.<member id>/leader.jpg` on `https://dune.zone`.
- Troop discs and Traitor fronts: rendered through the existing game renderers using the copied
  faction definitions. These are local captures of real authored data; production does not yet
  publish those individual faces.
- Traitor back: the published Administrator preset. `traitor-preset.json` records its URL,
  revision and design. The JPEG is copied unchanged into the isolated story assets.
- Treachery cards: the existing Dreamrules published deck copies in
  `.storybook/static/play-fixtures/dreamrules`.
- Players: the public profile snapshot recorded in `drafting.stories.fixture.ts`. Their public
  avatar images are copied from `https://dune.zone/user-images/` into `play-fixtures/product`.

The JSON contains public authored content only. Authentication identities and admission secrets
are isolated test values. Conversations and event sequences are staged examples, never copied
private messages. Production is never contacted while viewing a story.

## State ownership

`product.stories.fixture.ts` builds the common game content. Each story changes only the state
needed for its scenario and passes the projected view through the existing game transport seam.
The scripted transport records commands and supplies specified replies. It does not execute game
rules. The real route and browser-local Convex handlers still own page behavior.

Six players are normal. Waiting for players, last-player departure, and a trading vacancy use
fewer occupied seats to demonstrate their behavior. Observers retain the game's seat count.
