import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { BATTLE_COUNTDOWN_MS } from '../../src/shared/play/battle';
import { PHASE_CHANGE_COOLDOWN_MS } from '../../src/shared/play/phases';
import { BOARD_RADIUS } from '../../src/shared/play/tableGeometry';
import board from '../../src/shared/rulebooks/boards/arrakis.json';
import { cardPage, deckPage, slot, spiceCardPage } from './native-catalogue.fixture.mjs';
import {
  accepted,
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  provision,
  seat,
  syncView,
} from './native-runtime.fixture.mjs';

/*
 * Records one real six-seat game for the Play journey stories (`src/app/routes/_app/play/journey.stories.tsx`).
 * The game Worker runs exactly as in every native suite. After each step the recorder keeps the full view every seat
 * and a spectator receive, so the stories replay engine output rather than hand-built snapshots.
 * Run with `bun run play:record`; without RECORD_JOURNEY this suite is skipped.
 */

const directory = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(directory, '../../src/app/routes/_app/play/journey.recording/journey.json');
/* The six public factions the Play page stories use; read from disk, since the Worker imports no application code. */
const factionFixtures = JSON.parse(
  await readFile(join(directory, '../../src/app/routes/_app/play/product.stories.fixture/factions.json'), 'utf8')
);
const ORIGIN = 'http://table.test';
const LATEST = Number.MAX_SAFE_INTEGER;
/* Published paths the peer serves; the recording rewrites them to the Storybook fixture folders. */
const PRODUCT = '/published/story-product/';
const DREAMRULES = '/published/story-dreamrules/';
const fixture = (path) => path.replace('/play-fixtures/product/', PRODUCT);
const SUFFIXES = ['a', 'b', 'c', 'd', 'e', 'f'];
/* The public profiles the other Play stories seat, in seat order (drafting.stories.fixture.ts). */
const PLAYERS = ['Twaffle', 'Thialfi', 'Fectumbra', 'Erickenneth', 'Ridwan', 'Argelius'];
/* Only these two factions have Traitor fronts among the Storybook fixtures; the others deal without a face. */
const TRAITOR_FRONTS = new Set(['house-atreides', 'house-harkonnen']);

function definition({ slug, data, token, leaders }) {
  return {
    faction: { id: slug, slug, name: data.name },
    data,
    token: fixture(token),
    tokenBack: null,
    cardbacks: { traitor: `${PRODUCT}traitor-back.jpg`, alliance: null },
    leaders: leaders.map((leader) => ({ memberId: leader.memberId, front: fixture(leader.front) })),
    troops: data.troops.map((troop, index) => ({
      troopId: troop.troopId,
      front: `${PRODUCT}${slug}-troop-${index}.jpg`,
      back: troop.back ? `${PRODUCT}${slug}-troop-${index}-back.jpg` : null,
    })),
    traitors: data.leaders.map((leader, index) => ({
      memberId: leader.memberId,
      front: TRAITOR_FRONTS.has(slug) ? `${PRODUCT}${slug}-traitor-${index}.jpg` : null,
    })),
    alliance: null,
  };
}

function draftable({ slug, data }) {
  return {
    id: slug,
    slug,
    name: data.name,
    logo: data.logo,
    background: data.background,
    color: data.themeColor,
    linked: true,
    published: true,
  };
}

async function journeyRuntime() {
  const peer = await createPeer();
  peer.watchMode = 'allow';
  peer.expiresAt = () => Date.now() + 3_600_000;
  peer.game = {
    rulesetId: 'dreamrules',
    minimumPlayers: 6,
    creator: { userId: 'user-a', displayName: 'Synthetic A', avatarUrl: null, profileSlug: 'synthetic-a' },
  };
  /* The Storybook fixtures lack some faces a real deal requires, so the isolated path deals them provisionally. */
  peer.provisional = true;
  const snooper = cardPage('snooper');
  snooper.asset.name = 'Snooper';
  snooper.front = `${DREAMRULES}snooper.jpg`;
  const spiceCard = spiceCardPage('broken-land');
  spiceCard.asset.name = 'Broken Land';
  spiceCard.front = `${DREAMRULES}broken-land.jpg`;
  const treachery = deckPage('treachery-deck', [snooper], 12);
  const spice = deckPage('spice-deck', [spiceCard], 8);
  for (const [page, name] of [
    [treachery, 'Treachery'],
    [spice, 'Spice'],
  ]) {
    page.asset.name = name;
    page.back = `${DREAMRULES}cardback.jpg`;
  }
  for (const page of [snooper, spiceCard, treachery, spice]) {
    peer.catalogue.set(`${page.asset.type}/${page.asset.slug}`, page);
  }
  peer.rulesets.set('dreamrules', {
    ruleset: { id: 'dreamrules', slug: 'dreamrules', name: 'Dreamrules' },
    slots: [slot('treachery', treachery), slot('spice', spice)],
  });
  /* A seventh faction in the catalogue, so the draft has something to ban. */
  peer.draftable = [
    ...factionFixtures.map(draftable),
    {
      id: 'ixians',
      slug: 'ixians',
      name: 'Ixians',
      logo: '/vector/logo/ixian.svg',
      background: {
        image: '/image/texture/022.jpg',
        colors: ['#b29b54', '#d1be82'],
        invert: true,
        definition: 0.25,
        influence: 0.9008,
      },
      color: '#c1ab69',
      linked: true,
      published: true,
    },
  ];
  for (const faction of factionFixtures) {
    peer.factions.set(faction.slug, definition(faction));
  }
  const runtime = await createRuntime(peer, 'game');
  if ((await provision(runtime)).status !== 200) {
    throw new Error('The journey game did not provision.');
  }
  return { peer, runtime };
}

/**
 * Interns every large repeated value into one pool, bottom up, so the seven viewers of every step share what did not change.
 * The stories resolve `{ "$": key }` back through the pool (journey.stories.fixture.ts).
 */
function interned(steps) {
  const pool = {};
  const intern = (value) => {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    const shallow = Array.isArray(value)
      ? value.map(intern)
      : Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, intern(entry)]));
    const text = JSON.stringify(shallow);
    if (text.length < 160) {
      return shallow;
    }
    const key = createHash('sha256').update(text).digest('base64url').slice(0, 12);
    pool[key] = shallow;
    return { $: key };
  };
  return { steps: steps.map((step) => ({ ...step, views: intern(step.views) })), pool };
}

/** The recording as text: fixture origins for the published paths, and the story profiles for the synthetic accounts. */
function portable(text) {
  let result = text
    .replaceAll(`${ORIGIN}${PRODUCT}`, '{{origin}}/play-fixtures/product/')
    .replaceAll(`${ORIGIN}${DREAMRULES}`, '{{origin}}/play-fixtures/dreamrules/');
  for (const [index, suffix] of SUFFIXES.entries()) {
    result = result
      .replaceAll(`Synthetic ${suffix.toUpperCase()}`, PLAYERS[index])
      .replaceAll(`synthetic-${suffix}`, PLAYERS[index].toLowerCase());
  }
  return result.replaceAll('Synthetic WATCHER', 'Klyzx').replaceAll('synthetic-watcher', 'klyzx');
}

describe.runIf(process.env.RECORD_JOURNEY)('The Play journey recording', { timeout: 600_000 }, () => {
  it('records a six-seat game from drafting to a declared result', async () => {
    const { peer, runtime } = await journeyRuntime();
    let clock = 0;
    let carries = 0;
    const players = [];
    let spectator;
    const steps = [];
    let roster;

    const viewers = () => [...players, ...(spectator ? [spectator] : [])];
    const territoryName = (key) => board.geometry.parts.find((part) => part.key === key).label;
    /* Seat index of the faction the deal assigned, and that faction's display name. */
    const indexOf = (slug) =>
      Number(roster.seats.find((entry) => entry.faction.id === slug).id.slice('seat-'.length)) - 1;
    const factionAt = (index) => roster.seats.find((entry) => entry.id === `seat-${index + 1}`).faction;
    const who = (index) => `${PLAYERS[index]} (${factionAt(index).name})`;

    async function logPage(connection, tab) {
      const start = connection.messages.length;
      connection.send({ type: 'log-history', tab, before: LATEST });
      const page = await eventually(
        () => connection.messages.slice(start).find((message) => message.type === 'log-history' && message.tab === tab),
        `${tab} log page`
      );
      return page.entries;
    }
    async function record(title, detail, actor = null, action = null) {
      const views = await Promise.all(viewers().map(syncView));
      const [latest] = await logPage(players[0], 'game');
      steps.push({
        title,
        detail,
        actor,
        action,
        logSequence: latest?.sequence ?? 0,
        views: Object.fromEntries(views.map(({ type: _type, ...view }) => [view.viewer.viewerSeat, view])),
      });
    }
    async function act(index, action, title, detail) {
      await accepted(players[index], action);
      await record(title, detail, `seat-${index + 1}`, action);
    }
    async function advanceClock(ms) {
      clock += ms;
      await runtime.clock(clock);
    }
    async function next(index, title, detail) {
      await advanceClock(PHASE_CHANGE_COOLDOWN_MS + 1);
      await act(index, { kind: 'phase', direction: 1 }, title, detail);
    }
    async function readyAll(title, detail) {
      for (const connection of players) {
        await accepted(connection, { kind: 'ready', ready: true });
      }
      await record(title, detail, null, { kind: 'ready', ready: true });
    }
    function territoryPosition(key) {
      const area = board.geometry.parts.find((part) => part.key === key);
      return [
        (area.x + area.width / 2 - 0.5) * BOARD_RADIUS * 2,
        0.4,
        (area.y + area.height / 2 - 0.5) * BOARD_RADIUS * 2,
      ];
    }
    const pieces = async (index = 0) => (await syncView(players[index])).snapshot.table.pieces;
    /** Carries a whole piece to a table position, as a player drags it. */
    async function carry(index, pieceId, position) {
      const connection = players[index];
      const view = await syncView(connection);
      const carryId = `journey-carry-${++carries}`;
      connection.send({
        type: 'begin',
        carryId,
        sourcePieceId: pieceId,
        expectedVersion: view.snapshot.versions[pieceId],
        pickup: 'whole',
      });
      await connection.message('carry', (message) => message.carryId === carryId);
      const commandId = `journey-drop-${carries}`;
      const start = connection.messages.length;
      connection.send({ type: 'drop', commandId, carryId, position, orientation: 0 });
      const reply = await eventually(
        () =>
          connection.messages
            .slice(start)
            .find((message) => message.completedCommandId === commandId || message.requestId === commandId),
        'drop'
      );
      if (reply.type === 'rejected') {
        throw new Error(`The drop was rejected: ${reply.message}`);
      }
    }
    /** Splits pieces off a stack and returns the new piece. */
    async function split(index, pieceId, count) {
      const before = new Set((await pieces(index)).map((piece) => piece.id));
      await accepted(players[index], { kind: 'split', pieceId, count });
      return (await pieces(index)).find((piece) => !before.has(piece.id));
    }
    /** Splits `count` forces off the faction's reserve and carries them into the territory. */
    async function moveTroops(slug, count, territory) {
      const index = indexOf(slug);
      const reserve = (await pieces(index)).find(
        (piece) =>
          piece.kind === 'force' &&
          piece.stackKey?.startsWith(`troops:${slug}:`) &&
          !piece.id.startsWith('split-') &&
          piece.items.length > count
      );
      const moved = await split(index, reserve.id, count);
      await carry(index, moved.id, territoryPosition(territory));
      return index;
    }
    const hand = async (index) => (await syncView(players[index])).snapshot.hand ?? [];
    const deck = async (key) => (await pieces()).find((piece) => piece.stackKey === key && !piece.inventory);

    try {
      /* Drafting: the creator opens the table and five players sit down through the creator's approval. */
      players.push(await admitPlayer(peer, runtime, 'a'));
      await record(
        'Game created',
        `${PLAYERS[0]} created the game and holds seat 1 while the draft waits for players.`
      );
      for (const suffix of SUFFIXES.slice(1)) {
        const connection = await admitPlayer(peer, runtime, suffix);
        await seat(connection, players[0]);
        players.push(connection);
      }
      spectator = await admitPlayer(peer, runtime, 'watcher');
      await record(
        'Table full',
        'Six players are seated through the creator’s approval, and Klyzx watches as a spectator.'
      );

      for (const [index, faction] of factionFixtures.entries()) {
        await act(
          index,
          { kind: 'draft-pick', factionId: faction.slug },
          'Draft pick',
          `${PLAYERS[index]} picks ${faction.data.name} for the draft.`
        );
      }
      await act(
        0,
        { kind: 'draft-ban', factionId: 'ixians' },
        'Draft ban',
        `${PLAYERS[0]} bans Ixians from the draft.`
      );
      for (let index = 0; index < 5; index++) {
        await accepted(players[index], { kind: 'draft-ready', ready: true });
      }
      await record('Draft nearly ready', `Five seats are ready; ${PLAYERS[5]} has not confirmed yet.`, null, {
        kind: 'draft-ready',
        ready: true,
      });
      await accepted(players[5], { kind: 'draft-ready', ready: true });
      await eventually(async () => (await syncView(players[0])).snapshot.stage === 'swapping', 'the deal', 20_000);
      roster = (await syncView(players[0])).snapshot.roster;
      await record(
        'Factions dealt',
        `The deal assigned ${PLAYERS.map((_name, index) => who(index)).join(', ')}. Trading opens.`,
        'seat-6',
        { kind: 'draft-ready', ready: true }
      );

      /* Trading: every seat keeps what it was dealt. */
      for (const [index, connection] of players.entries()) {
        const view = await syncView(connection);
        if (view.snapshot.stage !== 'swapping') {
          break;
        }
        const action = {
          kind: 'swap-ready',
          ready: true,
          round: view.snapshot.swapping.round,
          seat: view.viewer.viewerSeat,
        };
        await accepted(connection, action);
        if (index === 2) {
          await record(
            'Trading',
            'Three seats keep what they were dealt; the others are still deciding.',
            'seat-3',
            action
          );
        }
      }
      await eventually(async () => (await syncView(players[0])).snapshot.stage === 'setup', 'setup', 20_000);
      roster = (await syncView(players[0])).snapshot.roster;
      await record('Setup begins', 'Trading closed. Setup opens on Traitor selection.', 'seat-6', {
        kind: 'swap-ready',
      });

      /* Traitor selection: gather the six decks, shuffle, deal four to every seat. */
      await act(
        0,
        { kind: 'traitors-gather' },
        'Traitors gathered',
        `${PLAYERS[0]} combines every Traitor deck into one pile.`
      );
      await act(
        0,
        { kind: 'deck-shuffle', pieceId: (await deck('cards:traitor')).id },
        'Traitors shuffled',
        `${PLAYERS[0]} shuffles the Traitor pile.`
      );
      for (let round = 0; round < 4; round++) {
        for (let index = 0; index < players.length; index++) {
          const pile = await deck('cards:traitor');
          await accepted(players[0], { kind: 'deck-draw', pieceId: pile.id, recipient: factionAt(index).id });
        }
        if (round === 0) {
          await record('Dealing Traitors', `${PLAYERS[0]} has dealt one Traitor to every seat.`, 'seat-1', {
            kind: 'deck-draw',
          });
        }
      }
      await record('Traitors dealt', 'Every seat holds four Traitors in hand.', 'seat-1', { kind: 'deck-draw' });
      /* Every faction but House Harkonnen keeps one Traitor and plays the other three back onto the pile. */
      const pileAt = (await deck('cards:traitor')).position;
      for (let index = 0; index < players.length; index++) {
        if (factionAt(index).id === 'house-harkonnen') {
          continue;
        }
        const dealt = (await hand(index)).filter((piece) => piece.stackKey === 'cards:traitor');
        for (const card of dealt.slice(1)) {
          await accepted(players[index], { kind: 'hand-play', pieceId: card.id, position: pileAt });
        }
        if (index === 0) {
          await record('Traitor kept', `${who(0)} keeps one Traitor and returns three to the pile.`, 'seat-1', {
            kind: 'hand-play',
          });
        }
      }
      await readyAll('Traitors kept', 'Every faction kept its Traitor, House Harkonnen all four, and confirmed Ready.');
      await next(0, 'Starting forces', 'The map is revealed and every faction places its starting forces.');

      /* Starting forces, following each faction's own setup text. */
      for (const [slug, count, territory] of [
        ['house-atreides', 10, 'arrakeen'],
        ['house-harkonnen', 10, 'carthag'],
        ['spacing-guild', 5, 'tueks'],
        ['fremen', 4, 'tabr'],
        ['fremen', 3, 'false-wall-south'],
        ['fremen', 3, 'false-wall-west'],
        ['bene-gesserit', 1, 'polar'],
      ]) {
        const index = await moveTroops(slug, count, territory);
        await record(
          'Starting forces',
          `${who(index)} places ${count} ${count === 1 ? 'force' : 'forces'} in ${territoryName(territory)}.`,
          `seat-${index + 1}`,
          { kind: 'drop' }
        );
      }
      await readyAll('Setup complete', 'Every faction has placed its forces and confirmed Ready.');
      await next(0, 'Turn 1: Storm', 'Setup ends and the first turn opens on the Storm phase.');

      /* Turn 1. */
      for (let sector = 0; sector < 3; sector++) {
        await accepted(players[0], { kind: 'storm', direction: 1 });
      }
      await record('Storm moved', `${PLAYERS[0]} moves the storm three sectors.`, 'seat-1', {
        kind: 'storm',
        direction: 1,
      });
      await next(0, 'Spice blow', 'The Spice blow phase opens.');
      const spiceDeck = await deck('deck:spice-deck');
      let before = new Set((await hand(0)).map((piece) => piece.id));
      await act(
        0,
        { kind: 'deck-draw', pieceId: spiceDeck.id },
        'Spice card drawn',
        `${PLAYERS[0]} draws the top Spice card into hand.`
      );
      const inHand = (await hand(0)).find((piece) => !before.has(piece.id));
      before = new Set((await pieces()).map((piece) => piece.id));
      const beside = [spiceDeck.position[0] - 1.2, 0.4, spiceDeck.position[2]];
      await act(
        0,
        { kind: 'hand-play', pieceId: inHand.id, position: beside },
        'Spice card played',
        `${PLAYERS[0]} plays the Spice card beside the deck.`
      );
      const drawn = (await pieces()).find((piece) => !before.has(piece.id));
      if (!drawn.items[0].faceUp) {
        await act(
          0,
          { kind: 'flip', pieceId: drawn.id },
          'Spice card revealed',
          `${PLAYERS[0]} turns the Spice card face up.`
        );
      }
      before = new Set((await pieces()).map((piece) => piece.id));
      await act(
        0,
        { kind: 'spice-spawn', count: 8 },
        'Spice from the supply',
        `${PLAYERS[0]} takes the 8 spice the card names from the supply.`
      );
      const blow = (await pieces()).find((piece) => !before.has(piece.id));
      await carry(0, blow.id, territoryPosition('broken-land'));
      await record('Spice placed', `${PLAYERS[0]} places 8 spice on Broken Land.`, 'seat-1', { kind: 'drop' });
      await next(0, 'CHOAM charity', 'The CHOAM charity phase opens.');
      await next(0, 'Bidding', 'The Bidding phase opens.');

      const buyers = ['house-atreides', 'emperor'].map(indexOf);
      for (const [order, index] of buyers.entries()) {
        const treachery = await deck('deck:treachery-deck');
        await act(
          0,
          { kind: 'deck-draw', pieceId: treachery.id, recipient: factionAt(index).id },
          'Card won',
          `${who(index)} wins the ${order === 0 ? 'first' : 'second'} Treachery card.`
        );
        await act(index, { kind: 'bank-withdraw', amount: 2 }, 'Bid paid', `${who(index)} pays 2 spice for it.`);
      }
      await next(0, 'Revival', 'The Revival phase opens.');
      await next(0, 'Shipment and movement', 'The Shipment and movement phase opens.');
      const invader = await moveTroops('house-harkonnen', 5, 'arrakeen');
      await record('Shipment', `${who(invader)} ships 5 forces into Arrakeen.`, `seat-${invader + 1}`, {
        kind: 'drop',
      });
      const guildIndex = await moveTroops('spacing-guild', 3, 'imperial-basin');
      await record('Shipment', `${who(guildIndex)} ships 3 forces to Imperial Basin.`, `seat-${guildIndex + 1}`, {
        kind: 'drop',
      });
      await next(0, 'Battle', 'The Battle phase opens: House Harkonnen and House Atreides share Arrakeen.');

      /* A battle in Arrakeen. */
      const defender = indexOf('house-atreides');
      const anchor = territoryPosition('arrakeen');
      const started = await accepted(players[invader], { kind: 'battle-start', anchor, territory: 'Arrakeen' });
      const battleId = started.snapshot.battle.id;
      await record('Battle started', `${who(invader)} opens a battle in Arrakeen.`, `seat-${invader + 1}`, {
        kind: 'battle-start',
      });
      await act(
        invader,
        { kind: 'battle-claim', battleId, side: 0 },
        'Battle side',
        `${who(invader)} takes the left side.`
      );
      await act(
        defender,
        { kind: 'battle-claim', battleId, side: 1 },
        'Battle side',
        `${who(defender)} takes the right side.`
      );
      /* These fixture troops carry no authored combat values, so each side fights with a leader and spice. */
      const plan = async (index, spice) => {
        const leader = (await hand(index)).find((piece) => piece.kind === 'force');
        return { mode: 'custom', troops: [], spice, adjustment: 0, leaderId: leader.id, cardIds: [] };
      };
      await act(
        invader,
        { kind: 'battle-plan', battleId, plan: await plan(invader, 3) },
        'Battle plan',
        `${who(invader)} dials a leader and 3 spice.`
      );
      await act(
        defender,
        { kind: 'battle-plan', battleId, plan: await plan(defender, 2) },
        'Battle plan',
        `${who(defender)} dials a leader and 2 spice.`
      );
      await act(
        invader,
        { kind: 'battle-ready', battleId, ready: true },
        'Battle ready',
        `${who(invader)} locks the plan.`
      );
      await act(
        defender,
        { kind: 'battle-ready', battleId, ready: true },
        'Battle countdown',
        `${who(defender)} locks the plan; the reveal counts down.`
      );
      await advanceClock(BATTLE_COUNTDOWN_MS + 1);
      await eventually(
        async () => (await syncView(players[invader])).snapshot.battle?.stage === 'revealed',
        'the reveal'
      );
      await record('Battle revealed', 'Both plans are revealed side by side.', null, null);
      await act(
        invader,
        { kind: 'battle-outcome', battleId, outcome: 'right' },
        'Battle outcome',
        `${who(invader)} agrees House Atreides won.`
      );
      await act(
        defender,
        { kind: 'battle-outcome', battleId, outcome: 'right' },
        'Battle resolved',
        `${who(defender)} agrees; the battle is settled.`
      );
      await next(0, 'Spice collection', 'The Spice collection phase opens.');
      await next(0, 'Mentat pause', 'The Mentat pause ends the turn.');

      /* The end: a declared winner. */
      await act(0, { kind: 'result-open' }, 'Determining the winner', `${PLAYERS[0]} opens the result.`);
      await act(
        0,
        { kind: 'result-declare', result: 'faction', factionIds: ['house-atreides'] },
        'Game finished',
        `${PLAYERS[0]} declares House Atreides the winner.`
      );

      expect((await syncView(players[0])).snapshot.stage).toBe('finished');
      const log = { game: await logPage(players[0], 'game'), audit: await logPage(players[0], 'audit') };
      const recording = { recordedWith: 'bun run play:record', ...interned(steps), log };
      await mkdir(dirname(OUTPUT), { recursive: true });
      await writeFile(OUTPUT, `${portable(JSON.stringify(recording))}\n`);
    } finally {
      await runtime.close();
      await peer.close();
    }
  });
});
