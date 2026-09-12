# Drafting and swapping prototype

Throwaway prototype code for #1142, #1143, #1144 and #1145 on branch `norbert/1145-drafting-panel-prototype`, cut from `norbert/1142-drafting-overlay-prototype`, never merged to main. Choices are recorded on #1016; this folder is the primary source for them. State is in memory, every action is a button, nothing is sent to a game.

## Running it

From the branch run `bun run app:dev` and open `/play/demo?variant=drafting` or `/play/demo?variant=swapping`; without `?variant=` the route is the plain demo table. A floating switcher (dev only) cycles the live variants by its arrows or the arrow keys; under it a second strip picks the fixture scenario for drafting: `creator`, `spectator`, `approve`, `drafting`, `short`.

## Real data

`catalogue.fixture.ts` holds nineteen real factions with their logo, background and theme colour, read once from production through the public query API on 2026-09-12; `profiles.fixture.ts` holds eight real public profiles (slug, username, avatar). Both are display-only snapshots. Tokens render through the real `Token` renderer from `@game/assets/faction/token/Token`; avatars are the real profile pictures. Neither carries an added border [real].

`tokens/<slug>.png` are the captured faces of the same renderer at 512px, and the 3D scene textures its discs with them. To recapture after a data change, with the dev server on port 3000, run `node src/app/routes/_app/play/drafting-prototype/capture-tokens.mjs` from the repo root: it opens `/play/demo?variant=tokens` and shoots each `[data-slug]` cell into this folder.

## The live set

### `?variant=drafting`: the accepted D, refined

`DraftingOverlay` on the table, `DraftingHeader` in the page header, `DraftingPanel` in the panel, over `fixture.ts`. Chosen in [D] and refined on 2026-09-12. It embodies:

- One URL per game for every stage; the table area is always shown and drafting is an overlay on it, scene visible beneath [page], [overlay].
- The panel is where a player acts; the overlay is the shared public view for every viewer, spectators included; a ban strips every pick and blocks new ones until every ban is removed [split].
- Ready is a panel control; ready state shows on the player's avatar; any pick, ban or roster change clears everyone's readiness [ready].
- Overlay: a central avatar column with each player's bans left and picks right, open seats as dashed placeholders, and at the edges the Banned and Drafted zones carrying a title and faction tokens only: no names, no attribution, no border; Banned left-aligned, Drafted right-aligned; no names under avatars [zones].
- The seat, pool and ready counts and the status line are page-header content, in the centre cell where turn and phase sit during play [header].
- Panel: the seat-request bar at the top (Request a seat and Withdraw for a spectator, Approve for a seated player) [bar]; then search, a suitable-first list with a show-all filter, per row token, name, tag, attribution, Draft and Ban toggles; a summary of the player's own draft and Ready; the #1010 note (random additions, a random subset, or blocking when the pool is too small). A spectator sees the bar and nothing of the drafting tools [spectator]. Buttons only.

### `?variant=swapping`: the accepted E panel with the K scene

`SwappingPanel` in the panel, `SwapScene3D` chevrons-only in the scene extras slot, pieces hidden, no overlay, over `swapping.ts`. Chosen in [E] and [K]. It embodies:

- At assignment the overlay gives way to the table; each seat station carries its dealt faction token, with no player avatar; the panel carries the player and faction pairing [deal].
- Panel: a seat card (dealt faction, seat n of m, countdown, swap-ready) above a roster in seat order, one row per seat: faction, pairing mark, player chip, and the one action that applies. Tokens and arrows live in the 3D scene, not a flat overlay [E].
- Only the immovable faction tokens are on the table until setup; the countdown and ready count live only in the seat card; tokens carry no text label [empty].
- An arrow leaves the offering token's rim at the point facing the target and lands on the target's rim; no part of it crosses a token face [rims].
- Flowing chevrons, no solid arc [chevrons]. No static head; chevrons fade in at the origin rim and out at the target rim [fades]. The arch stays low; chevrons are spaced by arc length at one shared speed [arch].
- Each token is the captured real face on a disc whose side is the faction's first colour, turned so the face's top points at the table centre; an open seat is translucent, a swap-ready seat has a green mark; offers involving the current player are heavier; the roster and a text summary are the non-visual form of offers [K], [real]. The sand ring that marked the current player went with the borders; the seat card names the player's faction.

### In progress: the setup panel (#1146)

Three arrangements of the setup panel on `?variant=setup-stack`, `?variant=setup-sections` and `?variant=setup-focus`, each in six states on `?scenario=instructions`, `traitors`, `prediction`, `blocked`, `refused` and `final`, over `setup.ts` (the setup sequence and gates from #1025, the inventories and spawn requests from #1095 and #1021, the traitor, prediction and message steps from #1025 and #1021) with real leaders in `leaders.fixture.ts`. The dealt tokens stand on the table through the swapping scene with no offers; the step, its flat mark and the ready count sit in the header.

- **setup-stack**: `SetupStackPanel.tsx`. The phase with its controls across the top, then three columns that never move: yours, shared, table.
- **setup-sections**: `SetupSectionsPanel.tsx`. One column of sections in a fixed order under a phase strip that stays put; the panel scrolls.
- **setup-focus**: `SetupFocusPanel.tsx`. A rail of steps and seats, the current step's tool alone, and drawers for the rest, one open at a time.

Shared in `setupParts.tsx`: the flat phase mark (the header's own markup), the phase copy and controls (Ready and why Next waits; Previous and Next themselves are the rightmost thing in the header's toolbar in every variant and every stage, disabled when they do not apply [advance], [rightmost], and disabled for eight seconds after any change with a countdown beside them [cooldown]), the stepper, the seat roster, the hand as the real traitor cards, the faction inventory as the real leader tokens clipped to circular discs with the prediction reveal card once locked [card], the reserve and the bank, the shared inventory with the spawn control, pending requests and a refusal, the prediction lock, the conversations, and the vacancy bar. Inventories are purely visual: every piece in the hand or an inventory is dragged onto the table, where `SetupScene3D.tsx` lays it out from the player's station toward the centre; everything lands face down and a click on the piece flips it, standing in for the table's hover and F; a flipped leader disc shows its published face, and flipping the prediction card face up is the reveal [drag], [facedown]. Choices the decisions leave open and this fixture makes: starting forces and the final gate are one phase; the standard setup steps have no symbol artwork, so their marks are bare; a faction-declared phase carries its faction's mark; the prediction offers turns 1 to 10 and every faction including the predictor's own, starts unchosen, and Lock waits for both parts; the prediction phase takes readiness so the blocked state can be shown. The traitor step's copy says the map is hidden, as the decisions have it, while the delivered scene beneath still draws the map: the map-free table belongs to the table, not to this panel.

### `?variant=tokens`: the capture gallery

Every real token face at 512px in a scrollable layer, for the capture above. Not a design.

## Rejected variants

- Tag `prototype/1142-all-variants` (`7b63378c0b8`) holds the drafting and swapping variants A through K; the letters and why each lost are in the tag's README.
- Tag `prototype/1145-three-panels` (`95f3d075766`) holds three arrangements of the creation and drafting panel, `sidecar`, `tabs` and `shelf`, none accepted [none]. The feedback was on fidelity and on the overlay, which this state applies.

## Prototype-only wiring

`GameTable` gained `overlay`, `panelContent`, `headerCentre`, `headerRight`, `sceneExtras` and `hidePieces`; `TabletopScene` gained `extras` and `hidePieces`; `search.ts` reads `?variant=` and `?scenario=`. It mounts the folder inside the real table scene. Prototype-only, not a delivery design [1144]. Delivery follows the three-panel direction and the `AGENTS.md` component taxonomy [close].

[page]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5634518661
[overlay]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5634639638
[split]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5634710028
[ready]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5637890427
[D]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5638589513
[deal]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5639040418
[E]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5639188439
[empty]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5639324492
[rims]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5639409861
[chevrons]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5639537462
[fades]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5639647155
[arch]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5639807126
[K]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5639825109
[bar]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5639952126
[1144]: https://github.com/ndelangen/dunezone/issues/1144#issuecomment-5639825959
[close]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5640316209
[zones]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5644752531
[header]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5644753131
[spectator]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5644753319
[real]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5644753485
[none]: https://github.com/ndelangen/dunezone/issues/1145#issuecomment-5644758192
[card]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5645796678
[advance]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5645796794
[rightmost]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5645844920
[cooldown]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5645857753
[drag]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5645976875
[facedown]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5646044387
