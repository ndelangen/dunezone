import type { FactionCapture, RulesetCapture, SlotCapture } from '../../src/shared/play/capture';
import { accepted, nextSnapshot } from '../../src/shared/play/commands';
import type { TablePiece, Vector3Tuple } from '../../src/shared/play/model';
import { tableForViewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import type { TableRoster } from '../../src/shared/play/schema';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { factionSupplyLayout } from '../../src/shared/play/setupLayout';
import { restingPositionAt } from '../../src/shared/play/tableGeometry';
import { tableSeatAngles } from '../../src/shared/play/tableSettings';
import type { CaptureStore } from './captures';
import { concealCards, shuffledCards } from './decks';
import { initialSetup } from './setup-progress';
import type { StoredSnapshot } from './state';

/** Supply and its receipt commit in the transaction that closes trading or fills its last vacancy. */
export class SetupSupply {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly captures: CaptureStore
  ) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS setup_supply (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, created_at INTEGER NOT NULL, data TEXT NOT NULL)'
    );
  }

  enter(snapshot: StoredSnapshot, now: number): StoredSnapshot {
    if (snapshot.stage !== 'swapping' || !snapshot.swapping?.closed) {
      return snapshot;
    }
    if (this.storage.sql.exec('SELECT id FROM setup_supply WHERE id=1').toArray().length) {
      throw new GameRejection('Setup supply has already been recorded.');
    }
    const { ruleset, factions } = this.retainedSupply(snapshot.roster);
    const supplied = suppliedSnapshot(snapshot, ruleset, factions);
    this.record(supplied, now);
    return supplied;
  }

  private retainedSupply(roster: TableRoster | undefined) {
    const ruleset = this.captures.ruleset();
    if (!ruleset || !roster) {
      throw new GameRejection('The game is missing its retained setup supply.');
    }
    return { ruleset, factions: this.seatedCaptures(roster) };
  }

  private seatedCaptures(roster: TableRoster) {
    const angles = tableSeatAngles(roster.seatCount);
    const factions = roster.seats.map((seat) => {
      const capture = seat.faction && this.captures.faction(seat.faction.id);
      if (!capture) {
        throw new GameRejection('A seated faction is missing its retained setup supply.');
      }
      return { capture, angle: angles[seat.position]! };
    });
    const backs = new Set(factions.map(({ capture }) => capture.components.traitors.back).filter(Boolean));
    if (backs.size > 1) {
      throw new GameRejection('The retained traitor decks need a shared back.');
    }
    return factions;
  }

  private record(supplied: StoredSnapshot, now: number) {
    this.storage.sql.exec(
      'INSERT INTO setup_supply VALUES(1,?,?,?)',
      supplied.revision,
      now,
      JSON.stringify({
        pieces: supplied.table.pieces,
        inventories: supplied.factionInventories,
        banks: supplied.factionBanks,
        event: supplied.table.events[0],
      })
    );
  }
}

function suppliedSnapshot(
  snapshot: StoredSnapshot,
  ruleset: RulesetCapture,
  factions: { capture: FactionCapture; angle: number }[]
): StoredSnapshot {
  const next = structuredClone(snapshot);
  const table = tableForViewer(next, SPECTATOR_SEAT);
  for (const { capture, angle } of factions) {
    const { reserves, hand, traitors } = factionSupply(capture, angle);
    table.pieces.push(...reserves, ...traitors);
    supplyInventory(next, capture, hand);
  }
  table.pieces.push(
    ...slotPieces(ruleset.decks.treachery, 'shared', [-5.9, 0, -1.45]),
    ...slotPieces(ruleset.decks.spice, 'shared', [5.9, 0, -1.45]),
    ...[...ruleset.decks.custom, ruleset.bundles.techToken, ...ruleset.bundles.custom].flatMap((slot) =>
      slotPieces(slot, 'shared')
    )
  );
  const message = 'Setup supplied from the retained ruleset and factions. Starting spice credited.';
  return concealCards(
    {
      ...nextSnapshot(next, accepted(table, 'setup-supply', message)),
      stage: 'setup',
      setup: initialSetup(factions.map(({ capture }) => capture)),
      controls: { ...next.controls!, ready: [] },
    },
    table.pieces,
    true
  );
}

function supplyInventory(next: StoredSnapshot, capture: FactionCapture, hand: TablePiece[]) {
  const id = capture.faction.id;
  next.factionInventories[id] = hand;
  next.factionArtwork = {
    ...next.factionArtwork,
    [id]: {
      background: capture.definition.background,
      logo: capture.definition.logo,
      troops: capture.definition.troops,
    },
  };
  next.factionBanks[id] = capture.definition.rules.spiceCount;
  /* Combat authoring has its own delivery. Missing authored strengths must not become fixture values. */
  next.combatFaces[id] = [];
}

function piece(label: string, owner: string, color: string, kind: TablePiece['kind'], stackKey: string): TablePiece {
  return {
    id: crypto.randomUUID(),
    label,
    owner,
    color,
    accent: '#ead9bb',
    kind,
    stackKey,
    items: [],
    position: [-25, 0, -25],
    orientation: 0,
    zoneId: null,
    locked: false,
  };
}

function item(
  name: string,
  front: string | null,
  back: string | null,
  type: string,
  faceUp: boolean
): TablePiece['items'][number] {
  return {
    id: crypto.randomUUID(),
    faceUp,
    ...(back ? { artwork: { ...(front ? { front } : {}), back, name, type } } : {}),
  };
}

function place(piece: TablePiece, position: Vector3Tuple, orientation = 0): TablePiece {
  return {
    ...piece,
    inventory: undefined,
    orientation,
    position: restingPositionAt(position, { ...piece, orientation }),
  };
}

/** Every occurrence gets independent physical identities while its retained artwork and stack compatibility survive. */
function slotPieces(slot: SlotCapture | null, owner: string, position?: Vector3Tuple): TablePiece[] {
  const pieces = slot?.contents?.pieces.map((source) => copyPiece(source, owner)) ?? [];
  if (!position || !pieces.length) {
    return pieces;
  }
  /* Captured deck members are separate pieces; the tabletop receives one deck in the normal deck area. */
  return [place({ ...pieces[0]!, items: shuffledCards(pieces.flatMap((entry) => entry.items)) }, position)];
}

function copyPiece(source: TablePiece, owner: string): TablePiece {
  const copy = structuredClone(source);
  copy.id = crypto.randomUUID();
  copy.owner = owner;
  copy.inventory = owner === 'shared' ? 'shared' : undefined;
  copy.items = copy.items.map((sourceItem) => ({
    ...sourceItem,
    id: crypto.randomUUID(),
    faceUp: source.kind !== 'card',
  }));
  if (copy.kind === 'card') {
    copy.items = shuffledCards(copy.items);
  }
  return copy;
}

function factionSupply(capture: FactionCapture, angle: number) {
  const { faction, components, definition } = capture;
  const color = definition.themeColor;
  const layout = factionSupplyLayout(angle, components.troops.length);
  const reserves = components.troops.map((troop, index) => {
    const stack = piece(troop.name, faction.id, color, 'force', `troops:${faction.id}:${index}`);
    stack.items = Array.from({ length: troop.count }, () => item(troop.name, troop.front, troop.back, 'troop', true));
    return place(stack, layout.reserves[index]!);
  });
  const hand = components.leaders.map((leader) => {
    const token = piece(leader.name, faction.id, color, 'force', `leader:${faction.id}:${leader.memberId}`);
    token.items = [item(leader.name, leader.front, leader.back, 'token-disc', true)];
    return token;
  });
  if (components.alliance.front && components.alliance.back) {
    const alliance = piece(`${faction.name} alliance`, faction.id, color, 'card', `alliance:${faction.id}`);
    alliance.items = [item(alliance.label, components.alliance.front, components.alliance.back, 'card-alliance', true)];
    hand.push(alliance);
  }
  hand.push(...capture.extras.flatMap((slot) => slotPieces(slot, faction.id)));
  const deck = piece('Traitor cards', 'shared', '#d5ba8c', 'card', 'cards:traitor');
  deck.items = shuffledCards(
    components.traitors.cards.map((card) =>
      item(card.name, card.front, components.traitors.back, 'card-traitor', false)
    )
  );
  const traitors = deck.items.length ? [place(deck, layout.traitors.position, layout.traitors.orientation)] : [];
  return { reserves, hand, traitors };
}
