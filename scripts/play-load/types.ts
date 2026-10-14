import type { Socket } from 'node:net';

import type { ConvexHttpClient } from 'convex/browser';
import type { Page } from 'playwright';
import type WebSocket from 'ws';

import type { PublicCarry, PublicPointer, ServerMessage } from '../../src/shared/play/protocol.ts';
import type { BrowserReport } from './browsers.ts';

export type ViewMessage = Extract<ServerMessage, { type: 'view' }>;
type ActivityMessage = Pick<ViewMessage, 'epoch' | 'carries' | 'pointers'> & { type: 'activity' };
export type UpdateMessage = Extract<ServerMessage, { type: 'update' }>;
export type MetricsMessage = Extract<ServerMessage, { type: 'metrics' }>;
export type Phase = 'preparation' | 'warmup' | 'measured';
export type MotionKind = 'pointer' | 'pose';
export type Recipient = { index: number; role?: string; browser?: boolean };
export type InteractionSample = {
  peer: number;
  operation: string;
  phase: Phase;
  scheduledAt: number;
  dispatchedAt: number;
  expected: number[];
  appliedAt: Record<number, number>;
  revision?: number;
  confirmedAt?: number;
  completedAt?: number;
  carryRequestedAt?: number;
  carryAdmittedAt?: number;
  commandSentAt?: number;
  status?: 'accepted' | 'rejected' | 'failed';
  error?: string;
};
export type MotionSample = {
  phase: Phase;
  at: number;
  dispatchedAt?: number;
  source: number;
  expected: Set<number>;
  seen: Set<number>;
  stream?: string;
  seq?: number;
  superseded?: Set<number>;
};
export type MotionEntry = Pick<PublicPointer | PublicCarry, 'connectionId' | 'sourceSeq'>;
export type PeerUser = { index: number; email: string; password: string; client: ConvexHttpClient };
export type Peer = Recipient & {
  role: 'player' | 'observer' | 'secondary';
  user: PeerUser;
  slow?: boolean;
  socket?: WebSocket | { terminate(): void };
  responses: Map<string, ServerMessage>;
  view?: ViewMessage;
  activity?: ViewMessage | ActivityMessage;
  authorized?: boolean;
  resyncing?: boolean;
  carryId?: string;
  transports?: { socket: Socket; extensions: string | null }[];
  closes?: { atMs: number; code: number; reason: string; stopping: boolean }[];
  sentBytes?: number;
  receivedBytes?: number;
  messagesByType?: Partial<Record<ServerMessage['type'], { deliveries: number; bytes: number; maxBytes: number }>>;
  page?: Page;
  browserCapture?: Promise<void>;
  browserReport?: BrowserReport;
};
export type InteractionSlot = { phase?: Phase; scheduledAt?: number; dispatchedAt?: number };
