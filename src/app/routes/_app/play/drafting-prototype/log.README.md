# Accepted public log

Norbert [approved E](https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5654312907) for [Prototype the public log in the controls panel](https://github.com/ndelangen/dunezone/issues/1149). The sole live arrangement is named `log` on `norbert/1145-drafting-panel-prototype`, never merged.

Run `bun run app:dev` and open `/play/demo?variant=play&log=log&scenario=log-latest`. The floating control selects `log-latest`, `log-older` or `log-empty`. Letter variants and the separate `/play/demo/history` route are removed. The ordinary Play panel uses the same accepted Log layout when its Log tab is selected.

## Decisions embodied

- `PlayPanel` composes the existing NestedTabs second level inside Log. Game contains Phase, Spice, Battle and Prediction. Audit contains Seat and Vote. This follows [the Game/Audit grouping](https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5654269367). Leaving Log removes that level; reopening Log starts with Game.
- The `Log` route organ renders a colored classification badge, one sentence and a small turn/phase label. It preserves the [simple-row correction](https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5653953380) and the [accepted classifications with distinct colors](https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5654084347). Rows contain no event icons or borders.
- `logClassification.ts` keeps the labels and palette together. Seat is blue, Spice orange, Phase cyan, Battle red, Vote green and Prediction purple. Mantine Badge supplies the rendering.
- `.dpl-content--log` removes the extra inner padding, as [accepted with the compact layout](https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5654138771). NestedTabs supplies the single content inset.
- The separate Full log page and its button are [deferred](https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5654269367). The map keeps that future question. Public history and audit retention remain required.
- Battle copy names no territory. The app knows the dropped indicator coordinates, as [corrected by Norbert](https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5653953380). The archived full-page fixture preserves the proposed coordinate field; the accepted compact log does not implement historical marker pointing or expanded plan inspection.

## Components and limits

NestedTabs is reused without further changes. TopicIcon gained Game and Audit vocabulary, covered by its catalogue story. Those glyph additions remain kit candidates on the unmerged branch. `Log`, `LogSwitcher` and `logClassification.ts` are route organs.

The full-page studies had introduced BattlePlanFace as shared kit Content and logClassification as kit support. Removing that page leaves their callers inside the play prototype. They now live beside those callers as route organs. BattlePlanFace carries no story and preserves the accepted wheel renderer without changing its card fan, readiness rings, reveal animation or fitted controls. Their earlier kit forms remain in the tags.

The comparison fixture contains nine invented public events across three turns. Game and Audit retain their own newest-first order; older records are in the same scrollable tab. The older and empty scenarios are fixed fixture views. The ordinary Play Log still receives local prototype commands. Nothing is persisted or sent to a game.

Public-history contracts still govern delivery: [retained public history](https://github.com/ndelangen/dunezone/issues/1021#issuecomment-5560893067), [revealed battle plans and agreed results](https://github.com/ndelangen/dunezone/issues/1021#issuecomment-5567966872), [public spice transfers](https://github.com/ndelangen/dunezone/issues/1021#issuecomment-5560840400) and [participation audit and deleted-user attribution](https://github.com/ndelangen/dunezone/issues/1011#issuecomment-5574395620). The fixture vote shows final totals, not the complete ballot schema. The deleted-user row has no former profile or avatar. This prototype adds no storage, restore mechanics, production, shared development database or deployment change.

## Preserved comparisons

- `prototype/1149-rejected-variants` at `2bb0ca4165d` preserves the A/B/C full-page studies and the D single-level Log, their images and the intermediate kit candidates.
- `prototype/1149-accepted-e` at the same commit preserves E before pruning to the plain live name.
- `shots/log.png` is the accepted E composite, showing Game and Audit on the real route.
