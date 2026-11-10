# Bidding flow review prototype

This throwaway prototype supports [Bidding tool: review tablet and remote flows](https://github.com/ndelangen/dunezone/issues/2839). It is for agreeing the specification. It is not production implementation and must not be merged as the tool.

From the repository root, run:

```sh
bun src/app/routes/_tool/tools/bidding-prototype/dev.ts
```

Open [the review](http://127.0.0.1:4318/tools/bidding-prototype?variant=after&step=bid). It runs on port 4318, mounts only this route under the existing app theme, and makes no backend connection. The repository's frozen dependencies must be installed first.

The user chose prototype H as the baseline and asked to see the agreed changes. The two variants are therefore Before and Agreed changes, rather than unrelated redesigns. Before is a static reconstruction of the controls and fixture data in [recorded prototype H](https://github.com/ndelangen/dunezone/tree/51bf76f09c07e849d8df3a0d0d9bb9677d92f50f/src/app/routes/_app/tools/bidding), adapted to the current kit. It is not a screenshot or execution of the original source. It keeps the original Full label hiding the count, Harkonnen limit and bonus, separate remote controls and Take back affordance. The agreed view replaces those behaviors as specified.

Use the scenario bar for setup, joining, bidding, hand edits, the wait after a win, Reset, local restoration, phone recovery and phase completion. The before/after choice, scenario and device view are in the URL. Arrow keys cycle scenarios when focus is outside controls. Add `view=phone&focus=1` or `view=tablet&focus=1` to inspect one device without the review toolbar.

All state lives in memory. Buttons labeled as review controls simulate speech, timeout, a win and a phone rejoining. QR codes are placeholders. No microphone, networking, browser persistence, full catalogue or recovery reliability is implemented or verified. The timer remains still for inspection. In the eventual tool, it runs according to the agreed timer rules.

The source contracts are [auction and hand controls](https://github.com/ndelangen/dunezone/issues/2838#issuecomment-6752912315), [recovery](https://github.com/ndelangen/dunezone/issues/2836#issuecomment-6753348442) and [mixed input](https://github.com/ndelangen/dunezone/issues/2840#issuecomment-6753627037).

The revised layout follows the user's direction to reuse the existing tools, optimize the remote for a phone, and give the tablet's space to hand counts and the bidder.

The tablet shows large faction tokens in a fixed circle. Hand counts use the Dune typeface, face the same direction as their tokens and sit between each token and the pointer. A background-colored outline keeps the counts legible. The pointer aims at the token centre; its centre shows the highest bidding faction and amount, with an optional timer. Full darkens the token and adds the black prohibition mark used by Dune Play. Faction names are optional and off by default. Identical top and bottom controls face opposite sides of the table, including their sheets. Bid, Pass and the green +1 are separate controls. Setup keeps the seating controls beside the circle where there is room.

The phone keeps its bid amount, Pass, Bid, green +1 and hand controls within thumb reach at the bottom. Choosing the next starter uses faction tokens. Hand count, Full and Always pass remain on the main screen. Hand limit opens from its small settings action. Reset and Change faction are in the remote settings menu.

These arrangements use existing tool patterns:

- The [spice deck](../spice-deck/route.tsx) supplies the compact icon toolbar and separate listening and announcement toggles.
- The [battle wheel](../battle-wheel/route.tsx) supplies the large minus/value/plus action row. This prototype adds an existing NumberInput for typed counts and bids.
- The [treachery tracker](../atreides-treachery-tracker/StandaloneTracker.tsx) supplies the bottom action dock and touch sheets. Its [setup](../atreides-treachery-tracker/TrackerConfig.tsx) supplies the sortable faction rows.
- The route uses IconAction, LabeledAction, TouchSurface, SheetPopover, SortableItem, SortableReorderHandle and the existing faction tokens. No new kit component is added.

The route uses the existing Mantine theme and published Storybook fixture artwork. The isolated entry keeps this preview out of the generated application route tree. The screen is available only in development mode.

The user approved this layout on 2026-11-10 and requested a production playtest. The separate working implementation must provide the real timer, connections, voice and recovery. This branch remains the approved visual reference.

## Captured review

- [Before, reconstructed from prototype H](review/before.png)
- [Earlier review layout](review/layout-before-mobile.png)
- [Revised tablet and remote](review/agreed.png)
- [Tablet at 1024 × 768](review/tablet.png)
- [Tablet hand controls](review/tablet-hand.png)
- [Table setup](review/setup.png)
- [Phone remote](review/remote.png)
- [Narrow phone at 320 × 568](review/remote-narrow.png)
- [Phone recovery](review/recovery.png)
- [Phone used as the central device](review/phone-central.png)

An earlier revision passed 29 browser interaction checks. Those results do not cover every later layout change. They cover hand-count and limit recalculation, the Full override, persistent pass, separate bid drafts, action feedback, wins and corrections, Reset, starter removal, keyboard seat reordering, local Resume, phone recovery and phase completion. Bid controls fit at 320 × 568, their main touch targets are at least 44 pixels high, and the six-faction tablet view fits at 1024 × 768. The eight-faction central view was also inspected at phone width. No browser errors were observed.

Type checking, targeted lint, app layout, breakpoint, CSS ownership, CSS variable and prose checks passed. GPT-6.1 Sol and GPT-6 Astra separately reviewed the source and architecture against the agreed contracts. Their corrections are incorporated. These checks do not validate physical devices, audio capture or networking.


## Independent review, 2026-11-10

Four agents reviewed the approved prototype using different models:

| Concern | Model | Result |
| --- | --- | --- |
| UI consistency | GPT-6.1 Sol | Phone actions fit at 320 by 568. Corrected the far-side sheet to match the near-side width and attach to the top. |
| Architecture | GPT-6 Astra | Requires a real central session, validated commands, protected central reconnection, complete recovery and browser-compatible voice packaging. |
| Code quality | GPT-6.1 Terra | Production must capture timer opportunities, validate all commands and transitions, freeze the chosen phase count and settle when no eligible faction remains. |
| Test coverage | GPT-6 Sol | Visual checks do not cover live behavior. Add auction, command, storage and transport seam tests plus a real central-and-remote browser flow. |

All four agree that removing the development guard would not produce a working playtest. The current state, QR, audio, timer and recovery are simulations. The working tool must implement the canonical issue contracts and receive another review against its actual code.

The Before view now uses the saved capture. Shared styling had changed the live reconstruction, so it can no longer serve as historical evidence. The approved view remains interactive.

Voice packaging must work under the release CSP without dynamic JavaScript evaluation. Physical-device and room-voice tests have not been run. They are part of the requested playtest, and their results must be recorded separately from automated checks.
