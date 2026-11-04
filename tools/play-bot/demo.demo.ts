/*
 * A 1v1 game against the bot on the real game Worker, run under Miniflare with Play's own test runtime, so it needs no
 * Docker, no Convex and no accounts. A scripted "human" in seat 1 talks to the bot in seat 2, picks up its faction
 * token to ask it to act, calls one of its moves illegal and offers it a private deal.
 *
 *   PLAY_BOT_BRAIN=claude bun run play:bot:demo      # a real game with Claude Code (signed in on this machine)
 *   PLAY_BOT_BRAIN=codex  bun run play:bot:demo      # the same with Codex
 *   bun run play:bot:demo                             # the scripted brain: checks the plumbing, no model
 *
 * The transcript lands in tools/play-bot/out/.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { it } from 'vite-plus/test';

import { factionTokenOf } from '../../src/shared/play/factionToken';
import { TABLE_PHASES } from '../../src/shared/play/phases';
import type { ServerMessage } from '../../src/shared/play/protocol';
import { draftingRuntime } from '../../workers/game/native-drafting.fixture.ts';
import type { NativeConnection } from '../../workers/game/native-runtime.fixture.ts';
import { admitPlayer, required, seat, sendCommand, syncView } from '../../workers/game/native-runtime.fixture.ts';
import { PlayBot } from './bot';
import type { Brain, Transport } from './bot';
import { claudeBrain, codexBrain, scriptedBrain } from './brains';

const LOCAL_ISOLATED = { GIT_SHA: 'local-isolated', APPLICATION_ORIGIN: 'http://127.0.0.1:8787' };
const out = path.join(import.meta.dirname, 'out');

function nativeTransport(connection: NativeConnection): Transport {
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

function chooseBrain(): Brain {
  const choice = process.env.PLAY_BOT_BRAIN ?? 'scripted';
  if (choice === 'claude') {
    return claudeBrain({ model: process.env.PLAY_BOT_MODEL });
  }
  if (choice === 'codex') {
    return codexBrain({ model: process.env.PLAY_BOT_MODEL });
  }
  /* Ships three troops wherever it is asked to act, answers chat in one line, and undoes when told a move was illegal. */
  return scriptedBrain(async (call, prompt) => {
    await call('look');
    const woken = /Why you were woken:\n([\s\S]*?)\n(?:Your private notes|$)/u.exec(prompt)?.[1] ?? '';
    if (/not (a )?legal/iu.test(woken)) {
      await call('undo_last_move');
      await call('note', { text: 'Ruling: no troops on the board until the storm has moved twice.' });
      await call('say', { to: 'table', text: 'Understood, I took that move back.' });
      return 'Undid the move.';
    }
    if (/picked up your faction token/iu.test(woken)) {
      const me = required(/You play (\w+)/u.exec(prompt))[1];
      const reserve = required(new RegExp(`\\[([0-9a-f-]{36})\\] ${me}: \\d+ × Regular troop`, 'u').exec(prompt))[1];
      await call('move_pieces', { pieceId: reserve, territory: 'Carthag', count: 3 });
      await call('say', { to: 'table', text: 'I ship 3 troops to Carthag.' });
      return 'Shipped.';
    }
    await call('say', { to: 'table', text: 'Ready when you are.' });
    return 'Replied.';
  });
}

it('plays a short 1v1 against a human', async () => {
  mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const transcriptFile = path.join(out, `demo-${stamp}.md`);
  const notesFile = path.join(out, `demo-${stamp}-notes.md`);
  rmSync(notesFile, { force: true });

  const { peer, runtime } = await draftingRuntime([], undefined, {
    bindings: LOCAL_ISOLATED,
    testPhaseCooldownMs: 0,
    testStartStage: 'play',
  });
  const human = await admitPlayer(runtime, 'a');
  const botConnection = await admitPlayer(runtime, 'b', { displayName: 'Dune Bot' });
  const bot = new PlayBot(nativeTransport(botConnection), {
    brain: chooseBrain(),
    notesFile,
    transcriptFile,
    style: process.env.PLAY_BOT_STYLE ?? 'Ambitious and a little sly, but polite at the table.',
  });
  bot.log(`# Dune Play bot demo, ${new Date().toISOString()}\n\nBrain: ${bot['options'].brain.name}\n`);
  const seated = await seat(botConnection, human, 'seat-2');
  const roster = required(seated.snapshot.roster).seats;
  const botFaction = required(roster.find((entry) => entry.id === 'seat-2')?.faction);
  const humanFaction = required(roster.find((entry) => entry.id === 'seat-1')?.faction);
  bot.log(`The human plays ${humanFaction.name}; the bot plays ${botFaction.name}.`);
  botConnection.send({ type: 'sync' });
  /* The human takes the table to Shipment and Movement; phases that wait on every seat get both seats' ready. */
  for (let step = 0; step < 12; step++) {
    const { snapshot } = await syncView(human);
    if (TABLE_PHASES[snapshot.phase]?.id === 'shipment-and-movement') {
      break;
    }
    if ((await sendCommand(human, { kind: 'phase', direction: 1 })).reply.type === 'rejected') {
      await sendCommand(human, { kind: 'ready', ready: true });
      await sendCommand(botConnection, { kind: 'ready', ready: true });
      await sendCommand(human, { kind: 'phase', direction: 1 });
    }
  }
  bot.log(`Phase now: ${TABLE_PHASES[(await syncView(human)).snapshot.phase]?.label}\n`);

  const tell = async (text: string, peerId = '@table') => {
    bot.log(`\n**Human (${humanFaction.name}) → ${peerId === '@table' ? 'table' : 'private'}:** ${text}`);
    human.send({ type: 'conversation-send', requestId: randomUUID(), factionId: humanFaction.id, peerId, text });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await bot.idle();
  };

  await tell(`Welcome to Arrakis, ${botFaction.name}. We skipped ahead to Shipment and Movement of turn 1. Are you ready?`);

  bot.log(`\n**Human picks up the ${botFaction.name} faction token:** your turn to ship.`);
  const token = required(factionTokenOf((await syncView(human)).snapshot.table.pieces, botFaction.id));
  const carryId = randomUUID();
  human.send({
    type: 'begin',
    carryId,
    sourcePieceId: token.id,
    expectedVersion: (await syncView(human)).snapshot.versions[token.id] ?? 0,
    pickup: 'whole',
  });
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await bot.idle();
  human.send({ type: 'cancel', carryId });

  await tell(
    "Hey! Your last move is not legal: in our house rules nobody may put troops on the board until the storm has moved twice. Please take it back."
  );
  await tell(
    'Between us: I will pay you 2 spice if you leave Arrakeen alone for the next two turns. Deal?',
    botFaction.id
  );

  const final = await syncView(human);
  bot.log(`\n## Notes the bot kept\n\n${bot.notes() || '(none)'}`);
  bot.log(
    `\n## Table log at the end (newest first)\n\n${final.snapshot.table.events
      .slice(0, 12)
      .map((event) => `- ${event.message}`)
      .join('\n')}`
  );
  bot.stop();
  await runtime.close();
  await peer.close();
  console.log(`Transcript: ${transcriptFile}`);
});
