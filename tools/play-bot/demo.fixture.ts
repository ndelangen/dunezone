/*
 * What the headless demos share: a game Worker under Play's own test runtime that reads a mirrored catalogue, and a
 * transport that lets a bot talk to it over a native test connection.
 */
import path from 'node:path';

import type { ServerMessage } from '../../src/shared/play/protocol';
import type { NativeConnection } from '../../workers/game/native-runtime.fixture.ts';
import { createPeer, createRuntime, provision } from '../../workers/game/native-runtime.fixture.ts';
import type { Transport } from './bot';
import { readMirror } from './mirror';

export const TUTORIAL_CATALOGUE = path.join(
  import.meta.dirname,
  '../../src/app/routes/_app/tutorial/setup/catalogue.json'
);

export function nativeTransport(connection: NativeConnection): Transport {
  return {
    send: (message) => connection.send(message),
    keepalive: () => connection.keepalive(),
    onMessage(listener) {
      connection.socket.addEventListener('message', (event) => {
        if (typeof event.data === 'string' && event.data !== 'pong') {
          listener(JSON.parse(event.data) as ServerMessage);
        }
      });
    },
  };
}

/** A provisioned game for `players` seats whose Worker reads the mirror (or the tutorial's catalogue copy) as its catalogue. */
export async function mirroredGame(players: 2 | 3 | 4 | 5 | 6, creatorName = 'Player') {
  const mirror = readMirror(process.env.PLAY_BOT_MIRROR ?? TUTORIAL_CATALOGUE);
  const peer = await createPeer();
  peer.game = {
    rulesetId: mirror.ruleset.ruleset.id,
    minimumPlayers: players,
    creator: { userId: 'user-a', displayName: creatorName, avatarUrl: null, profileSlug: 'synthetic-a' },
  };
  peer.testPhaseCooldownMs = 0;
  peer.rulesets.set(mirror.ruleset.ruleset.id, mirror.ruleset);
  for (const [key, answer] of mirror.assets) {
    peer.catalogue.set(key, answer);
  }
  peer.draftable = mirror.draftable;
  for (const [id, definition] of mirror.factions) {
    peer.factions.set(id, definition);
  }
  /* The phase cooldown can be shortened only in the isolated local runtime, which these bindings name. */
  const runtime = await createRuntime(peer, 'game', {
    GIT_SHA: 'local-isolated',
    APPLICATION_ORIGIN: 'http://127.0.0.1:8787',
  });
  const provisioned = await provision(runtime);
  if (provisioned.status !== 200) {
    throw new Error(`The demo game did not provision (${provisioned.status}).`);
  }
  return { mirror, peer, runtime };
}
