import type { ServerMessage, Viewer } from '../../src/shared/play/protocol';
import { frameChange } from '../../src/shared/play/updates';
import type { RoomFrame, RoomView } from '../../src/shared/play/updates';

type Delivered = { frame: RoomFrame; sequence: number };

/** Per-connection baselines advance only for authorized sends; old tabs retain full messages. */
export class RoomDelivery {
  private readonly compact = new WeakSet<WebSocket>();
  private readonly delivered = new WeakMap<WebSocket, Delivered>();
  private readonly changes = new WeakMap<RoomFrame, WeakMap<RoomFrame, ReturnType<typeof frameChange>>>();

  enable(socket: WebSocket) {
    this.compact.add(socket);
  }

  view(socket: WebSocket, viewer: Viewer, frame: RoomFrame, completedCommandId?: string): RoomView {
    const sequence = (this.delivered.get(socket)?.sequence ?? 0) + 1;
    this.delivered.set(socket, { frame, sequence });
    return { type: 'view', updates: 2, sequence, viewer, ...frame, completedCommandId };
  }

  update(
    socket: WebSocket,
    viewer: Viewer,
    frame: RoomFrame,
    { committed, completedCommandId }: { committed: boolean; completedCommandId?: string }
  ): Extract<ServerMessage, { type: 'view' | 'activity' | 'update' }> {
    const base = this.delivered.get(socket);
    if (!this.compact.has(socket)) {
      return committed
        ? this.view(socket, viewer, frame, completedCommandId)
        : { type: 'activity', epoch: frame.epoch, carries: frame.carries, pointers: frame.pointers };
    }
    if (!base || base.frame.epoch !== frame.epoch) {
      return this.view(socket, viewer, frame, completedCommandId);
    }
    let byBase = this.changes.get(frame);
    if (!byBase) {
      byBase = new WeakMap();
      this.changes.set(frame, byBase);
    }
    let change = byBase.get(base.frame);
    if (!change) {
      change = frameChange(base.frame, frame);
      byBase.set(base.frame, change);
    }
    const sequence = base.sequence + 1;
    this.delivered.set(socket, { frame, sequence });
    return { type: 'update', epoch: frame.epoch, baseSequence: base.sequence, sequence, ...change, completedCommandId };
  }
}
