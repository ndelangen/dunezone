// @vitest-environment jsdom

import { rulebookLayoutCatalogue } from '@shared/rulebooks/contents';
import type { RulebookRenderPreviewDocumentV1 } from '@shared/rulebooks/renderDocument';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RulebookDocumentRenderer, RulebookPageRenderer } from './RulebookRenderer';
import { createRulebookRenderDocumentFixture } from './RulebookRenderer.stories.fixture';

describe('Rulebook renderer', () => {
  it('renders semantic Pages and stable Page and Block anchors', () => {
    const document = createRulebookRenderDocumentFixture();
    const { container } = render(<RulebookDocumentRenderer document={document} />);

    expect([...container.querySelectorAll('article')].map(({ id }) => id)).toEqual([
      'welcome-to-arrakis',
      'movement',
      'markers-and-tokens',
    ]);
    expect(container.querySelector('#storm-boundary')?.textContent).toContain('storm closes the boundary');
    expect(container.querySelectorAll('main > article')).toHaveLength(3);
    expect([...container.querySelectorAll('h2')].map(({ textContent }) => textContent)).toEqual(
      rulebookLayoutCatalogue.flatMap((layout) =>
        layout.regions.flatMap((region) => (region.kind === 'block' ? [region.label] : []))
      )
    );
    expect(container.textContent).toContain('Chapter one');
    expect(container.textContent).toContain('Rules page');
    expect(container.textContent).toContain('Resolve movement in the order shown below.');
    expect(container.textContent).toContain('Movement sequence');
  });

  it('renders one Page independently and escapes invalid local text', () => {
    const document: RulebookRenderPreviewDocumentV1 = createRulebookRenderDocumentFixture();
    const block = document.pagesById.RULE!.regions[0]!.blocks[1]!;
    if (block.kind !== 'text') {
      throw new Error('Expected the TEXT fixture to be a Text Block');
    }
    block.text = 'An *unfinished draft <script>alert(1)</script>';
    const page = document.pagesById.RULE!;
    const { container } = render(<RulebookPageRenderer page={page} />);

    expect(container.textContent).toContain('An *unfinished draft <script>alert(1)</script>');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('article')?.dataset.rulebookPageId).toBe('RULE');
  });

  it('renders a standard placeholder when an Asset is missing', () => {
    const document: RulebookRenderPreviewDocumentV1 = createRulebookRenderDocumentFixture();
    const block = document.pagesById.RULE!.regions[1]!.blocks[0]!;
    if (block.kind !== 'asset-figure') {
      throw new Error('Expected the ASST fixture to be an Asset figure Block');
    }
    block.asset = { status: 'unavailable', assetId: 'Storm marker' };
    const { container } = render(<RulebookPageRenderer page={document.pagesById.RULE!} />);

    expect(container.querySelector('[aria-label="Referenced Asset is unavailable"]')).not.toBeNull();
  });
});
