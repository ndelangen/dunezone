import type { FactionCapture } from './capture';
import type { TablePiece, Vector3Tuple } from './model';
import { factionSupplyLayout } from './setupLayout';
import { restingPositionAt } from './tableGeometry';

type Item = TablePiece['items'][number];

/**
 * What a supply build takes from its caller: a fresh identity per piece and item, and the order a dealt deck is shuffled into.
 * The game Worker passes random identities and its shuffle.
 * A story passes a counter and the catalogue order.
 */
export type SupplyDependencies = { id: () => string; shuffle: (items: Item[]) => Item[] };

/** An empty stack off the table, as a hand holds it; `place` puts it on the table once it has items. */
export function piece(
  id: string,
  label: string,
  owner: string,
  color: string,
  kind: TablePiece['kind'],
  stackKey: string
): TablePiece {
  return {
    id,
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

/** One physical item; without a back it carries no artwork at all. */
export function item(
  id: string,
  name: string,
  front: string | null,
  back: string | null,
  type: string,
  faceUp: boolean
): Item {
  return {
    id,
    faceUp,
    ...(back ? { artwork: { ...(front ? { front } : {}), back, name, type } } : {}),
  };
}

/** The piece resting on the table at `position`, out of any inventory. */
export function place(piece: TablePiece, position: Vector3Tuple, orientation = 0): TablePiece {
  return {
    ...piece,
    inventory: undefined,
    orientation,
    position: restingPositionAt(position, { ...piece, orientation }),
  };
}

/**
 * One faction's setup supply from its capture, laid out for the Seat at `angle`: troop reserves and the face-down Traitor deck on the table, leaders and the alliance card in hand.
 * The caller appends the faction's Extras to the hand.
 */
export function factionSupply(capture: FactionCapture, angle: number, { id, shuffle }: SupplyDependencies) {
  const { faction, components, definition } = capture;
  const color = definition.themeColor;
  const layout = factionSupplyLayout(angle, components.troops.length);
  const reserves = components.troops.map((troop, index) => {
    const stack = piece(id(), troop.name, faction.id, color, 'force', `troops:${faction.id}:${index}`);
    stack.items = Array.from({ length: troop.count }, () =>
      item(id(), troop.name, troop.front, troop.back, 'troop', true)
    );
    return place(stack, layout.reserves[index]!);
  });
  const hand = components.leaders.map((leader) => {
    const token = piece(id(), leader.name, faction.id, color, 'force', `leader:${faction.id}:${leader.memberId}`);
    token.items = [item(id(), leader.name, leader.front, leader.back, 'token-disc', true)];
    return token;
  });
  if (components.alliance.front && components.alliance.back) {
    const alliance = piece(id(), `${faction.name} alliance`, faction.id, color, 'card', `alliance:${faction.id}`);
    alliance.items = [
      item(id(), alliance.label, components.alliance.front, components.alliance.back, 'card-alliance', true),
    ];
    hand.push(alliance);
  }
  const deck = piece(id(), 'Traitor cards', 'shared', '#d5ba8c', 'card', 'cards:traitor');
  deck.items = shuffle(
    components.traitors.cards.map((card) =>
      item(id(), card.name, card.front, components.traitors.back, 'card-traitor', false)
    )
  );
  const traitors = deck.items.length ? [place(deck, layout.traitors.position, layout.traitors.orientation)] : [];
  return { reserves, hand, traitors };
}
