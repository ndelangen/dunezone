import assert from 'node:assert/strict';

import { serverMessageSchema } from '../../src/shared/play/protocol.ts';
import type { ServerMessage } from '../../src/shared/play/protocol.ts';

const messageTypes = new Set<string>(serverMessageSchema.options.map((schema) => schema.shape.type.value));

/** The isolated Worker owns the payload contract. Check the envelope without copying or validating every measured leaf. */
export function readServerMessage(text: string): ServerMessage {
  const value: unknown = JSON.parse(text);
  assert.ok(value !== null && typeof value === 'object' && 'type' in value);
  assert.ok(typeof value.type === 'string' && messageTypes.has(value.type));
  return value as ServerMessage;
}
