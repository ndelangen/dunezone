import type { ServerMessage, Viewer } from '../../src/shared/play/protocol';
import { frameChanges } from '../../src/shared/play/updates';
import type { RoomFrame, RoomView } from '../../src/shared/play/updates';

type Delivered = { frame: RoomFrame; sequence: number; viewerSeat: Viewer['viewerSeat'] };

/**
 * Per-connection baselines advance only for authorized sends.
 * Each frame after a socket's first view is a compact update against the last frame it received, unless the epoch, the viewer's seat or the spice reserve's faction changed, which takes a full view.
 */
export class RoomDelivery {
  private readonly delivered = new WeakMap<WebSocket, Delivered>();
  private readonly change = frameChanges();

  view(socket: WebSocket, viewer: Viewer, frame: RoomFrame, completedCommandId?: string): RoomView {
    const sequence = (this.delivered.get(socket)?.sequence ?? 0) + 1;
    this.delivered.set(socket, { frame, sequence, viewerSeat: viewer.viewerSeat });
    return { type: 'view', sequence, viewer, ...frame, completedCommandId };
  }

  update(
    socket: WebSocket,
    viewer: Viewer,
    frame: RoomFrame,
    completedCommandId?: string
  ): Extract<ServerMessage, { type: 'view' | 'update' }> {
    const base = this.delivered.get(socket);
    if (
      !base ||
      base.frame.epoch !== frame.epoch ||
      base.viewerSeat !== viewer.viewerSeat ||
      base.frame.snapshot.bank?.factionId !== frame.snapshot.bank?.factionId
    ) {
      return this.view(socket, viewer, frame, completedCommandId);
    }
    const change = this.change(base.frame, frame);
    const sequence = base.sequence + 1;
    this.delivered.set(socket, { frame, sequence, viewerSeat: viewer.viewerSeat });
    return { type: 'update', epoch: frame.epoch, baseSequence: base.sequence, sequence, ...change, completedCommandId };
  }
}
