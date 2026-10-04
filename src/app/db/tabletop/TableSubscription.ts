import type { ClientMessage, ServerMessage, PieceAction } from '@shared/play/protocol';
import type { RoomView } from '@shared/play/updates';

export type TableConnectionStatus = 'connecting' | 'authorized' | 'suspended' | 'denied';

/** Reads stay available while gameplay waits for synchronization or shows history. */
export function isReadRequest(message: ClientMessage) {
  return ['catalogue', 'history', 'spice-history', 'log-history', 'conversation-history', 'metrics'].includes(
    message.type
  );
}

export type TableSubscriptionEvent =
  | (RoomView & { snapshotChanged: boolean; previous: RoomView | null })
  | Exclude<ServerMessage, { type: 'view' | 'update' | 'admission' }>
  | { type: 'connection'; error: string | null }
  | { type: 'resync'; completedCommandId?: string };

export type TableSubscription = {
  readonly status: TableConnectionStatus;
  readonly ready: boolean;
  supportsCommand(kind: PieceAction['kind']): boolean;
  getSnapshot(): RoomView | null;
  serverNow(): number;
  subscribe(listener: (event: TableSubscriptionEvent) => void): () => void;
  send(message: Exclude<ClientMessage, { type: 'admit' | 'sync' }>): boolean;
};
