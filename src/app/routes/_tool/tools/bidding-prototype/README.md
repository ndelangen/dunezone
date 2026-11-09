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

The route uses the existing kit, Mantine theme, faction tokens and published Storybook fixture artwork. The isolated entry keeps this preview out of the generated application route tree. The screen is available only in development mode.

The visual flow remains awaiting the user's review. Agent checks establish that the prototype runs and follows the recorded decisions; they do not establish human agreement or device capability.

## Captured review

- [Before, reconstructed from prototype H](review/before.png)
- [Agreed tablet and remote](review/agreed.png)
- [Phone remote](review/remote.png)
- [Phone recovery](review/recovery.png)
- [Phone used as the central device](review/phone-central.png)

Browser checks covered all nine scenarios, tablet and phone widths, hand-count and limit recalculation, the Full override, persistent pass, separate unsubmitted bid amounts, a competing late voice action, win increments, hand corrections preserving results, Reset, removal of the selected starter, local Resume, promotion with a new code and the finished-phase display. No browser errors were observed.

Type checking, targeted lint, app layout, breakpoint, CSS ownership, CSS variable and prose checks passed. The raw Mantine Button import has a narrow, documented lint exception for this throwaway comparison. GPT-6.1 Sol and GPT-6 Astra separately reviewed the source and architecture against the agreed contracts. Their corrections are incorporated. These checks do not validate real phones, audio capture or networking.
