/*
 * A full 1v1 opening against the bot on the real game Worker, run under Miniflare with Play's own test runtime, so it needs
 * no Docker, no Convex and no accounts. The game plays out as a real one does: the draft, trading, setup with Traitors,
 * starting cards, spice and troops, and Turn 1. A scripted "human" in seat 1 creates the game and talks to the bot in seat 2;
 * the bot acts only when it is written to.
 *
 *   PLAY_BOT_BRAIN=claude bun run play:bot:demo      # a real game with Claude Code (signed in on this machine)
 *   PLAY_BOT_BRAIN=codex  bun run play:bot:demo      # the same with Codex
 *   bun run play:bot:demo                             # the scripted brain: checks the plumbing, no model
 *
 * Content: PLAY_BOT_MIRROR=<directory from `bun run play:bot:pull`> plays the real GF9 catalogue; without it the demo
 * uses the tutorial's copy of the catalogue, which is in the repository. PLAY_BOT_FACTION and PLAY_HUMAN_FACTION pick the
 * factions (Fremen and Emperor by default). The transcript lands in tools/play-bot/out/.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vite-plus/test';

import type { PieceAction } from '../../src/shared/play/protocol';
import { setupStep } from '../../src/shared/play/setup';
import type { NativeView } from '../../workers/game/native-runtime.fixture.ts';
import {
  admitPlayer,
  eventually,
  required,
  seat,
  sendCommand,
  syncView,
} from '../../workers/game/native-runtime.fixture.ts';
import { PlayBot } from './bot';
import type { Brain } from './bot';
import { claudeBrain, codexBrain, scriptedBrain } from './brains';
import { describeView } from './describe';
import { namesFaction } from './lobby';
import { mirroredGame, nativeTransport } from './demo.fixture';

const out = path.join(import.meta.dirname, 'out');
const BOT_FACTION = process.env.PLAY_BOT_FACTION ?? 'Fremen';
const HUMAN_FACTION = process.env.PLAY_HUMAN_FACTION ?? 'Emperor';

/** What the scripted brain was woken by: the lines under "Why you were woken". */
const wokenBy = (prompt: string) => /Why you were woken:\n([\s\S]*?)\n(?:Your private notes|$)/u.exec(prompt)?.[1] ?? '';

function chooseBrain(): Brain {
  const choice = process.env.PLAY_BOT_BRAIN ?? 'scripted';
  if (choice === 'claude') {
    return claudeBrain({ model: process.env.PLAY_BOT_MODEL });
  }
  if (choice === 'codex') {
    return codexBrain({ model: process.env.PLAY_BOT_MODEL });
  }
  /* Follows the human's requests by keyword, so every tool the setup needs runs once without a model. */
  return scriptedBrain(async (call, prompt) => {
    const holdings = await call('look');
    const woken = wokenBy(prompt);
    if (/not (a )?legal/iu.test(woken)) {
      await call('undo_last_move');
      await call('note', { text: 'Ruling: no troops on the board until the storm has moved twice.' });
      await call('say', { to: 'table', text: 'Understood, I took that move back.' });
      return 'Undid the move.';
    }
    if (/traitor/iu.test(woken)) {
      const first = required(/Traitor cards: ([^[,]+?) \[/u.exec(holdings)?.[1]);
      await call('keep_traitors', { keep: [first.trim()] });
      await call('set_ready', { ready: true });
      await call('say', { to: 'table', text: 'I kept one Traitor and returned the rest. Ready.' });
      return 'Kept a Traitor.';
    }
    if (/treachery card/iu.test(woken)) {
      await call('draw_card', { deck: 'treachery' });
      await call('take_spice', { amount: 3 });
      await call('say', { to: 'table', text: 'Drew my Treachery card and took my starting spice.' });
      return 'Drew and took spice.';
    }
    if (/starting troops/iu.test(woken)) {
      const reserve = required(/: \d+ in all: (\d+) in off the board \[([0-9a-f-]{36})\]/u.exec(holdings))[2];
      await call('move_pieces', { pieceId: reserve, territory: 'Sietch Tabr', count: 3 });
      await call('set_ready', { ready: true });
      await call('say', { to: 'table', text: 'Starting troops placed. Ready.' });
      return 'Placed troops.';
    }
    if (/deal\?/iu.test(woken)) {
      const sender = /private with ([^)]+)\)/u.exec(woken)?.[1];
      await call('say', { to: 'table', text: `No deal${sender ? `, ${sender}` : ''}.` });
      return 'Declined.';
    }
    await call('say', { to: 'table', text: 'Ready when you are.' });
    return 'Replied.';
  });
}

it('plays the opening of a 1v1 from the draft against a human', async () => {
  mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
  const transcriptFile = path.join(out, `demo-${stamp}.md`);
  const notesFile = path.join(out, `demo-${stamp}-notes.md`);
  rmSync(notesFile, { force: true });

  const { mirror, peer, runtime } = await mirroredGame(2, 'Norbert');

  const human = await admitPlayer(runtime, 'a');
  const botConnection = await admitPlayer(runtime, 'b', { displayName: 'Alex' });
  const bot = new PlayBot(nativeTransport(botConnection), {
    brain: chooseBrain(),
    notesFile,
    transcriptFile,
    want: BOT_FACTION,
    style: process.env.PLAY_BOT_STYLE ?? 'Patient desert raiders who strike when the storm favours them; polite but proud.',
  });
  bot.log(
    `# Dune Play bot demo, ${new Date().toISOString()}\n\nBrain: ${bot['options'].brain.name}. Catalogue: ${mirror.ruleset.ruleset.name}, pulled ${mirror.file.pulledAt}.\n`
  );
  await seat(botConnection, human);
  bot.log('The human created the game and approved the bot\'s seat.');

  const act = async (action: PieceAction) => {
    const { reply } = await sendCommand(human, action);
    if (reply.type === 'rejected') {
      throw new Error(`The human's ${action.kind} was refused: ${reply.message}`);
    }
  };
  const view = async (): Promise<NativeView> => await syncView(human);
  const waitForStage = (stage: string) =>
    eventually(async () => ((await view()).snapshot.stage === stage ? true : undefined), `the ${stage} stage`, 30_000);

  /* Drafting: the human picks their faction and confirms; the bot's lobby picks its own. */
  const draft = required((await view()).snapshot.draft);
  const humanPick = required(draft.factions.find((faction) => namesFaction(faction.name, HUMAN_FACTION)));
  await act({ kind: 'draft-pick', factionId: humanPick.id });
  await act({ kind: 'draft-ready', ready: true });
  bot.log(`The human drafted ${humanPick.name} and is ready.`);
  await waitForStage('swapping');

  /* Trading: the deal is random, so the human gives the bot its faction if the deal went the other way. */
  await eventually(
    async () => {
      const { snapshot, viewer } = await view();
      const swapping = snapshot.swapping;
      if (!swapping || snapshot.stage !== 'swapping') {
        return true;
      }
      const offer = swapping.offers.find((entry) => entry.target === viewer.viewerSeat);
      const mine = snapshot.roster?.seats.find((entry) => entry.id === viewer.viewerSeat)?.faction;
      if (offer) {
        await act({ kind: 'swap-accept', round: swapping.round, seat: viewer.viewerSeat, offerId: offer.id });
        bot.log('The human accepted the bot\'s offer to swap factions.');
      } else if (mine && namesFaction(mine.name, HUMAN_FACTION) && !swapping.ready.includes(viewer.viewerSeat)) {
        await act({ kind: 'swap-ready', round: swapping.round, seat: viewer.viewerSeat, ready: true });
      }
      return undefined;
    },
    'trading to close',
    60_000
  );
  await waitForStage('setup');
  /* A swap trades seats, so each side is found by the seat it holds now. */
  const dealt = await view();
  const roster = required(dealt.snapshot.roster).seats;
  const humanFaction = required(roster.find((entry) => entry.id === dealt.viewer.viewerSeat)?.faction);
  const botFaction = required(roster.find((entry) => entry.id !== dealt.viewer.viewerSeat)?.faction);
  bot.log(`Setup opens. The human plays ${humanFaction.name}; the bot plays ${botFaction.name}.\n`);
  expect(namesFaction(botFaction.name, BOT_FACTION)).toBe(true);

  const tell = async (text: string, peerId = '@table') => {
    bot.log(`\n**Human (${humanFaction.name}) → ${peerId === '@table' ? 'table' : 'private'}:** ${text}`);
    human.send({ type: 'conversation-send', requestId: randomUUID(), factionId: humanFaction.id, peerId, text });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await bot.idle();
  };
  /* Next moves setup or the turn on once both seats are ready; the human readies itself first. */
  const next = async () => {
    const { snapshot } = await view();
    if (snapshot.stage === 'setup' && snapshot.setup && setupStep(snapshot.setup).kind !== 'prediction') {
      await act({ kind: 'ready', ready: true });
    }
    await act({ kind: 'phase', direction: 1 });
    const after = (await view()).snapshot;
    bot.log(
      `\n> Table: ${after.stage === 'setup' && after.setup ? `setup step "${setupStep(after.setup).title}"` : `turn phase ${after.phase + 1}`}`
    );
  };
  const step = async () => {
    const { snapshot } = await view();
    return snapshot.setup ? setupStep(snapshot.setup) : undefined;
  };

  /* Setup, step by step, as the table's own instructions run it. */
  while ((await view()).snapshot.stage === 'setup') {
    const current = required(await step());
    if (current.kind === 'traitors') {
      await act({ kind: 'traitors-gather' });
      const pile = () =>
        view().then(({ snapshot }) =>
          required(snapshot.table.pieces.find((piece) => piece.stackKey === 'cards:traitor' && !piece.inventory))
        );
      await act({ kind: 'deck-shuffle', pieceId: (await pile()).id });
      for (let round = 0; round < 4; round++) {
        for (const faction of [humanFaction, botFaction]) {
          await act({ kind: 'deck-draw', pieceId: (await pile()).id, recipient: faction.id });
        }
      }
      bot.log('\n> Table: the human gathered and shuffled the Traitors and dealt four to each faction.');
      await tell(`${botFaction.name}, your four Traitors are in your hand. Keep one, return the rest to the pile, then confirm Ready.`);
      await next();
    } else if (current.kind === 'forces') {
      await tell(
        `Before troops: each of us draws one Treachery card and takes our starting spice from the Spice Bank, as our sheets say.`
      );
      await tell(`${botFaction.name}, place your starting troops as your sheet says, then confirm Ready.`);
      await next();
    } else {
      await tell(`We are on the setup step "${current.title}". ${botFaction.name}, do what it needs from you, then confirm Ready.`);
      await next();
    }
  }

  const holdings = (await syncView(botConnection)).snapshot;
  bot.log(
    `\n> After setup the bot holds ${holdings.hand?.length ?? 0} pieces in hand and ${holdings.bank?.balance ?? 0} spice.`
  );
  expect(holdings.hand?.filter((piece) => piece.stackKey === 'cards:traitor').length).toBeGreaterThan(0);
  bot.log(`\n## What the bot sees after setup\n\n\`\`\`\n${describeView(bot.view)}\n\`\`\`\n`);

  await tell(
    'Hey! Your troop placement is not legal: in our house rules nobody may put troops on the board until the storm has moved twice. Please take it back.'
  );
  await tell('Between us: I will pay you 2 spice if you leave Arrakeen alone for the next two turns. Deal?', botFaction.id);

  const final = await view();
  bot.log(`\n## Notes the bot kept\n\n${bot.notes() || '(none)'}`);
  bot.log(
    `\n## Table log at the end (newest first)\n\n${final.snapshot.table.events
      .slice(0, 20)
      .map((event) => `- ${event.message}`)
      .join('\n')}`
  );
  bot.stop();
  await runtime.close();
  await peer.close();
  console.log(`Transcript: ${transcriptFile}`);
});
