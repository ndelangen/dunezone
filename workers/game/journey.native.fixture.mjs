import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  syncView,
} from './native-runtime.fixture.mjs';

/*
 * The recorder behind `journey.record.native.test.mjs`: a real game on the native runtime, content from the Play story
 * fixtures, and the moves a player makes, each able to keep what every seat and the spectator see afterwards.
 */

const directory = dirname(fileURLToPath(import.meta.url));
/* The six public factions the Play page stories use; read from disk, since the Worker imports no application code. */
export const factionFixtures = JSON.parse(
  await readFile(join(directory, '../../src/app/routes/_app/play/product.stories.fixture/factions.json'), 'utf8')
);
const ORIGIN = 'http://table.test';
const LATEST = Number.MAX_SAFE_INTEGER;
/* Published paths the peer serves; the recording rewrites them to the Storybook fixture folders. */
const PRODUCT = '/published/story-product/';
const DREAMRULES = '/published/story-dreamrules/';
const fixture = (path) => path.replace('/play-fixtures/product/', PRODUCT);
export const SUFFIXES = ['a', 'b', 'c', 'd', 'e', 'f'];
/* The public profiles the other Play stories seat, in seat order (drafting.stories.fixture.ts). */
export const PLAYERS = ['Twaffle', 'Thialfi', 'Fectumbra', 'Erickenneth', 'Ridwan', 'Argelius'];
/* Only these two factions have Traitor fronts among the Storybook fixtures; the others deal without a face. */
const TRAITOR_FRONTS = new Set(['house-atreides', 'house-harkonnen']);
/* The stages the sandbox story runs the table in; drafting and trading stay with the recorded journey. */
const SANDBOX_STAGES = new Set(['setup', 'play']);

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
    ...factionFixtures.map((faction) => draftable(faction)),
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
      ? value.map((entry) => intern(entry))
      : Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, intern(entry)]));
    const text = JSON.stringify(shallow);
    if (text.length < 160) {
      return shallow;
    }
    const key = createHash('sha256').update(text).digest('base64url').slice(0, 12);
    pool[key] = shallow;
    return { $: key };
  };
  return {
    steps: steps.map((step) => ({
      ...step,
      views: intern(step.views),
      ...(step.stored ? { stored: intern(step.stored) } : {}),
    })),
    pool,
  };
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

/** One recording in progress: the runtime, the connected viewers, the clock the room reads, and the steps kept so far. */
export class JourneyRecorder {
  players = [];
  spectator = undefined;
  steps = [];
  roster = undefined;
  clock = 0;
  carries = 0;

  constructor(peer, runtime) {
    this.peer = peer;
    this.runtime = runtime;
  }

  static async open() {
    const { peer, runtime } = await journeyRuntime();
    return new JourneyRecorder(peer, runtime);
  }

  async close() {
    await this.runtime.close();
    await this.peer.close();
  }

  admit(suffix) {
    return admitPlayer(this.peer, this.runtime, suffix);
  }

  viewers() {
    return [...this.players, ...(this.spectator ? [this.spectator] : [])];
  }

  /** Seat index of the faction the deal assigned. */
  indexOf(slug) {
    return Number(this.roster.seats.find((entry) => entry.faction.id === slug).id.slice('seat-'.length)) - 1;
  }

  factionAt(index) {
    return this.roster.seats.find((entry) => entry.id === `seat-${index + 1}`).faction;
  }

  /** A player and the faction they play, as a step describes them. */
  who(index) {
    return `${PLAYERS[index]} (${this.factionAt(index).name})`;
  }

  async readRoster() {
    this.roster = (await syncView(this.players[0])).snapshot.roster;
  }

  async stage() {
    return (await syncView(this.players[0])).snapshot.stage;
  }

  async logPage(tab, before = LATEST) {
    const connection = this.players[0];
    const start = connection.messages.length;
    connection.send({ type: 'log-history', tab, before });
    return eventually(
      () => connection.messages.slice(start).find((message) => message.type === 'log-history' && message.tab === tab),
      `${tab} log page`
    );
  }

  /** The whole log of one tab, newest first, paged back until nothing older remains. */
  async fullLog(tab) {
    const entries = [];
    let page = await this.logPage(tab);
    entries.push(...page.entries);
    while (page.more) {
      page = await this.logPage(tab, entries.at(-1).sequence);
      entries.push(...page.entries);
    }
    return entries;
  }

  /** Keeps the current view of every viewer as one step. */
  async record(title, detail, actor = null, action = null) {
    const views = await Promise.all(this.viewers().map((connection) => syncView(connection)));
    const [latest] = (await this.logPage('game')).entries;
    /* From setup on, the step also keeps the room's stored state, so the sandbox story can run the table from it. */
    const [row] = await this.runtime.exec('SELECT data FROM current_state WHERE id=1');
    const stored = JSON.parse(row.data);
    this.steps.push({
      title,
      detail,
      actor,
      action,
      logSequence: latest?.sequence ?? 0,
      views: Object.fromEntries(views.map(({ type: _type, ...view }) => [view.viewer.viewerSeat, view])),
      ...(SANDBOX_STAGES.has(stored.stage) ? { stored } : {}),
    });
  }

  command(index, action) {
    return accepted(this.players[index], action);
  }

  /** One accepted command, kept as its own step. */
  async act(index, action, title, detail) {
    await this.command(index, action);
    await this.record(title, detail, `seat-${index + 1}`, action);
  }

  async advanceClock(ms) {
    this.clock += ms;
    await this.runtime.clock(this.clock);
  }

  /** Waits out the phase cooldown and moves to the next phase. */
  async next(index, title, detail) {
    await this.advanceClock(PHASE_CHANGE_COOLDOWN_MS + 1);
    await this.act(index, { kind: 'phase', direction: 1 }, title, detail);
  }

  async readyAll(title, detail) {
    for (let index = 0; index < this.players.length; index++) {
      await this.command(index, { kind: 'ready', ready: true });
    }
    await this.record(title, detail, null, { kind: 'ready', ready: true });
  }

  async pieces(index = 0) {
    return (await syncView(this.players[index])).snapshot.table.pieces;
  }

  async hand(index) {
    return (await syncView(this.players[index])).snapshot.hand ?? [];
  }

  async deck(stackKey) {
    return (await this.pieces()).find((piece) => piece.stackKey === stackKey && !piece.inventory);
  }

  /** Runs a move and returns the table piece it created. */
  async created(move, index = 0) {
    const before = new Set((await this.pieces(index)).map((piece) => piece.id));
    await move();
    return (await this.pieces(index)).find((piece) => !before.has(piece.id));
  }

  /** Carries a whole piece to a table position, as a player drags it. */
  async carry(index, pieceId, position) {
    const connection = this.players[index];
    const view = await syncView(connection);
    const carryId = `journey-carry-${++this.carries}`;
    connection.send({
      type: 'begin',
      carryId,
      sourcePieceId: pieceId,
      expectedVersion: view.snapshot.versions[pieceId],
      pickup: 'whole',
    });
    await connection.message('carry', (message) => message.carryId === carryId);
    const commandId = `journey-drop-${this.carries}`;
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

  /** Splits `count` troops off the faction's reserve and carries them into the territory; returns the seat index. */
  async moveTroops(slug, count, territory) {
    const index = this.indexOf(slug);
    const reserve = (await this.pieces(index)).find(
      (piece) =>
        piece.kind === 'force' &&
        piece.stackKey?.startsWith(`troops:${slug}:`) &&
        !piece.id.startsWith('split-') &&
        piece.items.length > count
    );
    const moved = await this.created(() => this.command(index, { kind: 'split', pieceId: reserve.id, count }), index);
    await this.carry(index, moved.id, territoryPosition(territory));
    return index;
  }

  /** Writes the recording with the game and audit logs as they ended. */
  async write(path) {
    const log = { game: await this.fullLog('game'), audit: await this.fullLog('audit') };
    const recording = { recordedWith: 'bun run play:record', ...interned(this.steps), log };
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${portable(JSON.stringify(recording))}\n`);
  }
}

export const territoryName = (key) => board.geometry.parts.find((part) => part.key === key).label;

/** The centre of a board territory's outline, raised to where a carried piece is dropped. */
export function territoryPosition(key) {
  const area = board.geometry.parts.find((part) => part.key === key);
  return [(area.x + area.width / 2 - 0.5) * BOARD_RADIUS * 2, 0.4, (area.y + area.height / 2 - 0.5) * BOARD_RADIUS * 2];
}
