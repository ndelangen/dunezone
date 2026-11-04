import { boardTerritories } from '@shared/boards/territories';
import { arrakisBoardCapture } from '@shared/play/fixtures/board';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vite-plus/test';

import { BOARD_ARTWORK } from './artwork';
import { BoardArtwork } from './Board';

const board = arrakisBoardCapture.definition;
const render = (sectorLines?: boolean) =>
  renderToStaticMarkup(
    <svg>
      <BoardArtwork board={board} faces={boardTerritories(board)} artwork={BOARD_ARTWORK} sectorLines={sectorLines} />
    </svg>
  );

describe('Board sector lines', () => {
  it('draws the storm’s 18 sectors when asked, under the Polar Sink', () => {
    const markup = render(true);
    const lines = markup.match(/<g data-sector-lines[^>]*>(.*?)<\/g>/)?.[1] ?? '';
    expect(lines.match(/<path /g)).toHaveLength(18);
    const polarFill = markup.indexOf('fill="#fff"');
    expect(polarFill).toBeGreaterThan(markup.indexOf('data-sector-lines'));
  });

  it('leaves them out by default', () => {
    expect(render()).not.toContain('data-sector-lines');
  });
});
