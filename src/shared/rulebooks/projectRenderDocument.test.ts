import { describe, expect, it } from 'vitest';

import { rulebookContentsV1Schema, rulebookEditionContentsV1Schema } from './contents';
import type { RulebookContentsDraftV1, RulebookContentsV1 } from './contents';
import { createRulebookStarterContents } from './fixtures';
import { projectRulebookDraftRenderDocument, projectRulebookRenderDocument } from './projectRenderDocument';
import { DEFAULT_RULEBOOK_SETTINGS } from './settings';

const assets = {
  'Storm marker': {
    assetId: 'Storm marker',
    name: 'Storm marker',
    type: 'token-disc',
    imageUrl: '/published/tokens/storm-marker/front.jpg?v=example',
  },
} as const;

function withStormMarker(contents: RulebookContentsV1) {
  const illustration = contents.pagesById.RULE!.blocksById.ASST!;
  if (illustration.kind !== 'referenced-illustration') {
    throw new Error('Expected the ASST fixture to be a referenced illustration');
  }
  illustration.source = { kind: 'asset', assetId: 'Storm marker' };
  return contents;
}

describe('Rulebook render-document projection', () => {
  it('renders a Block holding a spelling the current write contract refuses', () => {
    const contents = structuredClone(createRulebookStarterContents()) as RulebookContentsDraftV1;
    const rule = contents.pagesById.RULE!.blocksById.MVVE!;
    if (rule.kind !== 'text') {
      throw new Error('Expected the MVVE fixture to be a Text Block');
    }
    /* An Edition minted before the spelling narrowed keeps rendering, and Save still refuses the same value (#1033). */
    rule.text = '__a__' as never;
    expect(rulebookContentsV1Schema.safeParse(contents).success).toBe(false);
    const edition = rulebookEditionContentsV1Schema.parse(contents);

    const rendered = projectRulebookRenderDocument(edition, assets, DEFAULT_RULEBOOK_SETTINGS);

    expect(rendered.pagesById.RULE?.regions[0]?.blocks[0]).toMatchObject({ id: 'MVVE', text: '__a__' });
  });

  it('orders Pages, regions, Blocks, repeated items, and resolved source display data', () => {
    const rendered = projectRulebookRenderDocument(
      withStormMarker(createRulebookStarterContents()),
      assets,
      DEFAULT_RULEBOOK_SETTINGS
    );
    const movement = rendered.pagesById.RULE!;

    expect(rendered.pageOrder).toEqual(['CHAP', 'RULE', 'REFS']);
    expect(movement.regions.map(({ key }) => key)).toEqual(['column1', 'column2']);
    expect(movement.regions[0]?.blocks.map(({ id }) => id)).toEqual(['MVVE', 'TEXT']);
    expect(movement.regions[1]?.blocks[0]).toMatchObject({
      id: 'ASST',
      kind: 'referenced-illustration',
      source: { status: 'ready', imageUrl: assets['Storm marker'].imageUrl },
    });
    expect(movement.regions[1]?.blocks[1]).toMatchObject({
      id: 'L5ST',
      kind: 'list',
      items: [{ id: 'item-example', text: 'Confirm that the destination is adjacent.' }],
    });
  });

  it('keeps missing and unselected sources explicit', () => {
    const missing = projectRulebookRenderDocument(
      withStormMarker(createRulebookStarterContents()),
      {},
      DEFAULT_RULEBOOK_SETTINGS
    );
    expect(missing.pagesById.RULE?.regions[1]?.blocks[0]).toMatchObject({
      kind: 'referenced-illustration',
      source: { status: 'unavailable', reference: { kind: 'asset', assetId: 'Storm marker' } },
    });
    const unselected = projectRulebookRenderDocument(createRulebookStarterContents(), {}, DEFAULT_RULEBOOK_SETTINGS);
    expect(unselected.pagesById.RULE?.regions[1]?.blocks[0]).toMatchObject({
      kind: 'referenced-illustration',
      source: { status: 'unselected' },
    });
    expect(unselected.pagesById.CHAP?.regions[0]?.blocks[0]).toMatchObject({
      kind: 'referenced-illustration',
      source: { status: 'unselected' },
    });
  });

  it('reports invalid local text while preserving the escaped source for preview', () => {
    const contents: RulebookContentsDraftV1 = createRulebookStarterContents();
    const block = contents.pagesById.RULE!.blocksById.TEXT!;
    if (block.kind !== 'text') {
      throw new Error('Expected the TEXT fixture to be a Text Block');
    }
    block.text = 'An *unfinished draft <script>alert(1)</script>';

    const preview = projectRulebookDraftRenderDocument(contents, assets, DEFAULT_RULEBOOK_SETTINGS);

    expect(preview.document.pagesById.RULE?.regions[0]?.blocks[1]).toMatchObject({
      text: 'An *unfinished draft <script>alert(1)</script>',
    });
    expect(preview.diagnostics).toContainEqual(
      expect.objectContaining({ path: ['pagesById', 'RULE', 'blocksById', 'TEXT', 'text'] })
    );
    expect(() =>
      projectRulebookRenderDocument(contents as unknown as RulebookContentsV1, assets, DEFAULT_RULEBOOK_SETTINGS)
    ).toThrow('Formatted text must be valid');
  });
});
