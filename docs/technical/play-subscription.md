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
