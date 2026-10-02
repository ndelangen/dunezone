# Hosted table subscription

[Separate the hosted Play subscription from local interactions](https://github.com/ndelangen/dunezone/issues/1252)
records the accepted ownership and recovery contract.

`GameSubscription` owns one authenticated player's received view. It obtains admission tickets,
opens and retires sockets, validates messages, assembles patches and requests a fresh view when
an update cannot apply. Old ticket attempts and retired sockets cannot update the current
subscription. A fresh full view is required before gameplay commands can resume.

`TableSession` owns selection, unfinished carries, pending actions, playback and presentation.
It reads the saved snapshot and viewer from the subscription. It receives command replies and
complete views, never applies patches or manages reconnect timers. The subscription also reports
command receipts that accompanied an unusable patch, so a pending catalogue capture or battle
edit does not wait forever for a reply that already arrived.

Disconnect discards pending local interactions. Reconnect starts with fresh admission and uses
whatever state the server saved. An uncommitted drop returns to its previous saved position; a
committed drop stays at its new saved position. No action is retried and no interrupted drag is
restored. A patch gap on a still-open connection requests a full view and pauses gameplay commands;
it does not create a second admission or erase a valid command receipt.

Once the table is back, `TableSession` says what happened to a carry the drop ended. A piece still
held reads "The table paused while you held a piece. Pick it up again to continue.", which also
covers an authorization pause where no socket drops. A drop that was sent but not confirmed may or
may not have landed, so it reads "The connection dropped as you placed a piece. Check where it
landed." When the view arrives with a new room epoch, as after a Worker restart, the same two cases
read "The room resumed..." instead. A drop the server confirmed gets no notice.

## Connection loss

A connection can die without a close frame, after a Wi-Fi drop or a laptop sleep, and then the
browser never fires a close event. `GameSubscription` sends a keepalive ping every
`KEEPALIVE_INTERVAL_MS` (30 s, in `src/shared/play/protocol.ts`), and the Worker answers every ping.
Any frame the socket delivers, a pong included, resets the count; a socket that stays silent for a
whole interval after a ping is closed and replaced. When the browser reports it is back online
(`GameRuntime.onOnline`), a plain one-second reconnect waiting on its timer starts at once (a
longer wait the Worker or the ticket answer asked for is kept), and an open socket is pinged at once
with a whole interval for its answer.

A failure before the table has shown keeps its reason on screen through every retry, until a view
arrives or the subscription stops: a socket that closes before its view, a dropped silent socket or
a ticket request that fails reads "The table could not be reached. Reconnecting...", a socket that
cannot be opened reads "The table could not connect. Reconnecting...", and a ticket the game turns
away reads "The table is temporarily unavailable." Two answers end the subscription instead of
retrying: a `not_authorized` ticket answer is denied with "Sign in again to access the table.", and a
socket closed with 4401 is denied with "This login can no longer access the table." A socket that drops
after the table has shown reconnects without keeping a failure line, so a deploy's cold restart does
not read as an outage.

The Play pages that wait on Convex rather than the game Worker, the lobby, the create page and a
game link, say "Can't reach the server. Retrying..." once their first query has had no answer for
`SERVER_WAIT_MS` (10 s, in `src/app/routes/_app/play/useServerUnreachable.ts`). Convex keeps
retrying on its own, and each page fills in when it answers.

The server still derives the viewer's seat from the authenticated identity and filters private
information before computing patches. Saved piece moves arrive as their own smaller patch (see
Subscription patches).

`gameRuntime` supplies browser sockets, clocks and page visibility. Route stories provide a runtime
through `GameRuntimeContext`, and tests pass one directly. Each table owns its dependency; neither
needs to replace the browser's WebSocket constructor or wall clock. React and scene rendering
continue to consume the session through the existing table context.

The session suites retain command ordering, carry, privacy and playback coverage. The subscription
suite exercises patch assembly, resynchronization, independent subscriptions and reconnect epochs.
The isolated hosted browser flows verify the real socket, admission and table integration.

## Subscription patches

The Worker projects a player's visible state before computing patches. Motion omits an unchanged
snapshot, including when viewer-specific controls have been copied without changing their contents.
Private commits still advance the shared revision for every recipient, so the next command can name
the current revision without exposing the private change.

Every socket takes patches from its first full view. Neither `admit` nor `sync` carries an option.

A saved piece move carries its id, position, orientation, zone and flip revision. A null flip
revision removes the optional counter. Items and artwork stay in the client's existing piece. New
pieces and changes to any other piece field use full replacements, including removing an inventory
or battle-overlay marker. Sequence or definition gaps request a full view; reconnect still discards
unfinished local gestures and starts from current server state.
