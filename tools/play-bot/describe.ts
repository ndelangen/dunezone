/*
 * Turns the bot's view into text a language model can read: the phase, the board by territory, its hand, its spice,
 * and what the table is doing. It names only what the seat's own view carries.
 */
import { retainedArrakisBoard } from '../../src/shared/boards/geometry';
import type { Board } from '../../src/shared/boards/geometry';
import { isFactionToken } from '../../src/shared/play/factionToken';
import type { TablePiece } from '../../src/shared/play/model';
import { TABLE_PHASES } from '../../src/shared/play/phases';
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
    all.find((entry) => entry.label.toLowerCase().startsWith(wanted))
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

export function describeView(view: BotView): string {
  const snapshot = view.snapshot;
  const me = view.factionId;
  if (!snapshot || !me) {
    return 'The bot is not seated with a faction yet.';
  }
  const board = boardOf(view);
  const phase = phaseOf(view);
  const lines: string[] = [];
  lines.push(`You play ${view.factionName(me)} (faction id "${me}").`);
  lines.push(
    `Stage: ${snapshot.stage ?? 'play'}. Phase ${snapshot.phase + 1}: ${phase.label}. ${phase.instructions}`.trim()
  );
  lines.push(`Storm is in sector ${snapshot.table.stormSectorIndex}.`);
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

  const hand = snapshot.hand ?? [];
  lines.push('', `Your hand (private, ${hand.length} pieces):`);
  for (const piece of hand) {
    lines.push(pieceLine(view, piece));
  }

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
  lines.push('', 'Off the board (reserves, tokens, decks, discards):');
  for (const piece of offBoard) {
    const note = isFactionToken(piece) ? ' — faction token' : piece.inventory ? ' — shared inventory' : '';
    lines.push(`${pieceLine(view, piece)}${note}`);
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

  const events = snapshot.table.events.slice(0, 12);
  if (events.length) {
    lines.push('', 'Recent table log (newest first):');
    for (const event of events) {
      lines.push(`- ${event.message}`);
    }
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
    rules ? JSON.stringify(rules, null, 1) : '',
  ]
    .filter(Boolean)
    .join('\n');
}
