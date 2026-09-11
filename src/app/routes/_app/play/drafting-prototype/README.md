# Drafting and swapping prototype

Throwaway prototype code for #1142, #1143 and #1144 on branch `norbert/1142-drafting-overlay-prototype`, never merged to main. Choices are recorded on #1016; this folder is the primary source for them. State is in memory, every action is a button, nothing is sent to a game.

## Running it

From the branch run `bun run app:dev` and open `/play/demo?variant=drafting` or `/play/demo?variant=swapping`; without `?variant=` the route is the plain demo table. A floating switcher (dev only) cycles the live variants by its arrows or the arrow keys.

## The live set

After close-out only the two accepted variants run [close].

### `?variant=drafting`: the accepted D

`DraftingOverlay.tsx` (A's ledger overlay) above `DraftingPanel.tsx` (B's faction list), bound by `DraftingPrototype.tsx` over `fixture.ts`. Chosen in [D]. It embodies:

- One URL per game for every stage; the table area is always shown and drafting is an overlay on it [page], [overlay]; the scene stays visible beneath the overlay [D].
- The panel is where a player acts; the overlay is the shared public view for every viewer, spectators included; a ban strips every pick and blocks new ones until every ban is removed [split].
- Ready is a panel control; ready state shows on the player's avatar; any pick, ban or roster change clears everyone's readiness [ready].
- Overlay: a central avatar column, bans left, picks right, open seats as dashed placeholders, pooled Banned and Drafted zones at the edges with attribution, gates and status at the top. Panel: search, a suitable-first list with a show-all filter, per row token, name, tag, attribution, Draft and Ban toggles; Draft is disabled for a banned or ungenerated faction; a summary of the player's own picks and bans; the same toggle removes a pick or a ban. Buttons only; drag and drop is optional [D].

### `?variant=swapping`: the accepted E panel with the K scene

`SwappingPanel.tsx` in the panel, `SwapScene3D.tsx` in the scene extras slot with `hidePieces` set, the overlay slot holding only the switcher, over `swapping.ts`. Chosen in [E] and [K]. It embodies:

- At assignment the overlay gives way to the table; each seat station carries its dealt faction token, with no player avatar; the panel carries the player and faction pairing [deal].
- Panel: a seat card (dealt faction, seat n of m, countdown, swap-ready) above a roster in seat order, one row per seat: faction, pairing mark, player chip, and the one action that applies (Offer trade, Accept trade, Cancel offer, Move here, or your seat); status line below. Tokens and arrows live in the 3D scene, not a flat overlay [E].
- Only the immovable faction tokens are on the table until setup; the countdown lives in the seat card and the swap-ready count in the status line under the roster; nothing floats above the table for either; tokens carry no text label [empty], [E].
- An arrow leaves the offering token's rim at the point facing the target and lands on the target's rim; no part of it crosses a token face [rims].
- Flowing chevrons, no solid arc [chevrons]. No static head; chevrons fade in at the origin rim and out at the target rim [fades]. The arch stays low, near a quarter of the board radius, so no arrow crosses a token from the table's camera views; chevrons are spaced by arc length at one shared speed [arch].
- Tokens carry the faction logo in cream on the faction colour; a sand ring marks the current player, an open seat is translucent, a swap-ready seat has a green mark; offers involving the current player are heavier; the roster is the non-visual form of offers, and the visually hidden sentence under the roster names every open offer for assistive technology [K].

## Rejected variants

Tag `prototype/1142-all-variants` (`7b63378c0b8`) holds variants A through K.

- **A, Ledger**: the sketch as overlay; panel with banned and drafted zones around a grid. Overlay survives in D; panel rejected by [D].
- **B, Browser**: pooled result on the seat ring under an avatar strip; list panel. Panel survives in D; overlay rejected by [D].
- **C, Board-native**: every faction as a token on a ring, tap to draft; panel of search, Ready and a status line. Rejected by [D].
- **F, faction strip** (`Swapping F: faction strip in seat order, names under the tokens`): six cells in seat order, the player's name under each token. Rejected when E was chosen [E].
- **G, trade board** (`Swapping G: trade board with offers and proposals`): three columns, your faction, offers to you, proposals. Rejected when E was chosen [E], as was the flat `SwapOverlay` when the table part moved to 3D.
- **H, solid arch**: emissive tube, cone head, origin bead. Not adopted by [chevrons].
- **I, chevrons on a rail**: thin rail, chevrons sliding along it, a head. Superseded by K; the head removed by [fades], the rail rejected by [K].
- **J, comet**: tube, travelling comet, the largest head. Not adopted by [chevrons].

## Prototype-only wiring

`GameTable` gained `overlay`, `panelContent`, `sceneExtras` and `hidePieces`; `TabletopScene` gained `extras` and `hidePieces`; `LocalTable` gained `draftingVariant` and mounts `useDraftingPrototype`; `demo.route.tsx` passes `variant` through; `search.ts` reads `?variant=drafting|swapping`. It mounts the folder inside the real table scene. Prototype-only, not a delivery design [1144]. Delivery follows the three-panel direction and the `AGENTS.md` component taxonomy [close].

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
[1144]: https://github.com/ndelangen/dunezone/issues/1144#issuecomment-5639825959
[close]: https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5640316209
