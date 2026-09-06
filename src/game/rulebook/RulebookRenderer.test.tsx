// @vitest-environment jsdom

import { rulebookLayoutCatalogue } from '@shared/rulebooks/contents';
import type { RulebookRenderPreviewDocumentV1 } from '@shared/rulebooks/renderDocument';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RulebookBlockCanvas } from './RulebookBlockRenderer';
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

  it('can replace Block bodies without changing the Page layout', () => {
    const document = createRulebookRenderDocumentFixture();
    const page = document.pagesById.RULE!;
    const blockCount = page.regions.reduce((total, region) => total + region.blocks.length, 0);
    const Placeholder = ({ block }: { block: { id: string } }) => <div data-placeholder-block={block.id} />;
    const { container } = render(<RulebookPageRenderer blockRenderer={Placeholder} page={page} />);

    expect(container.querySelector('article')?.dataset.rulebookLayout).toBe('rules-page');
    expect(container.querySelectorAll('[data-placeholder-block]')).toHaveLength(blockCount);
  });

  it('renders one Block on its own canvas without Page layout', () => {
    const document = createRulebookRenderDocumentFixture();
    const block = document.pagesById.RULE!.regions[0]!.blocks[1]!;
    const { container } = render(<RulebookBlockCanvas block={block} />);

    expect(container.querySelector('[data-rulebook-block-canvas]')).not.toBeNull();
    expect(container.querySelector(`[data-rulebook-block-id="${block.id}"]`)).not.toBeNull();
    expect(container.querySelector('article')).toBeNull();
    expect(container.querySelector('h1, h2')).toBeNull();
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
