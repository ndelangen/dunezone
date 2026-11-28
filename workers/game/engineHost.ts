import { createHmac, randomInt, randomUUID } from 'node:crypto';

import { installEngineHost } from '../../src/shared/play/engine/host';
import type { EngineHost } from '../../src/shared/play/engine/host';

/** The game Worker's side of the engine's host: Node's crypto and the Worker's clock. */
export const workerEngineHost: EngineHost = {
  now: () => Date.now(),
  randomInt: (max) => randomInt(max),
  randomUUID: () => randomUUID(),
  hmacSha256: (key, message) => createHmac('sha256', key).update(message).digest('hex'),
};

/* Every module that builds a Room or a session imports this one first, so the engine has its host before it runs. */
installEngineHost(workerEngineHost);
