# Play pointer sessions

`GameTable` creates one `PointerSession` for its canvas and panels. Table pieces,
inventory controls and battle controls hand their initiating pointer to it. The
session owns pointer capture, native listeners and cleanup until that pointer
drops or cancels. Other pointers cannot finish or cancel its drag.

The scene supplies current permissions, pieces and callbacks through one binding.
It also converts screen coordinates to table coordinates. `PointerSession` calls
the existing table gesture operations; `TableSession` still owns the local draft
and sends authoritative commands. The server decides whether a drop is valid.

Table presses start dragging after four pixels of movement. Holding for at least
320 milliseconds before crossing that threshold picks up the whole stack;
otherwise it picks up the top piece. Panel controls start carrying immediately
with their chosen pickup mode. An inventory pickup can travel from its panel to
the table. A table pickup cancels when it leaves the public table.

Escape, window blur, pointer cancellation, lost capture, permission loss and scene
teardown release the active session. If a server update already removed the draft,
the pointer session releases its listeners without cancelling the draft again.
A late pointer-up cannot save a cancelled move. Reconnect keeps the subscription's
existing rule: discard the local intention and use the saved server state.

`PointerSession.test.ts` exercises this lifecycle through native events. Hosted
browser flows cover the scene geometry, inventory pickup and server commits.
