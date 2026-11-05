/*
 * Turns the bot's view into text a language model can read: the phase, the board by territory, its hand, its spice,
 * and what the table is doing. It names only what the seat's own view carries.
 */
import { retainedArrakisBoard } from '../../src/shared/boards/geometry';
import type { Board } from '../../src/shared/boards/geometry';
import { isFactionToken } from '../../src/shared/play/factionToken';
import type { TablePiece } from '../../src/shared/play/model';
import { TABLE_PHASES } from '../../src/shared/play/phases';
import { setupStep } from '../../src/shared/play/setup';
import { isInTanks } from '../../src/shared/play/tanksShelf';
import { innermostPoint, tableTerritories, territoryShapeAt } from '../../src/shared/play/territoryFit';
import type { TableTerritory } from '../../src/shared/play/territoryFit';
import type { BotView } from './view';

export type NamedTerritory = TableTerritory & { label: string };

const boards = new WeakMap<object, NamedTerritory[]>();

export function boardOf(view: BotView): Board {
  return (view.snapshot?.board?.definition as Board | undefined) ?? retainedArrakisBoard();
}

/** Every territory with a label unique on this board: a name shared by several sectors gets its sector's number. */
export function namedTerritories(board: Board): NamedTerritory[] {
  let named = boards.get(board);
  if (!named) {
    const territories = tableTerritories(board);
    const totals = new Map<string, number>();
    for (const territory of territories) {
      totals.set(territory.name, (totals.get(territory.name) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    named = territories.map((territory) => {
      const index = (seen.get(territory.name) ?? 0) + 1;
      seen.set(territory.name, index);
      return {
        ...territory,
        label: (totals.get(territory.name) ?? 1) > 1 ? `${territory.name} #${index}` : territory.name,
      };
    });
    boards.set(board, named);
  }
  return named;
}

export function territoryOf(board: Board, piece: Pick<TablePiece, 'position'>): NamedTerritory | undefined {
  const shape = territoryShapeAt(board, [piece.position[0], piece.position[2]]);
  return shape ? namedTerritories(board).find((entry) => entry.rings === shape.rings) : undefined;
}

/** Finds a territory by the label the bot was shown, forgiving case and a missing sector number. */
export function findTerritory(board: Board, label: string): NamedTerritory | undefined {
  const wanted = label.trim().toLowerCase();
  const all = namedTerritories(board);
  return (
    all.find((entry) => entry.label.toLowerCase() === wanted) ??
    all.find((entry) => entry.name.toLowerCase() === wanted) ??
    all.find((entry) => entry.label.toLowerCase().startsWith(wanted)) ??
    /* A fuller name than the board prints, such as "Sietch Tabr" for "Tabr": the longest board name inside it. */
    [...all]
      .sort((a, b) => b.name.length - a.name.length)
      .find((entry) => new RegExp(`\\b${entry.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\b`, 'u').test(wanted))
  );
}

export function dropPoint(territory: TableTerritory): [number, number, number] {
  const [x, z] = innermostPoint(territory, 0.05);
  return [x, 0.38, z];
}

export function phaseOf(view: BotView) {
  const snapshot = view.snapshot;
  if (!snapshot) {
    return { label: 'unknown', instructions: '' };
  }
  const composed = snapshot.phases?.[snapshot.phase];
  const standard = TABLE_PHASES[snapshot.phase];
  return {
    label: composed?.label ?? standard?.label ?? `phase ${snapshot.phase}`,
    instructions: composed?.instructions ?? standard?.instructions ?? '',
  };
}

function itemFace(piece: TablePiece) {
  const top = piece.items.at(-1);
  const artwork = top?.artwork;
  return artwork && 'name' in artwork && artwork.name ? String(artwork.name) : undefined;
}

function pieceLine(view: BotView, piece: TablePiece) {
  const owner = piece.owner === 'shared' ? 'shared' : view.factionName(piece.owner);
  const face = itemFace(piece);
  const faceText = face && face !== piece.label ? ` (${face})` : '';
  const hidden = piece.items.at(-1)?.faceUp === false ? ', face down' : '';
  return `- [${piece.id}] ${owner}: ${piece.items.length} × ${piece.label}${faceText}${hidden}`;
}

export type DescribeOptions = {
  /** The newest table event the bot has already seen; only events after it are listed. */
  since?: string | null;
};

/**
 * The bot's view of the table in words. It is kept compact for each wake: your own holdings in full, the board by
 * territory, everyone else's off-board pieces as counts, and only the table log the bot has not seen yet.
 */
export function describeView(view: BotView, options: DescribeOptions = {}): string {
  const snapshot = view.snapshot;
  const me = view.factionId;
  if (!snapshot) {
    return 'There is no game view yet.';
  }
  if (!me) {
    return `You have no faction yet.\n${describeStage(view)}`;
  }
  const board = boardOf(view);
  const phase = phaseOf(view);
  const lines: string[] = [];
  lines.push(`You play ${view.factionName(me)} (faction id "${me}").`);
  lines.push(describeStage(view, phase));
  if (snapshot.stage === 'play') {
    lines.push(`Storm is in sector ${snapshot.table.stormSectorIndex}.`);
  }
  if (snapshot.lastTurn) {
    lines.push(`Last turn: ${JSON.stringify(snapshot.lastTurn)}`);
  }
  lines.push(
    `Seated factions: ${view
      .seatedFactions()
      .map((id) => `${view.factionName(id)} ("${id}")`)
      .join(', ')}.`
  );
  const ready = snapshot.controls?.ready ?? [];
  lines.push(`Seats marked ready this phase: ${ready.length ? ready.join(', ') : 'none'}. You sit at ${view.current?.viewer.viewerSeat}.`);
  if (snapshot.bank) {
    lines.push(`Your spice reserve: ${snapshot.bank.balance} spice.`);
  }
  if (snapshot.handCounts) {
    lines.push(
      `Treachery cards held: ${Object.entries(snapshot.handCounts)
        .map(([id, n]) => `${view.factionName(id)} ${n}`)
        .join(', ')}.`
    );
  }

  lines.push('', describeAssets(view));

  const byTerritory = new Map<string, TablePiece[]>();
  const offBoard: TablePiece[] = [];
  for (const piece of snapshot.table.pieces) {
    if (piece.kind === 'card' && piece.owner === 'shared' && piece.stackKey?.startsWith('deck:')) {
      offBoard.push(piece);
      continue;
    }
    const territory = piece.inventory || piece.hiddenZone ? undefined : territoryOf(board, piece);
    if (territory) {
      byTerritory.set(territory.label, [...(byTerritory.get(territory.label) ?? []), piece]);
    } else {
      offBoard.push(piece);
    }
  }
  lines.push('', 'On the board, by territory:');
  if (byTerritory.size === 0) {
    lines.push('- nothing on the board yet');
  }
  for (const [label, pieces] of [...byTerritory].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`${label}:`);
    for (const piece of pieces) {
      lines.push(`  ${pieceLine(view, piece)}`);
    }
  }
  /* Your own off-board pieces are listed under "What you hold"; the rest is summed per owner, decks keep their ids. */
  const shared = offBoard.filter((piece) => piece.owner === 'shared' || piece.inventory);
  const theirs = new Map<string, Map<string, number>>();
  for (const piece of offBoard) {
    if (shared.includes(piece) || piece.owner === me || isFactionToken(piece)) {
      continue;
    }
    const counts = theirs.get(piece.owner) ?? new Map<string, number>();
    counts.set(piece.label, (counts.get(piece.label) ?? 0) + piece.items.length);
    theirs.set(piece.owner, counts);
  }
  lines.push('', 'Off the board:');
  for (const piece of shared) {
    lines.push(pieceLine(view, piece));
  }
  for (const [owner, counts] of theirs) {
    lines.push(
      `- ${view.factionName(owner)}: ${[...counts].map(([label, count]) => `${count} × ${label}`).join(', ')}`
    );
  }

  if (snapshot.bidding && snapshot.bidding.stage !== 'idle') {
    lines.push('', `Bidding: ${JSON.stringify(snapshot.bidding)}`);
  }
  if (snapshot.battle) {
    lines.push('', `Battle: ${JSON.stringify(snapshot.battle)}`);
  }
  if (snapshot.battlePlan) {
    lines.push(`Your battle plan: ${JSON.stringify(snapshot.battlePlan)}`);
  }
  if (snapshot.alliances) {
    lines.push('', `Alliances: ${JSON.stringify(snapshot.alliances)}`);
  }
  if (snapshot.movement) {
    lines.push('', `Shipment and Movement progress: ${JSON.stringify(snapshot.movement)}`);
  }

  const all = snapshot.table.events;
  const seen = options.since ? all.findIndex((event) => event.id === options.since) : -1;
  const events = (seen >= 0 ? all.slice(0, seen) : all).slice(0, 12);
  if (events.length) {
    lines.push('', `${options.since ? 'Table log since you last looked' : 'Recent table log'} (newest first):`);
    for (const event of events) {
      lines.push(`- ${event.message}`);
    }
  } else if (options.since) {
    lines.push('', 'Nothing new in the table log since you last looked.');
  }
  return lines.join('\n');
}

/** The table's stage, in words: what the draft, trading or setup step needs, or the turn's phase. */
export function describeStage(view: BotView, phase = phaseOf(view)): string {
  const snapshot = view.snapshot!;
  const seat = view.current?.viewer.viewerSeat ?? '';
  const name = (id: string) => snapshot.draft?.factions.find((faction) => faction.id === id)?.name ?? view.factionName(id);
  switch (snapshot.stage) {
    case 'drafting': {
      const draft = snapshot.draft;
      if (!draft) {
        return 'Stage: drafting. The draft has not opened yet.';
      }
      const banned = new Set(Object.values(draft.bans).flat());
      const offered = draft.factions.filter((faction) => faction.linked && faction.published && !banned.has(faction.id));
      return [
        'Stage: drafting. Each player picks the factions they would like and confirms Ready; once every seat is ready, the game deals each seat one faction at random from the picks (use the `draft` tool).',
        `Factions on offer: ${offered.map((faction) => faction.name).join(', ') || 'none'}.`,
        `Your picks: ${(draft.picks[seat] ?? []).map(name).join(', ') || 'none'}. Your bans: ${(draft.bans[seat] ?? []).map(name).join(', ') || 'none'}.`,
        `Seats ready: ${draft.ready.join(', ') || 'none'} (you sit at ${seat}). Needs ${draft.minimum} players.`,
        draft.failure ? `The last deal failed: ${draft.failure}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }
    case 'swapping': {
      const swapping = snapshot.swapping;
      return [
        'Stage: trading. Factions are dealt. Players may offer to swap factions; when you are happy with yours, use `keep_dealt_faction`.',
        swapping ? `Seats that kept theirs: ${swapping.ready.join(', ') || 'none'}.` : '',
        swapping?.offers.length ? `Open offers: ${JSON.stringify(swapping.offers)}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }
    case 'setup': {
      const setup = snapshot.setup;
      const step = setup ? setupStep(setup) : undefined;
      if (!setup || !step) {
        return 'Stage: setup.';
      }
      const own = step.factionId ? ` (${view.factionName(step.factionId)}'s step)` : '';
      const ready = snapshot.controls?.ready ?? [];
      return [
        `Stage: setup, step ${setup.index + 1} of ${setup.steps.length}: ${step.title}${own}. ${step.instructions}`,
        `Later steps: ${setup.steps
          .slice(setup.index + 1)
          .map((entry) => entry.title)
          .join(', ') || 'none; Turn 1 follows'}.`,
        `Seats ready for this step: ${ready.join(', ') || 'none'} (you sit at ${seat}).`,
        'Your faction\'s own setup text is under "startText" in your faction sheet.',
      ].join('\n');
    }
    default:
      return `Stage: ${snapshot.stage ?? 'play'}. Phase ${snapshot.phase + 1}: ${phase.label}. ${phase.instructions}`.trim();
  }
}

function itemNames(piece: TablePiece) {
  return piece.items.map((item) => {
    const artwork = item.artwork;
    return artwork && 'name' in artwork && artwork.name ? String(artwork.name) : piece.label;
  });
}

function itemType(piece: TablePiece) {
  const artwork = piece.items[0]?.artwork;
  return artwork && 'type' in artwork && artwork.type ? String(artwork.type) : '';
}

/** Where a piece lies, in words: a territory, the Tanks, or off the board. */
function placeOf(view: BotView, piece: TablePiece) {
  if (piece.inventory) {
    return 'the shared inventory';
  }
  if (piece.hiddenZone) {
    return 'your hidden zone';
  }
  if (isInTanks(piece.position)) {
    return 'the Tleilaxu Tanks';
  }
  return territoryOf(boardOf(view), piece)?.label ?? 'off the board';
}

const HAND_GROUPS: [string, (piece: TablePiece) => boolean][] = [
  ['Traitor cards', (piece) => piece.stackKey === 'cards:traitor' || itemType(piece) === 'card-traitor'],
  ['Treachery cards', (piece) => itemType(piece) === 'card-treachery'],
  ['Spice cards', (piece) => itemType(piece) === 'card-spice'],
  ['Alliance card', (piece) => itemType(piece) === 'card-alliance'],
  ['Leaders in hand', (piece) => piece.stackKey?.startsWith('leader:') ?? false],
];

/**
 * Everything the bot's faction holds, so it can account for every asset: its spice reserve, each card in hand by kind,
 * each leader and where it is, and each troop kind split by where it lies. Ids in square brackets are what tools take.
 */
export function describeAssets(view: BotView): string {
  const snapshot = view.snapshot!;
  const me = view.factionId!;
  const lines = ['What you hold (only you see this):'];
  lines.push(`- Spice reserve: ${snapshot.bank?.balance ?? 0} spice.`);
  const hand = snapshot.hand ?? [];
  const grouped = new Set<TablePiece>();
  for (const [title, test] of HAND_GROUPS) {
    const pieces = hand.filter((piece) => !grouped.has(piece) && test(piece));
    pieces.forEach((piece) => grouped.add(piece));
    const names = pieces.flatMap((piece) => itemNames(piece).map((name) => `${name} [${piece.id}]`));
    lines.push(`- ${title}: ${names.length ? names.join(', ') : 'none'}.`);
  }
  const rest = hand.filter((piece) => !grouped.has(piece));
  if (rest.length) {
    lines.push(`- Other pieces in hand: ${rest.map((piece) => `${itemNames(piece).join(' + ')} [${piece.id}]`).join(', ')}.`);
  }
  const table = snapshot.table.pieces.filter((piece) => piece.owner === me);
  const leaders = table.filter((piece) => piece.stackKey?.startsWith('leader:'));
  if (leaders.length) {
    lines.push(
      `- Leaders on the table: ${leaders.map((piece) => `${piece.label} in ${placeOf(view, piece)} [${piece.id}]`).join(', ')}.`
    );
  }
  const troopKinds = new Map<string, TablePiece[]>();
  for (const piece of table.filter((entry) => entry.stackKey?.startsWith('troops:'))) {
    troopKinds.set(piece.label, [...(troopKinds.get(piece.label) ?? []), piece]);
  }
  for (const [label, stacks] of troopKinds) {
    const total = stacks.reduce((sum, piece) => sum + piece.items.length, 0);
    const where = stacks.map((piece) => `${piece.items.length} in ${placeOf(view, piece)} [${piece.id}]`);
    lines.push(`- ${label}: ${total} in all: ${where.join(', ')}. "Off the board" is your reserve.`);
  }
  const others = table.filter(
    (piece) => !leaders.includes(piece) && !piece.stackKey?.startsWith('troops:') && !isFactionToken(piece)
  );
  if (others.length) {
    lines.push(`- Your other pieces: ${others.map((piece) => `${piece.label} in ${placeOf(view, piece)} [${piece.id}]`).join(', ')}.`);
  }
  const tanked = table.filter((piece) => !piece.inventory && isInTanks(piece.position));
  lines.push(
    `- In the Tleilaxu Tanks: ${tanked.length ? tanked.map((piece) => `${piece.items.length} × ${piece.label}`).join(', ') : 'nothing of yours'}.`
  );
  const techTokens = snapshot.techTokens?.[me];
  if (techTokens?.length) {
    lines.push(`- Tech tokens: ${JSON.stringify(techTokens)}.`);
  }
  return lines.join('\n');
}

export function describeChat(view: BotView, limit = 20): string {
  const lines = view.chat.slice(-limit).map(({ peerId, message }) => {
    return `[${view.peerLabel(peerId)}] ${view.factionName(message.senderFactionId)} (${message.author}): ${message.text}`;
  });
  return lines.length ? lines.join('\n') : 'No chat yet.';
}

export function describeFaction(view: BotView, factionId: string): string {
  const sheet = view.factions.get(factionId);
  if (!sheet) {
    return `No faction sheet for ${view.factionName(factionId)}.`;
  }
  const rules = (sheet as { rules?: Record<string, unknown> }).rules;
  const leaders = (sheet as { leaders?: { name: string; strength: string }[] }).leaders ?? [];
  return [
    `${view.factionName(factionId)} faction sheet:`,
    leaders.length ? `Leaders: ${leaders.map((leader) => `${leader.name} (${leader.strength})`).join(', ')}` : '',
    ...Object.entries(rules ?? {}).map(([key, value]) => `- ${key}: ${ruleText(value)}`),
  ]
    .filter(Boolean)
    .join('\n');
}

/** A rule's value as plain lines: text as it is, titled entries as "Title: text", anything else as compact JSON. */
function ruleText(value: unknown): string {
  const plain = (text: string) => text.replaceAll(/\s+/gu, ' ').trim();
  if (typeof value === 'string') {
    return plain(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => `\n  - ${ruleText(entry)}`).join('');
  }
  if (value && typeof value === 'object') {
    const { title, text, ...rest } = value as { title?: unknown; text?: unknown };
    if (typeof text === 'string') {
      const extra = Object.entries(rest)
        .map(([key, entry]) => ` (${key}: ${typeof entry === 'string' ? plain(entry) : JSON.stringify(entry)})`)
        .join('');
      return `${typeof title === 'string' && title.trim() ? `${plain(title)}: ` : ''}${plain(text)}${extra}`;
    }
  }
  return JSON.stringify(value);
}
