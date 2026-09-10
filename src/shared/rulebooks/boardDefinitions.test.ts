import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { componentGeometrySchema } from '../asset-publishing/componentGeometry';
import { RULEBOOK_BOARD_DEFINITIONS, resolveRulebookBoardDefinition } from './boardDefinitions';
import { resolveRulebookBoardIllustration } from './boardIllustrations';

describe('maintained board definitions', () => {
  it('binds the delivered illustration and its feature geometry to one version', async () => {
    for (const board of RULEBOOK_BOARD_DEFINITIONS) {
      const illustration = resolveRulebookBoardIllustration(board.id)!;
      expect(illustration.revision).toBe(board.revision);
      expect(componentGeometrySchema.parse(board.geometry)).toEqual(board.geometry);
      expect(await readFile(new URL('../../../public/page/map.svg', import.meta.url), 'utf8')).toBe(illustration.svg);
      expect(
        await readFile(new URL(`../../..${board.imageUrl.replace('/page/', '/public/page/')}`, import.meta.url), 'utf8')
      ).toBe(illustration.svg);
      expect(
        createHash('sha256')
          .update(JSON.stringify({ svg: illustration.svg, geometry: board.geometry }))
          .digest('hex')
      ).toBe(board.revision);
    }
  });

  it('keeps territory, region and layer identifiers distinct without inventing a fallback', () => {
    const board = resolveRulebookBoardDefinition('arrakis')!;
    expect(board.geometry.parts.map(({ key }) => key)).toEqual(
      expect.arrayContaining([
        'arrakeen',
        'carthag',
        'tabr',
        'habbanya',
        'tueks',
        'shield-wall',
        'polar',
        'rock',
        'sand',
        'strongholds',
        'sectors',
      ])
    );
    expect(resolveRulebookBoardDefinition('missing-board')).toBeUndefined();
  });
});
