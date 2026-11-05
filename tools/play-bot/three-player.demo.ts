/*
 * One person and two bots at one table, on the real game Worker under Play's own test runtime. Each bot is its own PlayBot
 * with its own connection, notes, transcript and brain, as two `bun run play:bot` processes are on a Mac, and nothing tells a
 * bot which other seat is a bot. A scripted person drafts, deals the Traitors and asks each bot by faction to play its setup.
 *
 *   bun run play:bot:demo -- tools/play-bot/three-player.demo.ts                       # scripted brains: plumbing and isolation
 *   PLAY_BOT_BRAIN=claude bun run play:bot:demo -- tools/play-bot/three-player.demo.ts # the same with Claude Code thinking
 *
 * It checks that a table message naming one faction wakes only that bot, and that neither bot's prompt ever holds the
 * other's private notes. Transcripts land in tools/play-bot/out/three-player-<stamp>/.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'vite-plus/test';

import type { PieceAction } from '../../src/shared/play/protocol';
import { setupStep } from '../../src/shared/play/setup';
import type { NativeView } from '../../workers/game/native-runtime.fixture.ts';
import { admitPlayer, eventually, required, seat, sendCommand, syncView } from '../../workers/game/native-runtime.fixture.ts';
import { PlayBot } from './bot';
import type { Brain } from './bot';
import { claudeBrain, codexBrain, scriptedBrain } from './brains';
import { mirroredGame, nativeTransport } from './demo.fixture';
import { namesFaction } from './lobby';

const HUMAN_FACTION = process.env.PLAY_HUMAN_FACTION ?? 'Emperor';
/* Two ordinary names: the table shows these, never "bot". */
const BOTS = [
  { name: 'Alex', suffix: 'b', want: process.env.PLAY_BOT_FACTION ?? 'Fremen' },
  { name: 'Sam', suffix: 'c', want: process.env.PLAY_BOT2_FACTION ?? 'Harkonnen' },
];

const wokenBy = (prompt: string) => /Why you were woken:\n([\s\S]*?)\n(?:Your private notes|$)/u.exec(prompt)?.[1] ?? '';

/** A brain per bot; the scripted one keeps a secret in its notes, so the test can look for it in the other bot's prompts. */
function brainFor(name: string, prompts: string[]): Brain {
  const choice = process.env.PLAY_BOT_BRAIN ?? 'scripted';
  /* Outside the repository, so a real CLI reads none of its instructions, and one directory per bot. */
  const workdir = mkdtempSync(path.join(tmpdir(), `dunezone-play-bot-${name.toLowerCase()}-`));
  const real = choice === 'claude' ? claudeBrain({ workdir }) : choice === 'codex' ? codexBrain({ workdir }) : null;
  const scripted = scriptedBrain(async (call, prompt) => {
    const holdings = await call('look');
    const woken = wokenBy(prompt);
    await call('note', { text: `secret plan of ${name}: ${name.toUpperCase()}-SECRET` });
    if (/traitor/iu.test(woken)) {
      const names = [...holdings.matchAll(/Traitor cards: ([^\n]+)/gu)][0]?.[1] ?? '';
      const all = [...names.matchAll(/([^,[]+?) \[/gu)].map((match) => match[1]!.trim());
      const keep = /You play (House )?Harkonnen/u.test(holdings) ? all : all.slice(0, 1);
      await call('keep_traitors', { keep });
      await call('set_ready', { ready: true });
      await call('say', { to: 'table', text: `Kept my Traitor${keep.length > 1 ? 's' : ''}. Ready.` });
      return 'Kept Traitors.';
    }
    await call('set_ready', { ready: true });
    await call('say', { to: 'table', text: 'Ready.' });
    return 'Ready.';
  });
  return {
    name: real?.name ?? scripted.name,
    think: async (prompt, bot) => {
      prompts.push(prompt);
      return await (real ?? scripted).think(prompt, bot);
    },
  };
}

it('seats one person and two isolated bots, and plays the setup', async () => {
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const out = path.join(import.meta.dirname, 'out', `three-player-${stamp}`);
  mkdirSync(out, { recursive: true });
  const { peer, runtime } = await mirroredGame(3);

  const human = await admitPlayer(runtime, 'a', { displayName: 'Player' });
  type SeatedBot = (typeof BOTS)[number] & {
    connection: Awaited<ReturnType<typeof admitPlayer>>;
    bot: PlayBot;
    prompts: string[];
  };
  const bots: SeatedBot[] = [];
  for (const entry of BOTS) {
    const connection = await admitPlayer(runtime, entry.suffix, { displayName: entry.name });
    const prompts: string[] = [];
    const directory = path.join(out, entry.name.toLowerCase());
    mkdirSync(directory, { recursive: true });
    const bot = new PlayBot(nativeTransport(connection), {
      brain: brainFor(entry.name, prompts),
      notesFile: path.join(directory, 'notes.md'),
      transcriptFile: path.join(directory, 'transcript.md'),
      want: entry.want,
    });
    await seat(connection, human);
    bots.push({ ...entry, connection, bot, prompts });
  }

  /* The bots act at the same time, so a stale refusal is simply sent again on the fresh view. */
  const act = async (action: PieceAction) => {
    let { reply } = await sendCommand(human, action);
    for (let attempt = 0; attempt < 5 && reply.type === 'rejected' && /table changed/iu.test(reply.message); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      ({ reply } = await sendCommand(human, action));
    }
    if (reply.type === 'rejected') {
      throw new Error(`The person's ${action.kind} was refused: ${reply.message}`);
    }
  };
  const view = async (): Promise<NativeView> => await syncView(human);
  const waitForStage = (stage: string) =>
    eventually(async () => ((await view()).snapshot.stage === stage ? true : undefined), `the ${stage} stage`, 30_000);
  const idle = () => Promise.all(bots.map(({ bot }) => bot.idle()));

  const draft = required((await view()).snapshot.draft);
  await act({
    kind: 'draft-pick',
    factionId: required(draft.factions.find((faction) => namesFaction(faction.name, HUMAN_FACTION))).id,
  });
  await act({ kind: 'draft-ready', ready: true });
  await waitForStage('swapping');
  /* The person accepts any swap offered to them and keeps their faction once they hold the one they drafted. */
  await eventually(
    async () => {
      const { snapshot, viewer } = await view();
      const swapping = snapshot.swapping;
      if (!swapping || snapshot.stage !== 'swapping') {
        return true;
      }
      const offer = swapping.offers.find((entry) => entry.target === viewer.viewerSeat);
      const mine = snapshot.roster?.seats.find((entry) => entry.id === viewer.viewerSeat)?.faction;
      if (offer && !swapping.ready.includes(viewer.viewerSeat)) {
        await act({ kind: 'swap-accept', round: swapping.round, seat: viewer.viewerSeat, offerId: offer.id });
      } else if (mine && namesFaction(mine.name, HUMAN_FACTION) && !swapping.ready.includes(viewer.viewerSeat)) {
        await act({ kind: 'swap-ready', round: swapping.round, seat: viewer.viewerSeat, ready: true });
      }
      return undefined;
    },
    'trading to close',
    60_000
  );
  await waitForStage('setup');
  const dealt = await view();
  const humanFaction = required(
    dealt.snapshot.roster?.seats.find((entry) => entry.id === dealt.viewer.viewerSeat)?.faction
  );
  for (const entry of bots) {
    const own = await syncView(entry.connection);
    const faction = required(own.snapshot.roster?.seats.find((s) => s.id === own.viewer.viewerSeat)?.faction);
    expect(namesFaction(faction.name, entry.want)).toBe(true);
    Object.assign(entry, { faction });
  }
  const factionOf = (entry: (typeof bots)[number]) => (entry as unknown as { faction: { id: string; name: string } }).faction;

  const tell = async (text: string) => {
    human.send({ type: 'conversation-send', requestId: randomUUID(), factionId: humanFaction.id, peerId: '@table', text });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await idle();
  };

  while ((await view()).snapshot.stage === 'setup') {
    const current = setupStep(required((await view()).snapshot.setup));
    if (current.kind === 'traitors') {
      await act({ kind: 'traitors-gather' });
      const pile = async () =>
        required((await view()).snapshot.table.pieces.find((p) => p.stackKey === 'cards:traitor' && !p.inventory));
      await act({ kind: 'deck-shuffle', pieceId: (await pile()).id });
      for (let round = 0; round < 4; round++) {
        for (const faction of [humanFaction, ...bots.map(factionOf)]) {
          await act({ kind: 'deck-draw', pieceId: (await pile()).id, recipient: faction.id });
        }
      }
      /* Each bot is asked by its faction's name; the other must stay asleep. */
      for (const entry of bots) {
        const before = bots.map((other) => other.prompts.length);
        await tell(`${factionOf(entry).name}, your four Traitors are in your hand. Keep yours and confirm Ready.`);
        bots.forEach((other, index) =>
          expect(other.prompts.length - before[index]!).toBe(other === entry ? 1 : 0)
        );
      }
    } else {
      for (const entry of bots) {
        await tell(`${factionOf(entry).name}, please do what the step "${current.title}" needs from you, then confirm Ready.`);
      }
    }
    await act({ kind: 'ready', ready: true }).catch(() => undefined);
    await act({ kind: 'phase', direction: 1 });
  }

  /* Isolation: a bot's prompts never hold the other's notes, and nothing it is shown calls a seat a bot. */
  for (const entry of bots) {
    const others = bots.filter((other) => other !== entry).map((other) => `${other.name.toUpperCase()}-SECRET`);
    for (const prompt of entry.prompts) {
      for (const secret of others) {
        expect(prompt).not.toContain(secret);
      }
      expect(prompt).not.toMatch(/\bbot\b/iu);
    }
    expect(entry.prompts.length).toBeGreaterThan(0);
    const hand = (await syncView(entry.connection)).snapshot.hand ?? [];
    expect(hand.some((piece) => piece.stackKey === 'cards:traitor')).toBe(true);
  }
  expect((await view()).snapshot.stage).toBe('play');

  for (const { bot } of bots) {
    bot.stop();
  }
  await runtime.close();
  await peer.close();
  console.log(`Transcripts: ${out}`);
});
