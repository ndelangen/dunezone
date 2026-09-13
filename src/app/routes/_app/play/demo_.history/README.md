# Public log and history prototype

[Prototype the public log and history sub-page](https://github.com/ndelangen/dunezone/issues/1149) is an open layout comparison on `norbert/1145-drafting-panel-prototype`, never merged. The accepted battle and play panel remain the starting point.

Run `bun run app:dev`, open `/play/demo?variant=play`, choose the Log tab and follow Full log. The real history sub-page is `/play/demo/history?variant=A`. Back to game returns to the demo table. The route is a sibling in the route tree so the full table does not remain mounted behind a history page.

- A, Journal: one chronological reading column, grouped by turn, with revealed battle plans expanded in the stream and turn shortcuts above it.
- B, Index and detail: a compact newest-first entry list on the left and the selected record on the right. Selecting another record replaces the detail pane.
- C, Beside the table: the current table remains visible above the selected record, beside a newest-first entry list. The table is the real renderer, read-only. It is current context, not a historical replay.

The floating switcher changes `?variant=A|B|C` through arrows or arrow keys outside editable controls. `?scenario=latest|filtered|older|battle|empty` exposes the comparison states. `kind`, `entry` and `count` in the URL preserve the filter, selected entry and loaded range across reloads. Older entries loads the full three-turn fixture. There is no backend persistence in this prototype.

The fixture includes eighteen invented events across three turns and separate visits: seat changes, spice transfers, phases, battles, final votes and a revealed prediction. It uses the existing public faction and profile artwork snapshots. Its `[deleted user]` record has no former profile, identifier or avatar. Battle records hold only revealed plans and agreed results. Transfers name source, destination, amount and kind without private bank totals. No private messages, unrevealed plans or battle cancellations are supplied to this route.

Contracts are [persistent history](https://github.com/ndelangen/dunezone/issues/1021#issuecomment-5560893067), [public battle records](https://github.com/ndelangen/dunezone/issues/1021#issuecomment-5567966872), [addressable sub-pages](https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5634518661), [public spice transfers](https://github.com/ndelangen/dunezone/issues/1021#issuecomment-5560840400) and [participation audit and deleted-user attribution](https://github.com/ndelangen/dunezone/issues/1011#issuecomment-5574395620). The fixed vote records demonstrate final totals, not the complete delivery schema for individual ballots. The prototype does not decide storage, retention or restore mechanics. Displayed territory names are authored historical fixture values, not lookups performed by the accepted battle overlay.

The route reuses Mantine controls, kit Surface without added borders, StatusBadge, ProfileLink, FactionLink and TopicIcon, plus the real phase mark and game renderers. EntryMeta, EventMark, Attribution, BattleRecord and EntryDetail are route organs. TablePreview is a route organ that loads the real scene only for C.

BattlePlanFace is a new kit Content candidate with a story. The caller supplies all artwork, leader, counts and strength; the component renders the accepted wheel face without fetching, routing or inspecting current game state. Both the accepted battle and the history use it. The battle keeps its existing card fan and reveal animation. This candidate remains on the prototype branch. No production, shared development database or deployment change is included.

No arrangement is accepted yet. Record Norbert's choice on Design the combined Play journey and layout, tag rejected arrangements, prune to a plain live name, resolve the prototype ticket and update the map when the comparison is settled.
