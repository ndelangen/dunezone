import type { BrowserContext, Page } from 'playwright';
import type { Scene } from 'three';
import type { WebGPURenderer, WebGPUBackend, WebGLBackend } from 'three/webgpu';
import type { z } from 'zod';

import type { homepageMessageSchema } from '../src/shared/homepage/protocol.ts';
import type { ClientMessage, GameSnapshot, ServerMessage } from '../src/shared/play/protocol.ts';
import type { RoomView } from '../src/shared/play/updates.ts';

export type Point = { x: number; y: number };
export type Bounds = Point & { width: number; height: number };
export type TablePiece = GameSnapshot['table']['pieces'][number];
export type ActivityFrame = Pick<RoomView, 'epoch' | 'carries' | 'pointers'> & { type: 'activity' };
export type ObservedMessage = ServerMessage | ActivityFrame;
export type SentMessage =
  | Exclude<z.infer<typeof homepageMessageSchema>, { type: 'authenticate' }>
  | Exclude<ClientMessage, { type: 'admit' }>
  | { type: 'admit' | 'authenticate'; ticketLength: number; credential?: 'ticket' | 'pass' };
export type SocketObservation = {
  url: string;
  closed: boolean;
  refusedAt: number | null;
  closedAt: number | null;
  documentReplaced?: boolean;
};
export type AdmissionObservation = {
  convexSockets: { openedAt: number; closedAt: number | null }[];
  tickets: { requestId: number; sentAt: number; sends: number; answeredAt: number | null; outcome?: string }[];
  authErrors: number;
};
export type HostedPeer = {
  label: string;
  page: Page;
  context: BrowserContext;
  messages: ObservedMessage[];
  rawMessages: ServerMessage[];
  sent: SentMessage[];
  sockets: SocketObservation[];
  admission: AdmissionObservation;
  view(): RoomView | undefined;
  phaseCooldown: { ms: number; receivedAt: number };
};
export type Until = <Value>(
  predicate: () => Value | Promise<Value>,
  description: string,
  timeout?: number
) => Promise<Exclude<Value, null | undefined | false>>;
export type ConnectionStatus = { at: number; connection: string | null; status: string | null };
export type ObservedRenderer = Omit<WebGPURenderer, 'backend'> & {
  backend: (WebGPUBackend | WebGLBackend) & {
    isWebGPUBackend?: boolean;
    isWebGLBackend?: boolean;
    device?: GPUDevice;
    gl?: WebGL2RenderingContext;
  };
};
export function required<Value>(value: Value, description: string): NonNullable<Value> {
  if (value === undefined || value === null) {
    throw new Error(`Missing ${description}.`);
  }
  return value;
}
export function requireView(peer: HostedPeer): RoomView {
  return required(peer.view(), 'authorized view');
}
declare global {
  interface Window {
    __THREE_DEVTOOLS__?: EventTarget;
    hostedPlayRenderers?: WeakMap<Element, ObservedRenderer>;
    hostedPlayConnection?: ConnectionStatus[];
    hostedPlayScenes?: WeakRef<Scene>[];
    hostedPlayCooldowns?: Set<string>;
  }
}
