import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { HistoricalFactionPublicationObject, HeroKeyedHistoricalFactionObject } from '../../src/shared/factions/schema';
import { factionDefinitionSchema } from '../../src/shared/play/capture';
import type { DraftFaction } from '../../src/shared/play/drafting';
import { arrakisBoardCapture } from '../../src/shared/play/fixtures/board';
import type { LogTab, LogEntry } from '../../src/shared/play/log';
import type { Vector3Tuple } from '../../src/shared/play/model';
import { PHASE_CHANGE_COOLDOWN_MS } from '../../src/shared/play/phases';
import type { ServerMessage } from '../../src/shared/play/protocol';
import type { PieceAction, GameSnapshot, ClientMessage } from '../../src/shared/play/protocol';
import { BOARD_RADIUS } from '../../src/shared/play/tableGeometry';
import board from '../../src/shared/rulebooks/boards/arrakis.json';
import { cardPage, deckPage, slot, spiceCardPage } from './native-catalogue.fixture.ts';
import type { NativePeer, NativeRuntime, NativeConnection, NativeView } from './native-runtime.fixture.ts';
import { required } from './native-runtime.fixture.ts';
import {
  accepted,
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  provision,
  syncView,
} from './native-runtime.fixture.ts';
import { storedSnapshotSchema } from './state';
import type { StoredSnapshot } from './state';

/*
 * The recorder behind `journey.record.native.test.ts`: a real game on the native runtime, content from the Play story
 * fixtures, and the moves a player makes, each able to keep what every seat and the spectator see afterwards.
 */

const directory = dirname(fileURLToPath(import.meta.url));
/* The six public factions the Play page stories use; read from disk, since the Worker imports no application code. */
const factionFixtureSchema = z.object({
  slug: z.string(),
  data: z.union([HeroKeyedHistoricalFactionObject, HistoricalFactionPublicationObject]),
  token: z.string(),
  leaders: factionDefinitionSchema.shape.leaders,
});
type FactionFixture = z.infer<typeof factionFixtureSchema>;
const factionFixtures = z
  .array(factionFixtureSchema)
  .parse(
    JSON.parse(
      await readFile(join(directory, '../../src/app/routes/_app/play/product.stories.fixture/factions.json'), 'utf8')
    )
  );
const ORIGIN = 'http://table.test';
const LATEST = Number.MAX_SAFE_INTEGER;
/* Published paths the peer serves; the recording rewrites them to the Storybook fixture folders. */
const PRODUCT = '/published/story-product/';
const DREAMRULES = '/published/story-dreamrules/';
const fixture = (path: string) => path.replace('/play-fixtures/product/', PRODUCT);
export const SUFFIXES = ['a', 'b', 'c', 'd', 'e', 'f'];
/* The public profiles the other Play stories seat, in seat order (drafting.stories.fixture.ts). */
export const PLAYERS = ['Twaffle', 'Thialfi', 'Fectumbra', 'Erickenneth', 'Ridwan', 'Argelius'];
/* The stages the sandbox story runs the table in; drafting and trading stay with the recorded journey. */
const SANDBOX_STAGES = new Set(['setup', 'play']);

function definition({ slug, data, token, leaders }: FactionFixture): z.infer<typeof factionDefinitionSchema> {
  return factionDefinitionSchema.parse({
    faction: { id: slug, slug, name: data.name },
    data,
    token: fixture(token),
    tokenBack: `${PRODUCT}${slug}-token-back.jpg`,
    cardbacks: {
      traitor: `${PRODUCT}traitor-back.jpg`,
      alliance: `${PRODUCT}alliance-back.jpg`,
      prediction: `${PRODUCT}prediction-back.jpg`,
    },
    leaders: leaders.map((leader) => ({
      memberId: leader.memberId,
      front: leader.front === null ? null : fixture(leader.front),
    })),
    troops: data.troops.map((troop, index) => ({
      troopId: troop.troopId,
      front: `${PRODUCT}${slug}-troop-${index}.jpg`,
      back: troop.back ? `${PRODUCT}${slug}-troop-${index}-back.jpg` : null,
    })),
    traitors: data.leaders.map((leader, index) => ({
      memberId: leader.memberId,
      front: `${PRODUCT}${slug}-traitor-${index}.jpg`,
    })),
    alliance: `${PRODUCT}${slug}-alliance.jpg`,
    prediction: `${PRODUCT}prediction.jpg`,
  });
}

function draftable({ slug, data }: FactionFixture): DraftFaction {
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
  ] as const) {
    page.asset.name = name;
    page.back = `${DREAMRULES}cardback.jpg`;
  }
  for (const page of [snooper, spiceCard, treachery, spice]) {
    peer.catalogue.set(`${page.asset.type}/${page.asset.slug}`, page);
  }
  peer.rulesets.set('dreamrules', {
    board: arrakisBoardCapture,
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
function interned(steps: JourneyStep[]) {
  const pool: Record<string, z.infer<ReturnType<typeof z.json>>> = {};
  const intern = (value: z.infer<ReturnType<typeof z.json>>): z.infer<ReturnType<typeof z.json>> => {
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
      views: intern(z.json().parse(step.views)),
      ...(step.stored ? { stored: intern(z.json().parse(step.stored)) } : {}),
    })),
    pool,
  };
}

/** The recording as text: fixture origins for the published paths, and the story profiles for the synthetic accounts. */
function portable(text: string) {
  return renamed(
    text
      .replaceAll(`${ORIGIN}${PRODUCT}`, '{{origin}}/play-fixtures/product/')
      .replaceAll(`${ORIGIN}${DREAMRULES}`, '{{origin}}/play-fixtures/dreamrules/')
  );
}

/** A recording's text with the synthetic accounts renamed to the public profiles the Play stories seat. */
export function renamed(text: string) {
  let result = text;
  for (const [index, suffix] of SUFFIXES.entries()) {
    result = result
      .replaceAll(`Synthetic ${suffix.toUpperCase()}`, PLAYERS[index])
      .replaceAll(`synthetic-${suffix}`, PLAYERS[index].toLowerCase());
  }
  return result.replaceAll('Synthetic WATCHER', 'Klyzx').replaceAll('synthetic-watcher', 'klyzx');
}

/** One recording in progress: the runtime, the connected viewers, the clock the room reads, and the steps kept so far. */
type ActionLabel<Action extends { kind: string }> = Action extends PieceAction
  ? Pick<Action, 'kind'> & Partial<Omit<Action, 'kind'>>
  : never;
type RecordedAction = ActionLabel<PieceAction> | { kind: ClientMessage['type'] };
type JourneyStep = {
  title: string;
  detail: string;
  actor: string | null;
  action: RecordedAction | null;
  logSequence: number;
  views: Record<string, Omit<NativeView, 'type'>>;
  stored?: StoredSnapshot;
};

/** The factions a recording drafts, one per seat in seat order, and the one it bans; ids are what the game knows them by. */
export type JourneyCast = Readonly<{
  factions: readonly Readonly<{ id: string; slug: string; name: string }>[];
  ban: Readonly<{ id: string; name: string }>;
}>;

/* The story fixtures know each faction by its slug. */
const FIXTURE_CAST: JourneyCast = {
  factions: factionFixtures.map(({ slug, data }) => ({ id: slug, slug, name: data.name })),
  ban: { id: 'ixians', name: 'Ixians' },
};

export class JourneyRecorder {
  players: NativeConnection[] = [];
  spectator: NativeConnection | undefined;
  steps: JourneyStep[] = [];
  roster: GameSnapshot['roster'];
  clock = 0;
  carries = 0;

  constructor(
    readonly peer: NativePeer,
    readonly runtime: NativeRuntime,
    readonly cast: JourneyCast = FIXTURE_CAST
  ) {}

  /** The id the game knows a faction by, from its slug. */
  id(slug: string) {
    return required(this.cast.factions.find((faction) => faction.slug === slug)).id;
  }

  static async open() {
    const { peer, runtime } = await journeyRuntime();
    return new JourneyRecorder(peer, runtime);
  }

  async close() {
    await this.runtime.close();
    await this.peer.close();
  }

  admit(suffix: string) {
    return admitPlayer(this.runtime, suffix);
  }

  viewers() {
    return [...this.players, ...(this.spectator ? [this.spectator] : [])];
  }

  /** Seat index of the faction the deal assigned, by the id the game knows it by. */
  indexOf(id: string) {
    return (
      Number(
        required(required(this.roster).seats.find((entry) => required(entry.faction).id === id)).id.slice(
          'seat-'.length
        )
      ) - 1
    );
  }

  factionAt(index: number) {
    return required(required(this.roster).seats.find((entry) => entry.id === `seat-${index + 1}`)).faction;
  }

  /** A player and the faction they play, as a step describes them. */
  who(index: number) {
    return `${PLAYERS[index]} (${required(this.factionAt(index)).name})`;
  }

  async readRoster() {
    this.roster = (await syncView(this.players[0])).snapshot.roster;
  }

  async stage() {
    return (await syncView(this.players[0])).snapshot.stage;
  }

  async logPage(tab: LogTab, before = LATEST) {
    const connection = this.players[0];
    const start = connection.messages.length;
    connection.send({ type: 'log-history', tab, before });
    return eventually(
      () =>
        connection.messages
          .slice(start)
          .find(
            (message): message is Extract<ServerMessage, { type: 'log-history' }> =>
              message.type === 'log-history' && message.tab === tab
          ),
      `${tab} log page`
    );
  }

  /** The whole log of one tab, newest first, paged back until nothing older remains. */
  async fullLog(tab: LogTab) {
    const entries: LogEntry[] = [];
    let page = await this.logPage(tab);
    entries.push(...page.entries);
    while (page.more) {
      page = await this.logPage(tab, required(entries.at(-1)).sequence);
      entries.push(...page.entries);
    }
    return entries;
  }

  /** Keeps the current view of every viewer as one step. */
  async record(title: string, detail: string, actor: string | null = null, action: RecordedAction | null = null) {
    const views = await Promise.all(this.viewers().map((connection) => syncView(connection)));
    const [latest] = (await this.logPage('game')).entries;
    /* From setup on, the step also keeps the room's stored state, so the sandbox story can run the table from it. */
    const [row] = await this.runtime.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1');
    const stored = storedSnapshotSchema.parse(JSON.parse(row.data));
    this.steps.push({
      title,
      detail,
      actor,
      action,
      logSequence: latest?.sequence ?? 0,
      views: Object.fromEntries(views.map(({ type: _type, ...view }) => [view.viewer.viewerSeat, view])),
      ...(stored.stage !== undefined && SANDBOX_STAGES.has(stored.stage) ? { stored } : {}),
    });
  }

  command(index: number, action: PieceAction) {
    return accepted(this.players[index], action);
  }

  /** One accepted command, kept as its own step. */
  async act(index: number, action: PieceAction, title: string, detail: string) {
    await this.command(index, action);
    await this.record(title, detail, `seat-${index + 1}`, action);
  }

  async advanceClock(ms: number) {
    this.clock += ms;
    await this.runtime.clock(this.clock);
  }

  /** Waits out the phase cooldown and moves to the next phase. */
  async next(index: number, title: string, detail: string) {
    await this.advanceClock(PHASE_CHANGE_COOLDOWN_MS + 1);
    await this.act(index, { kind: 'phase', direction: 1 }, title, detail);
  }

  async readyAll(title: string, detail: string) {
    for (let index = 0; index < this.players.length; index++) {
      await this.command(index, { kind: 'ready', ready: true });
    }
    await this.record(title, detail, null, { kind: 'ready', ready: true });
  }

  async pieces(index = 0) {
    return (await syncView(this.players[index])).snapshot.table.pieces;
  }

  async hand(index: number) {
    return (await syncView(this.players[index])).snapshot.hand ?? [];
  }

  async deck(stackKey: string) {
    return (await this.pieces()).find((piece) => piece.stackKey === stackKey && !piece.inventory);
  }

  /** Runs a move and returns the table piece it created. */
  async created(move: () => Promise<unknown>, index = 0) {
    const before = new Set((await this.pieces(index)).map((piece) => piece.id));
    await move();
    return (await this.pieces(index)).find((piece) => !before.has(piece.id));
  }

  /** Carries a whole piece to a table position, as a player drags it. */
  async carry(index: number, pieceId: string, position: Vector3Tuple) {
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
          .find(
            (message) =>
              ('completedCommandId' in message && message.completedCommandId === commandId) ||
              ('requestId' in message && message.requestId === commandId)
          ),
      'drop'
    );
    if (reply.type === 'rejected') {
      throw new Error(`The drop was rejected: ${reply.message}`);
    }
  }

  /** Splits `count` troops off the faction's reserve and carries them into the territory; returns the seat index. */
  async moveTroops(slug: string, count: number, territory: string) {
    const id = this.id(slug);
    const index = this.indexOf(id);
    const reserve = (await this.pieces(index)).find(
      (piece) =>
        piece.kind === 'force' &&
        piece.stackKey?.startsWith(`troops:${id}:`) &&
        !piece.id.startsWith('split-') &&
        piece.items.length > count
    );
    const moved = await this.created(
      () => this.command(index, { kind: 'split', pieceId: required(reserve).id, count }),
      index
    );
    await this.carry(index, required(moved).id, territoryPosition(territory));
    return index;
  }

  /** Writes the recording with the game and audit logs as they ended. */
  async write(path: string) {
    const log = { game: await this.fullLog('game'), audit: await this.fullLog('audit') };
    const recording = { recordedWith: 'bun run play:record', ...interned(this.steps), log };
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${portable(JSON.stringify(recording))}\n`);
  }
}

export const territoryName = (key: string) => required(board.geometry.parts.find((part) => part.key === key)).label;

/** The centre of a board territory's outline, raised to where a carried piece is dropped. */
export function territoryPosition(key: string): Vector3Tuple {
  const area = board.geometry.parts.find((part) => part.key === key);
  return [
    (required(area).x + required(area).width / 2 - 0.5) * BOARD_RADIUS * 2,
    0.4,
    (required(area).y + required(area).height / 2 - 0.5) * BOARD_RADIUS * 2,
  ];
}
