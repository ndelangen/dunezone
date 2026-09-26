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
  publish those individual faces. `preparedSnapshot` deals each viewer's kept Traitors from the
  first nine leaders in faction order, so only those nine fronts are kept:
  `house-atreides-traitor-0` to `-4` and `house-harkonnen-traitor-0` to `-3`. The other 21 fronts
  were local renderer captures too. They return through the published components of
  [#1228](https://github.com/ndelangen/dunezone/issues/1228), not as new captures.
- Traitor back: the published Administrator preset. `traitor-preset.json` records its URL,
  revision and design. The JPEG is copied unchanged into the isolated story assets.
- Treachery cards: the card back and the Snooper face, copied from the published Dreamrules deck
  into `.storybook/static/play-fixtures/dreamrules`.
- Players: the public profile snapshot recorded in `drafting.stories.fixture.ts`. Their public
  avatar images are copied from `https://dune.zone/user-images/` into `play-fixtures/product`.

The JSON contains public authored content only. Authentication identities and admission secrets
are isolated test values. Conversations and event sequences are staged examples, never copied
private messages. Production is never contacted while viewing a story.

## State ownership

`product.stories.fixture.ts` builds the common game content. The setup supply comes from the game
Worker's own builder in `src/shared/play/setupSupply.ts`, run over six captures made from
`factions.json`, so reserves, leaders and Traitor decks carry the labels a real game deals. Each
story changes only the state needed for its scenario and passes the projected view through the
existing game transport seam.
The scripted transport records commands and supplies specified replies. It does not execute game
rules. The real route and browser-local Convex handlers still own page behavior.

Six players are normal. Waiting for players, last-player departure, and a trading vacancy use
fewer occupied seats to demonstrate their behavior. Observers retain the game's seat count.

The numeric battle scenarios transcribe the copied Atreides and Harkonnen troop descriptions:
half strength, or one strength funded with one spice. The face names and artwork come from those
same definitions. These staged planner inputs do not claim that automatic combat authoring or
individual component publication has shipped. The game runtime and its rules remain authoritative.

`preparedSnapshot` keeps one Traitor per faction and four for Harkonnen, retains only the current
player's selected cards in the private hand, and places starting forces using the copied starting
instructions and the board's territory geometry. Undealt public cards have opaque ids and only a
back image. Playing derives from this prepared state.
