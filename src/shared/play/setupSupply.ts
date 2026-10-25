import { cardbackPresetLabel } from '../assets/cardbackPresets';
import { gameAssetColors } from './assetColors';
import type { FactionCapture } from './capture';
import { factionTokenStackKey } from './factionToken';
import type { StoredPiece, TablePiece, Vector3Tuple } from './model';
import { factionSupplyLayout } from './setupLayout';
import { restingPositionAt } from './tableGeometry';

type Item = StoredPiece['items'][number];

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
  kind: StoredPiece['kind'],
  stackKey: string
): StoredPiece {
  return {
    id,
    label,
    owner,
    color,
    accent: gameAssetColors.pieceAccent,
    kind,
    stackKey,
    items: [],
    position: [-25, 0, -25],
    orientation: 0,
    zoneId: null,
    locked: false,
  };
}

/** One physical item, with the word printed on its back when it has one; without a back it carries no artwork at all. */
export function item(
  id: string,
  name: string,
  front: string | null,
  back: string | null,
  type: string,
  faceUp: boolean,
  backName?: string
): Item {
  return {
    id,
    faceUp,
    ...(back ? { artwork: { ...(front ? { front } : {}), back, ...(backName ? { backName } : {}), name, type } } : {}),
  };
}

/** The piece resting on the table at `position`, out of any inventory. */
export function place<Piece extends TablePiece>(piece: Piece, position: Vector3Tuple, orientation = 0): Piece {
  return {
    ...piece,
    inventory: undefined,
    orientation,
    position: restingPositionAt(position, { ...piece, orientation }),
  };
}

type FactionKit = {
  capture: FactionCapture;
  color: FactionCapture['definition']['themeColor'];
} & Pick<SupplyDependencies, 'id'>;

function troopReserves({ capture, color, id }: FactionKit, layout: ReturnType<typeof factionSupplyLayout>) {
  const { faction, components } = capture;
  return components.troops.map((troop, index) => {
    const stackKey = `troops:${faction.id}:${troop.troopId ?? index}`;
    const stack = piece(id(), troop.name, faction.id, color, 'force', stackKey);
    stack.items = Array.from({ length: troop.count }, () =>
      item(id(), troop.name, troop.front, troop.back, 'troop', true)
    );
    return place(stack, layout.reserves[index]!);
  });
}

/*
 * The token stays on the table all game; turning it face down says the faction sits out, as in a bidding round.
 * It has no back of its own: the table draws a face-down token as its front under a black prohibition sign, so both sides carry the front.
 */
function factionTokenPiece({ capture, color, id }: FactionKit, layout: ReturnType<typeof factionSupplyLayout>) {
  const { faction, components } = capture;
  if (!components.token.front) {
    return [];
  }
  return [
    place(
      {
        ...piece(id(), `${faction.name} token`, faction.id, color, 'force', factionTokenStackKey(faction.id)),
        items: [item(id(), faction.name, components.token.front, components.token.front, 'token-disc', true)],
      },
      layout.token.position,
      layout.token.orientation
    ),
  ];
}

/** The leaders, then the alliance card when both its faces were captured. */
function handPieces({ capture, color, id }: FactionKit): StoredPiece[] {
  const { faction, components } = capture;
  const hand = components.leaders.map((leader) => {
    const token = piece(id(), leader.name, faction.id, color, 'force', `leader:${faction.id}:${leader.memberId}`);
    token.items = [item(id(), leader.name, leader.front, leader.back, 'token-disc', true)];
    return token;
  });
  if (components.alliance.front && components.alliance.back) {
    const alliance = piece(id(), `${faction.name} alliance`, faction.id, color, 'card', `alliance:${faction.id}`);
    alliance.items = [
      item(
        id(),
        alliance.label,
        components.alliance.front,
        components.alliance.back,
        'card-alliance',
        true,
        cardbackPresetLabel('alliance')
      ),
    ];
    hand.push(alliance);
  }
  return hand;
}

function traitorDeck(
  { capture, id }: FactionKit,
  shuffle: SupplyDependencies['shuffle'],
  layout: ReturnType<typeof factionSupplyLayout>
) {
  const { traitors } = capture.components;
  const deck = piece(id(), 'Traitor cards', 'shared', gameAssetColors.traitorCardBase, 'card', 'cards:traitor');
  deck.items = shuffle(
    traitors.cards.map((card) =>
      item(id(), card.name, card.front, traitors.back, 'card-traitor', false, cardbackPresetLabel('traitor'))
    )
  );
  return deck.items.length ? [place(deck, layout.traitors.position, layout.traitors.orientation)] : [];
}

/**
 * One faction's setup supply from its capture, laid out for the Seat at `angle`: its faction token, troop reserves and the face-down Traitor deck on the table, leaders and the alliance card in hand.
 * The caller appends the faction's Extras to the hand.
 * Every identity is drawn in the order the pieces are listed here, so a counter gives the same ids as ever.
 */
export function factionSupply(capture: FactionCapture, angle: number, { id, shuffle }: SupplyDependencies) {
  const kit: FactionKit = { capture, color: capture.definition.themeColor, id };
  const layout = factionSupplyLayout(angle, capture.components.troops.length);
  const reserves = troopReserves(kit, layout);
  const token = factionTokenPiece(kit, layout);
  const hand = handPieces(kit);
  const traitors = traitorDeck(kit, shuffle, layout);
  return { token, reserves, hand, traitors };
}
