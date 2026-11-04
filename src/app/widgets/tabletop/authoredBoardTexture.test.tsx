import { CENTER } from '@shared/boards/geometry';
import { arrakisBoardCapture } from '@shared/play/fixtures/board';
import { TABLE_SECTOR_COUNT } from '@shared/play/tableSettings';
import { DOMParser } from 'linkedom';
import { describe, expect, it } from 'vite-plus/test';

import { BOARD_ARTWORK } from '@game/assets/board/artwork';

import { authoredBoardSvg } from './authoredBoardTexture';

const board = arrakisBoardCapture.definition;
const svg = new DOMParser().parseFromString(authoredBoardSvg(board, BOARD_ARTWORK), 'image/svg+xml');

describe('The table map draws the storm sectors (#2670)', () => {
  it('draws one line on each of the table sector boundaries', () => {
    const lines = [...svg.querySelectorAll('defs g[id$="-sectors"] path')];
    expect(lines).toHaveLength(TABLE_SECTOR_COUNT);
    const angles = lines.map((line) => {
      const [, x, y] = line
        .getAttribute('d')!
        .match(/L([\d.-]+) ([\d.-]+)/)!
        .map(Number);
      return Math.atan2(y! - CENTER[1], x! - CENTER[0]);
    });
    angles.forEach((angle, index) => {
      const boundary = (index / TABLE_SECTOR_COUNT) * Math.PI * 2;
      expect(Math.cos(angle)).toBeCloseTo(Math.cos(boundary), 9);
      expect(Math.sin(angle)).toBeCloseTo(Math.sin(boundary), 9);
    });
  });

  it('lays the lines inside every territory but the Polar Sink, before its names and icons', () => {
    const territories = [...svg.querySelectorAll('[data-clipped-territory]')];
    expect(territories.length).toBeGreaterThan(0);
    for (const artwork of territories) {
      const name = artwork.getAttribute('data-clipped-territory')!;
      const polar = Object.values(board.properties).some((p) => p.name === name && p.type === 'polar');
      const lines = artwork.parentElement!.querySelector(':scope > [data-sector-lines]');
      if (polar) {
        expect(lines, name).toBeNull();
      } else {
        expect(lines, name).not.toBeNull();
        expect(lines!.nextElementSibling, name).toBe(artwork);
      }
    }
  });
});
