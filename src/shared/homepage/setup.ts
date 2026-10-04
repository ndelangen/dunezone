import { initialSnapshot } from '../play/commands';
/* The public Play example's prepared table, with no private hands or saved game data. */
import type { StoredPiece } from '../play/model';
import { factionSupplyLayout } from '../play/setupLayout';
import { item, piece, place } from '../play/setupSupply';
import { BOARD_RADIUS } from '../play/tableGeometry';
import { tableSeatAngles } from '../play/tableSettings';
import board from '../rulebooks/boards/arrakis.json';
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
  placeStartingForces(pieces);
  return [...pieces, ...treacheryPieces(artwork)];
}

function placeStartingForces(pieces: StoredPiece[]) {
  const placements: Array<[number, number, string]> = [
    [0, 10, 'arrakeen'],
    [1, 10, 'carthag'],
    [3, 5, 'tueks'],
    [4, 5, 'tabr'],
    [4, 5, 'false-wall-south'],
    [5, 1, 'polar'],
    [5, 1, 'imperial-basin'],
  ];
  for (const [faction, count, territory] of placements) {
    const reserve = pieces.find((p) => p.id === `reserve-${faction}-0`)!;
    const area = board.geometry.parts.find((part) => part.key === territory)!;
    const troops = reserve.items.splice(0, count);
    pieces.push(
      place({ ...reserve, id: `starting-${faction}-${territory}`, items: troops, zoneId: territory }, [
        (area.x + area.width / 2 - 0.5) * BOARD_RADIUS * 2,
        0,
        (area.y + area.height / 2 - 0.5) * BOARD_RADIUS * 2,
      ])
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
      [6.3, 0, 0]
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
