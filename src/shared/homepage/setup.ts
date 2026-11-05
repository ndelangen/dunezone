import { initialSnapshot } from '../play/commands';
/* The public Play example's prepared table, with no private hands or saved game data. */
import type { StoredPiece } from '../play/model';
import { factionSupplyLayout } from '../play/setupLayout';
import { item, piece, place } from '../play/setupSupply';
import { cardBaySlotPositions } from '../play/tableFurnitureLayout';
import { tableSeatAngles } from '../play/tableSettings';
import artworkManifest from './artwork.json';

function homepagePieces(origin: string): StoredPiece[] {
  const artwork = (path: string) => new URL(path, origin).href;
  const pieces: StoredPiece[] = [];
  const angles = tableSeatAngles(6);
  artworkManifest.factions.forEach(({ slug, name, color, troops, token }, index) => {
    const layout = factionSupplyLayout(angles[index]!, troops.length);
    pieces.push(
      place(
        {
          ...piece(`faction-${index}`, name, slug, color, 'force', `faction-token:${slug}`),
          items: [item(`token-${index}`, name, artwork(token), artwork(token), 'token-disc', true)],
        },
        layout.token.position,
        layout.token.orientation
      )
    );
    troops.forEach((troop, kind) => {
      const face = artwork(troop.face);
      pieces.push(
        place(
          {
            ...piece(`reserve-${index}-${kind}`, troop.name, slug, color, 'force', `troops:${slug}:${kind}`),
            items: Array.from({ length: troop.count }, (_, n) =>
              item(`troop-${index}-${kind}-${n}`, troop.name, face, face, 'troop', true)
            ),
          },
          layout.reserves[kind]!
        )
      );
    });
  });
  placeStartingTroops(pieces);
  return [...pieces, ...treacheryPieces(artwork)];
}

/** The table point in the middle of each territory the homepage table starts troops in, on Arrakis Official. */
export const HOMEPAGE_TERRITORY_POINTS = {
  arrakeen: [1.23, -2.81],
  carthag: [-0.11, -2.52],
  tueks: [2.89, 1.65],
  tabr: [-2.85, -1.73],
  'false-wall-south': [1.72, 1.67],
  polar: [-0.07, 0.11],
  'imperial-basin': [0.68, -2],
} as const satisfies Record<string, readonly [x: number, z: number]>;

/* Each faction's starting troops: the faction, how many, and where. */
const STARTING_TROOPS: ReadonlyArray<
  readonly [faction: number, count: number, keyof typeof HOMEPAGE_TERRITORY_POINTS]
> = [
  [0, 10, 'arrakeen'],
  [1, 10, 'carthag'],
  [3, 5, 'tueks'],
  [4, 5, 'tabr'],
  [4, 5, 'false-wall-south'],
  [5, 1, 'polar'],
  [5, 1, 'imperial-basin'],
];

function placeStartingTroops(pieces: StoredPiece[]) {
  for (const [faction, count, territory] of STARTING_TROOPS) {
    const [x, z] = HOMEPAGE_TERRITORY_POINTS[territory];
    const reserve = pieces.find((p) => p.id === `reserve-${faction}-0`)!;
    const troops = reserve.items.splice(0, count);
    pieces.push(
      place({ ...reserve, id: `starting-${faction}-${territory}`, items: troops, zoneId: territory }, [x, 0, z])
    );
    Object.assign(reserve, place(reserve, reserve.position));
  }
}

function treacheryPieces(artwork: (path: string) => string): StoredPiece[] {
  const back = artwork(artworkManifest.cardback);
  const deck = piece('treachery-deck', 'Treachery deck', 'shared', '#ad8a45', 'card', 'cards:treachery');
  return [
    place(
      {
        ...deck,
        items: Array.from({ length: 10 }, (_, n) => {
          const card = artworkManifest.cards[n % artworkManifest.cards.length]!;
          return item(`treachery-${n}`, card.name, artwork(card.face), back, 'card-treachery', false);
        }),
      },
      cardBaySlotPositions('right')[2]!
    ),
    place(
      {
        ...deck,
        id: 'treachery-card-loose',
        items: [item('snooper', 'Snooper', artwork(artworkManifest.snooper), back, 'card-treachery', true)],
      },
      [4, 0, 1]
    ),
  ];
}

export function homepageSnapshot(origin: string) {
  const snapshot = initialSnapshot();
  snapshot.table.pieces = homepagePieces(origin);
  snapshot.table.events = [];
  snapshot.versions = Object.fromEntries(snapshot.table.pieces.map((piece) => [piece.id, 0]));
  return snapshot;
}
