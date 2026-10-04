import { describe, expect, it } from 'vitest';

import { createRulebookStarterContents } from './fixtures';
import { projectRulebookRenderDocument } from './projectRenderDocument';
import { DEFAULT_RULEBOOK_SETTINGS } from './settings';

describe('Related rule destinations', () => {
  it('follows page order, target names and anchors without rewriting the reference', () => {
    const contents = createRulebookStarterContents();
    const block = contents.pagesById.RULE!.blocksById.MVVE!;
    const target = contents.pagesById.REFS!.blocksById.TEXT!;
    if (block.kind !== 'text' || target.kind !== 'text') {
      throw new Error('Expected text fixtures');
    }
    block.references = [{ pageId: 'REFS', blockId: 'TEXT' }];
    target.name = 'Storm marker';
    const render = () =>
      projectRulebookRenderDocument(contents, {}, DEFAULT_RULEBOOK_SETTINGS).pagesById.RULE!.regions[0]!.blocks[0];
    expect(render()).toMatchObject({ references: [{ label: 'Storm marker', anchor: 'marker-note', pageNumber: 3 }] });
    contents.pageOrder = ['REFS', 'CHAP', 'RULE'];
    target.name = 'The storm';
    target.anchor = 'the-storm';
    expect(render()).toMatchObject({ references: [{ label: 'The storm', anchor: 'the-storm', pageNumber: 1 }] });
    expect(block.references).toEqual([{ pageId: 'REFS', blockId: 'TEXT' }]);
  });

  it('keeps a missing destination visible without linking to a stale anchor', () => {
    const contents = createRulebookStarterContents();
    const block = contents.pagesById.RULE!.blocksById.MVVE!;
    if (block.kind !== 'text') {
      throw new Error('Expected text fixture');
    }
    block.references = [{ pageId: 'REFS', blockId: 'TEXT' }];
    delete contents.pagesById.REFS!.blocksById.TEXT;
    const targetPage = contents.pagesById.REFS!;
    if (targetPage.layoutId !== 'single-column') {
      throw new Error('Expected single column');
    }
    targetPage.blockOrderByRegion.content = [];
    const rendered = projectRulebookRenderDocument(contents, {}, DEFAULT_RULEBOOK_SETTINGS);
    expect(rendered.pagesById.RULE!.regions[0]!.blocks[0]).toMatchObject({
      references: [{ label: 'Reference unavailable' }],
    });
    const text = rendered.pagesById.RULE!.regions[0]!.blocks[0]!;
    if (text.kind !== 'text') {
      throw new Error('Expected rendered text');
    }
    expect(text.references![0]).not.toHaveProperty('anchor');
  });
});
