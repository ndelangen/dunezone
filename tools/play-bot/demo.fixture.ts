/*
 * What the headless demos share: a game Worker under Play's own test runtime that reads a mirrored catalogue, and a
 * transport that lets a bot talk to it over a native test connection.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { ServerMessage } from '../../src/shared/play/protocol';
import type { NativeConnection } from '../../workers/game/native-runtime.fixture.ts';
import { createPeer, createRuntime, provision } from '../../workers/game/native-runtime.fixture.ts';
import type { Transport } from './bot';
import { readMirror, RULEBOOK_FILE } from './mirror';
import { Rulebook, rulebookMarkdown } from './rulebook';
import type { RulebookContents } from './rulebook';

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

/* The repository's copy of the GF9 core rules, for a demo on the tutorial's catalogue, which has no rulebook beside it. */
const GF9_CORE_RULES = path.join(import.meta.dirname, '../../content/gf9/core-rules.json');

/** The rulebook a demo bot reads: the mirror's own copy when it has one, else the GF9 core rules in the repository. */
export function demoRulebook(): Rulebook {
  const mirrored = process.env.PLAY_BOT_MIRROR && path.join(process.env.PLAY_BOT_MIRROR, RULEBOOK_FILE);
  if (mirrored && existsSync(mirrored)) {
    return new Rulebook(readFileSync(mirrored, 'utf8'));
  }
  const { data } = JSON.parse(readFileSync(GF9_CORE_RULES, 'utf8')) as { data: { name: string; contents: RulebookContents } };
  return new Rulebook(rulebookMarkdown(data.name, data.contents));
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
