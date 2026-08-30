import type { RulebookContentsDraftV1, RulebookContentsV1 } from '@shared/rulebooks/contents';
import { createRulebookEditorialStarterContents } from '@shared/rulebooks/fixtures';
import { describe, expect, it } from 'vitest';

import { projectRulebookDraftRenderDocument, projectRulebookRenderDocument } from './projectRulebookRenderDocument';

const assets = {
  'Storm marker': {
    assetId: 'Storm marker',
    name: 'Storm marker',
    type: 'token-disc',
    imageUrl: '/published/tokens/storm-marker/front.jpg?v=example',
  },
} as const;

describe('Rulebook render-document projection', () => {
  it('orders Pages, regions, Blocks, repeated items, and resolved Asset display data', () => {
    const rendered = projectRulebookRenderDocument(createRulebookEditorialStarterContents(), assets);
    const movement = rendered.pagesById.RULE!;

    expect(rendered.pageOrder).toEqual(['CHAP', 'RULE', 'REFS']);
    expect(movement.regions.map(({ key }) => key)).toEqual(['rules', 'examples']);
    expect(movement.regions[0]?.blocks.map(({ id }) => id)).toEqual(['MVVE', 'TEXT']);
    expect(movement.regions[1]?.blocks[0]).toMatchObject({
      id: 'ASST',
      kind: 'asset-figure',
      asset: { status: 'ready', imageUrl: assets['Storm marker'].imageUrl },
    });
    expect(movement.regions[1]?.blocks[1]).toMatchObject({
      id: 'L5ST',
      kind: 'repeated-text',
      items: [{ id: 'item-example', text: 'Confirm that the destination is adjacent.' }],
    });
  });

  it('keeps missing and unselected Assets explicit', () => {
    const contents = createRulebookEditorialStarterContents();
    const missing = projectRulebookRenderDocument(contents, {});
    expect(missing.pagesById.RULE?.regions[1]?.blocks[0]).toMatchObject({
      kind: 'asset-figure',
      asset: { status: 'unavailable', assetId: 'Storm marker' },
    });
    expect(missing.pagesById.CHAP?.regions[0]?.blocks[0]).toMatchObject({
      kind: 'asset-figure',
      asset: { status: 'unselected' },
    });
  });

  it('reports invalid local text while preserving the escaped source for preview', () => {
    const contents: RulebookContentsDraftV1 = createRulebookEditorialStarterContents();
    const block = contents.pagesById.RULE!.blocksById.TEXT!;
    if (block.kind !== 'text') {
      throw new Error('Expected the TEXT fixture to be a Text Block');
    }
    block.text = 'An *unfinished draft <script>alert(1)</script>';

    const preview = projectRulebookDraftRenderDocument(contents, assets);

    expect(preview.document.pagesById.RULE?.regions[0]?.blocks[1]).toMatchObject({
      text: 'An *unfinished draft <script>alert(1)</script>',
    });
    expect(preview.diagnostics).toContainEqual(
      expect.objectContaining({ path: ['pagesById', 'RULE', 'blocksById', 'TEXT', 'text'] })
    );
    expect(() => projectRulebookRenderDocument(contents as unknown as RulebookContentsV1, assets)).toThrow(
      'Formatted text must be valid'
    );
  });
});
