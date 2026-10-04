/* Throwaway public demo pieces. No saved game or private card data enters this room. */
import { freshTableState } from '@shared/play/model';
import type { TablePiece } from '@shared/play/model';
import { restingPositionAt } from '@shared/play/tableGeometry';

export function demoPieces(): TablePiece[] {
  const pieces = freshTableState().pieces;
  const houses = ['Atreides', 'Harkonnen', 'Fremen', 'Emperor', 'Guild', 'Bene Gesserit'];
  const slugs = ['atreides', 'harkonnen', 'fremen', 'emperor', 'guild', 'bene-gesserit'];
  const colors = ['#327c42', '#991f37', '#d5a734', '#b83b91', '#e87426', '#2475ad'];
  houses.forEach((house, i) => {
    const angle = (i / 6) * Math.PI * 2;
    pieces.push({
      id: `faction-${i}`,
      label: house,
      owner: 'shared',
      kind: 'force',
      stackKey: `faction-token:${i}`,
      color: colors[i],
      accent: '#fff0bb',
      items: [
        {
          id: `faction-face-${i}`,
          faceUp: true,
          artwork: {
            front: `http://localhost:3017/vector/logo/${slugs[i]}.svg`,
            back: `http://localhost:3017/vector/logo/${slugs[i]}.svg`,
            type: 'token-disc',
          },
        },
      ],
      position: restingPositionAt([Math.sin(angle) * 3.3, 0, Math.cos(angle) * 3.3], { kind: 'force', orientation: 0 }),
      orientation: 0,
      zoneId: null,
      locked: false,
    });
  });
  for (const piece of pieces) {
    if (piece.id.startsWith('faction-')) continue;
    const href =
      piece.kind === 'card'
        ? 'https://dune.zone/published/cards/ns78nmym3qpth6sm9wsfj3ka9s8cw350/card.jpg'
        : `http://localhost:3017/vector/troop/${piece.owner}.svg`;
    piece.items = piece.items.map((item) => ({
      ...item,
      faceUp: true,
      artwork: { front: href, back: href, type: piece.kind === 'card' ? 'card-treachery' : 'token-disc' },
    }));
  }
  return pieces;
}
