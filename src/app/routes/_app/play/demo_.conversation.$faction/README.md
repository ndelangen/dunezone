# Faction conversation comparison

[Prototype a faction conversation sub-page](https://github.com/ndelangen/dunezone/issues/1150) compares three layouts on `/play/demo/conversation/house-atreides`. No layout is accepted yet. The branch is `norbert/1145-drafting-panel-prototype`, never merged.

Run `bun run app:dev`. Open the Play panel's Full page link or `/play/demo/conversation/house-atreides?variant=A&scenario=unread`. The floating arrows and keyboard arrows cycle A, B and C. Arrow keys inside a field keep their usual behavior. The scenario selector changes the local fixture.

## Arrangements to compare

- A, Reading column: plain messages in one reading column, with the inventory and faction selector above it.
- B, Conversation list: faction conversations and inventory beside an alternating message stream. On narrow screens, the faction list scrolls horizontally above the inventory.
- C, Beside the table: a read-only table preview and inventory beside the conversation. On narrow screens, the table hides and the inventory stays above the conversation.

All three keep a composer below the scrollback. Back to game opens the same faction's Conversation tab with Hand visible beside it. The setup panel's Open link also reaches this sub-page.

## Settled constraints

The [faction-pair contract](https://github.com/ndelangen/dunezone/issues/1021#issuecomment-5552525451) fixes conversation ownership within one game and full scrollback inherited by a replacement. The [current-seat rule](https://github.com/ndelangen/dunezone/issues/1021#issuecomment-5552636713) ends access when a player leaves the seat. Messages [open from setup](https://github.com/ndelangen/dunezone/issues/1021#issuecomment-5552863888).

[Each conversation is a game sub-page](https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5634518661). [Conversation and inventory stay visible together](https://github.com/ndelangen/dunezone/issues/1016#issuecomment-5646243526). The [accepted Play panel](https://github.com/ndelangen/dunezone/issues/1147#issuecomment-5646624727) supplies the entry point and return destination. The deferred Full log page is a separate question.

## Scenarios and proposed behavior

The fixture has 28 invented messages over two dates, using real public profiles and faction artwork. These are sample words, not those people's actual messages.

- `unread`: four recent messages start at the New messages marker. Mark read removes it. Older messages remain in the same scrollback.
- `sending`: the last outgoing message stays Sending for inspection.
- `offline`: outgoing messages stay Pending. The prototype switcher's Reconnect action simulates delivery.
- `failed`: the last outgoing message has Retry. Retrying simulates Sending, then Sent.
- `replacement`: BigDave occupies the Fremen seat. Older outgoing messages retain Thialfi as their author; new ones name BigDave.
- `revoked`: the former occupant sees no messages, inventory or composer.

Send appends a local message. Enter sends, Shift+Enter adds a line, and empty messages are disabled. Newly sent messages simulate delivery after 900 ms. The unread marker, manual marking, status vocabulary, offline queue and retry behavior are proposals for review. They do not settle backend delivery guarantees, read receipts or notification policy.

## Components and limits

`ProfileLink`, `FactionLink` and `StatusBadge` are reused. Mantine supplies Textarea, Button, Select, Badge, Text, Group and Stack. B reuses the kit's borderless Surface for individual messages without nesting surfaces. PageLayout and PageTitle provide the existing page frame. Faction tokens, leader tokens and traitor cards use the real game renderers; C uses TabletopScene.

`Transcript` owns the message sequence, `Delivery` its status rendering, `Composer` the draft and send controls, `Inventory` the visible inventory preview, and `PartnerSelect` and `PartnerList` the two navigation arrangements. They are local route composition. The fixture and TablePreview are route organs. Nothing new is extracted into the kit. If delivery later needs the same message view in the panel and page, it can earn a List; a shared composer can earn a Control. That extraction is not part of this prototype.

Inventory and table are read-only layout previews. Message changes live only in this mounted page and reset on route reload, partner change or scenario change. Returning to the game restores a fixture panel, not a saved game session. The revoked scenario demonstrates the proposed view, not an authorization boundary. No message is sent to another person, and no game data is fetched or written. No production, shared development database or deployment change.

## Verification

Typecheck, lint, the app-layout guard and the existing search tests pass. Headless browser checks cover scrollback, unread marking, sending, offline pending messages and reconnection, retry, replacement authorship, the revoked view, keyboard switching, panel navigation and 430px phone sizing. The accepted Game/Audit Log checks still pass. `shots/comparison-abc.png` is the single labelled comparison captured from the real route.
