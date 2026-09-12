# Drafting and swapping prototype

Throwaway prototype code for #1142, #1143, #1144 and #1145 on branch `norbert/1145-drafting-panel-prototype`, cut from `norbert/1142-drafting-overlay-prototype`, never merged to main. Choices are recorded on #1016; this folder is the primary source for them. State is in memory, every action is a button, nothing is sent to a game.

## Running it

From the branch run `bun run app:dev` and open `/play/demo?variant=drafting` or `/play/demo?variant=swapping`; without `?variant=` the route is the plain demo table. A floating switcher (dev only) cycles the live variants by its arrows or the arrow keys; under it a second strip picks the fixture scenario for drafting: `creator`, `spectator`, `approve`, `drafting`, `short`.

## Real data

`catalogue.fixture.ts` holds nineteen real factions with their logo and background, read once from production through the public query API on 2026-09-12; `profiles.fixture.ts` holds eight real public profiles (slug, username, avatar). Both are display-only snapshots. Tokens render through the real `Token` renderer from `@game/assets/faction/token/Token`; avatars are the real profile pictures. Neither carries an added border [real].

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

### `?variant=tokens`: the capture gallery

Every real token face at 512px in a scrollable layer, for the capture above. Not a design.

## Rejected variants

- Tag `prototype/1142-all-variants` (`7b63378c0b8`) holds the drafting and swapping variants A through K; the letters and why each lost are in the tag's README.
- Tag `prototype/1145-three-panels` (`95f3d075766`) holds three arrangements of the creation and drafting panel, `sidecar`, `tabs` and `shelf`, none accepted [none]. The feedback was on fidelity and on the overlay, which this state applies.

## Prototype-only wiring

`GameTable` gained `overlay`, `panelContent`, `headerCentre`, `sceneExtras` and `hidePieces`; `TabletopScene` gained `extras` and `hidePieces`; `search.ts` reads `?variant=` and `?scenario=`. It mounts the folder inside the real table scene. Prototype-only, not a delivery design [1144]. Delivery follows the three-panel direction and the `AGENTS.md` component taxonomy [close].

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
