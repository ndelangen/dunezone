/* The public Play example's prepared table, with no private hands or saved game data. */
import type { TablePiece } from '@shared/play/model';
import { factionSupplyLayout } from '@shared/play/setupLayout';
import { item, piece, place } from '@shared/play/setupSupply';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import { tableSeatAngles } from '@shared/play/tableSettings';
import board from '@shared/rulebooks/boards/arrakis.json';

import factions from '../play/product.stories.fixture/factions.json';

const artwork = (path: string) => `http://localhost:3017${path}`;

export function demoPieces(): TablePiece[] {
  const pieces: TablePiece[] = [];
  const angles = tableSeatAngles(6);
  factions.forEach(({ slug, data, token }, index) => {
    const layout = factionSupplyLayout(angles[index]!, data.troops.length);
    pieces.push(
      place(
        {
          ...piece(`faction-${index}`, data.name, slug, data.themeColor, 'force', `faction-token:${slug}`),
          items: [item(`token-${index}`, data.name, artwork(token), artwork(token), 'token-disc', true)],
        },
        layout.token.position,
        layout.token.orientation
      )
    );
    data.troops.forEach((troop, kind) => {
      const face = artwork(`/play-fixtures/product/${slug}-troop-${kind}.jpg`);
      pieces.push(
        place(
          {
            ...piece(`reserve-${index}-${kind}`, troop.name, slug, data.themeColor, 'force', `troops:${slug}:${kind}`),
            items: Array.from({ length: troop.count }, (_, n) =>
              item(`troop-${index}-${kind}-${n}`, troop.name, face, face, 'troop', true)
            ),
          },
          layout.reserves[kind]!
        )
      );
    });
  });
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
  const back = artwork('/play-fixtures/dreamrules/cardback.jpg');
  const deck = piece('treachery-deck', 'Treachery deck', 'shared', '#ad8a45', 'card', 'cards:treachery');
  pieces.push(
    place(
      {
        ...deck,
        items: Array.from({ length: 10 }, (_, n) => ({ id: `treachery-${n}`, faceUp: false, artwork: { back } })),
      },
      [6.3, 0, 0]
    )
  );
  pieces.push(
    place(
      {
        ...deck,
        id: 'treachery-card-loose',
        items: [
          item('snooper', 'Snooper', artwork('/play-fixtures/dreamrules/snooper.jpg'), back, 'card-treachery', true),
        ],
      },
      [4, 0, 1]
    )
  );
  return pieces;
}
