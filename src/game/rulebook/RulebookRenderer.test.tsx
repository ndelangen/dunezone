// @vitest-environment jsdom

import { getRulebookLayout } from '@shared/rulebooks/contents';
import type {
  RulebookRenderBlockV1,
  RulebookRenderPreviewDocumentV1,
  RulebookRenderSourceV1,
} from '@shared/rulebooks/renderDocument';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RulebookBlockCanvas } from './RulebookBlockRenderer';
import { createCataloguePage } from './RulebookCatalogue.stories.fixture';
import { createImageCoverPage } from './RulebookCovers.stories.fixture';
import { liveReferenceBlocks } from './RulebookLiveReferences.stories.fixture';
import { RulebookDocumentRenderer, RulebookPageRenderer } from './RulebookRenderer';
import { createRulebookRenderDocumentFixture } from './RulebookRenderer.stories.fixture';

describe('Rulebook renderer', () => {
  it('keeps a full component image address and reference identity while its caption stays authored', () => {
    const source = {
      status: 'ready',
      name: 'Duncan Idaho',
      imageUrl: '/published/faction-leader/faction/member',
      width: 600,
      height: 600,
      reference: { kind: 'faction-member', factionId: 'faction', memberId: '00000000-0000-4000-8000-000000000001' },
    } satisfies RulebookRenderSourceV1;
    const block: Extract<RulebookRenderBlockV1, { kind: 'referenced-illustration' }> = {
      id: 'ILLU',
      kind: 'referenced-illustration',
      source,
      caption: 'Choose this Leader for your battle plan.',
    };
    const { container, rerender } = render(<RulebookBlockCanvas block={block} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(source.imageUrl);
    expect(container.querySelector('[data-member-id]')?.getAttribute('data-member-id')).toBe(source.reference.memberId);
    rerender(
      <RulebookBlockCanvas block={{ ...block, source: { status: 'unavailable', reference: source.reference } }} />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-member-id]')?.getAttribute('data-member-id')).toBe(source.reference.memberId);
    expect(container.textContent).toContain(block.caption);
    expect(container.textContent).toContain('Source unavailable');
  });

  it('renders every inventory entry in order, retaining quantities and prose for unavailable sources', () => {
    const block = liveReferenceBlocks()[1]!;
    if (block.kind !== 'illustrated-inventory') {
      throw new Error('Expected the inventory fixture');
    }
    const { container, rerender } = render(<RulebookBlockCanvas block={block} />);
    const itemIds = () =>
      [...container.querySelectorAll('[data-rulebook-item-id]')].map((item) =>
        item.getAttribute('data-rulebook-item-id')
      );
    expect(itemIds()).toEqual(['STOR', 'LOST']);
    expect(container.querySelector('[data-rulebook-item-id="LOST"]')?.textContent).toContain('Quantity: 0');
    expect(container.querySelector('[data-rulebook-item-id="LOST"]')?.textContent).toContain(
      'This explanation remains available'
    );
    rerender(<RulebookBlockCanvas block={{ ...block, items: [...block.items].reverse() }} />);
    expect(itemIds()).toEqual(['LOST', 'STOR']);
    expect(container.querySelector('[data-rulebook-item-id="STOR"]')?.textContent).toContain('Storm marker');
  });

  it('renders current faction identity and roster values without replacing the authored introduction', () => {
    const member = (memberId: string, name: string): RulebookRenderSourceV1 => ({
      status: 'ready',
      reference: { kind: 'faction-member', factionId: 'atreides', memberId },
      name,
      imageUrl: `/published/faction-leader/atreides/${memberId}`,
    });
    const firstId = '00000000-0000-4000-8000-000000000001';
    const secondId = '00000000-0000-4000-8000-000000000002';
    const faction = {
      status: 'ready' as const,
      factionId: 'atreides',
      name: 'Atreides',
      color: '#3e6337',
      emblemUrl: '/vector/logo/atreides.svg',
      leaders: [member(firstId, 'Duncan'), member(secondId, 'Gurney')],
    };
    const block: Extract<RulebookRenderBlockV1, { kind: 'faction-introduction' }> = {
      id: 'FACT',
      kind: 'faction-introduction',
      faction,
      text: 'Keep your plans flexible.',
    };
    const { container, rerender } = render(<RulebookBlockCanvas block={block} />);
    expect(container.querySelector('h3')?.textContent).toBe('Atreides');
    rerender(
      <RulebookBlockCanvas
        block={{
          ...block,
          faction: {
            ...faction,
            name: 'House Atreides',
            leaders: [member(secondId, 'Gurney Halleck'), member(firstId, 'Duncan Idaho')],
          },
        }}
      />
    );
    expect(container.querySelector('h3')?.textContent).toBe('House Atreides');
    expect(
      [...container.querySelectorAll('[data-member-id]')].map((element) => element.getAttribute('data-member-id'))
    ).toEqual([secondId, firstId]);
    expect(container.textContent).toContain('Gurney Halleck');
    expect(container.textContent).toContain('Keep your plans flexible.');
    rerender(<RulebookBlockCanvas block={{ ...block, faction: { status: 'unavailable', factionId: 'atreides' } }} />);
    expect(container.textContent).toContain('Faction unavailable');
    expect(container.textContent).toContain('Keep your plans flexible.');
  });

  it('renders final regions in visible order without printing their editor labels', () => {
    const page = createCataloguePage('wide-narrow', { widePosition: 'right', empty: true });
    const { container } = render(<RulebookPageRenderer page={page} />);
    expect(
      [...container.querySelectorAll<HTMLElement>('[data-rulebook-region]')].map(
        (region) => region.dataset.rulebookRegion
      )
    ).toEqual(['narrow', 'wide']);
    expect(container.querySelectorAll('h2')).toHaveLength(0);
    expect(container.querySelectorAll('[data-rulebook-region]')).toHaveLength(2);
  });

  it('derives the outer rail order from the full Page number', () => {
    const page = createCataloguePage('outer-rail');
    const { container, rerender } = render(<RulebookPageRenderer page={page} pageNumber={8} />);
    const keys = () =>
      [...container.querySelectorAll<HTMLElement>('[data-rulebook-region]')].map(
        (region) => region.dataset.rulebookRegion
      );
    expect(keys()).toEqual(['rail', 'column1', 'column2']);
    rerender(<RulebookPageRenderer page={page} pageNumber={9} />);
    expect(keys()).toEqual(['column1', 'column2', 'rail']);
  });

  it('keeps a hidden heading in the Page identity without printing it', () => {
    const { container } = render(
      <RulebookPageRenderer page={createCataloguePage('single-column', { showHeading: false, empty: true })} />
    );
    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('article')?.getAttribute('aria-label')).toBe('Rulebook page: Movement');
  });

  it('counts the Cover in document order without a folio or Block regions', () => {
    const cover = createCataloguePage('cover');
    const next = createCataloguePage('single-column');
    const document: RulebookRenderPreviewDocumentV1 = {
      schemaVersion: 1,
      settings: { size: 'tall', design: 'illustrated' },
      pageOrder: ['CVER', 'NEXT'],
      pagesById: { CVER: { ...cover, id: 'CVER', anchor: 'cover' }, NEXT: { ...next, id: 'NEXT', anchor: 'next' } },
    };
    const { container } = render(<RulebookDocumentRenderer document={document} />);
    const pages = [...container.querySelectorAll('article')];
    expect(pages[0]?.querySelector('[data-rulebook-region]')).toBeNull();
    expect(pages[0]?.querySelector('[aria-label="Page 1"]')).toBeNull();
    expect(pages[0]?.querySelector('[data-asset-id="storm"]')?.getAttribute('alt')).toBe('Storm marker');
    expect(pages[1]?.querySelector('[aria-label="Page 2"]')?.textContent).toBe('2');
  });

  it('renders a cover background and logo with independent heading and subtitle visibility', () => {
    const page = createImageCoverPage();
    const { container, rerender } = render(<RulebookPageRenderer page={page} />);
    expect(container.querySelector('.rulebookCoverBackground')?.getAttribute('src')).toBe('/page/cover-a.svg');
    expect(container.querySelector('img[alt="Dune"]')?.getAttribute('src')).toBe('/page/dune_logo.svg');
    expect(container.querySelector('.rulebookPageArtwork')).toBeNull();
    expect(container.querySelector('.rulebookPageFolio')).toBeNull();
    expect(container.querySelector('h1')?.textContent).toBe('Dreamrules');
    expect(container.textContent).toContain('A guide to Arrakis');
    page.showHeading = false;
    page.controlValues.cover.showDuneLogo = false;
    page.controlValues.cover.showSubtitle = false;
    rerender(<RulebookPageRenderer page={page} />);
    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelector('img[alt="Dune"]')).toBeNull();
    expect(container.textContent).not.toContain('A guide to Arrakis');
    expect(container.querySelector('.rulebookCoverBackground')).not.toBeNull();
    page.controlValues.cover.backgroundImageUrl = '';
    page.controlValues.cover.showDuneLogo = true;
    rerender(<RulebookPageRenderer page={page} />);
    expect(container.querySelector('.rulebookCoverBackground')).toBeNull();
    expect(container.querySelector('img[alt="Dune"]')).not.toBeNull();
  });

  it('keeps legacy cover artwork while allowing its title and subtitle to be hidden', () => {
    const page = createCataloguePage('cover');
    if (page.layoutId !== 'cover') {
      throw new Error('Expected a Cover');
    }
    page.showHeading = false;
    page.controlValues.cover.showSubtitle = false;
    const { container } = render(<RulebookPageRenderer page={page} />);
    expect(container.querySelector('h1')).toBeNull();
    expect(container.textContent).not.toContain('A guide to Arrakis');
    expect(container.querySelector('[data-asset-id="storm"]')).not.toBeNull();
    expect(container.querySelector('.rulebookPageArtwork')).not.toBeNull();
  });

  it('toggles the Dune logo without replacing legacy cover artwork', () => {
    const page = createCataloguePage('cover');
    if (page.layoutId !== 'cover') {
      throw new Error('Expected a Cover');
    }
    const { container, rerender } = render(<RulebookPageRenderer page={page} />);
    for (const showDuneLogo of [true, false, true]) {
      page.controlValues.cover.showDuneLogo = showDuneLogo;
      rerender(<RulebookPageRenderer page={page} />);
      expect(container.querySelector('[data-asset-id="storm"]')?.getAttribute('src')).toBe('/page/storm.svg');
      expect(container.querySelector('.rulebookPageArtwork')).not.toBeNull();
      expect(container.querySelector('img[alt="Dune"]') !== null).toBe(showDuneLogo);
    }
  });

  it('renders all written-rule families with stable list item identities and live faction styling', () => {
    const { container } = render(
      <RulebookPageRenderer page={createCataloguePage('single-column', { written: true })} />
    );
    expect(container.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(7);
    expect(container.querySelector('[data-faction-id="atreides"]')?.getAttribute('title')).toBe('Atreides');
    expect(
      [...container.querySelectorAll('ol > li')].map((item) => item.getAttribute('data-rulebook-item-id'))
    ).toEqual(['choose', 'move']);
    expect(container.querySelector('[data-rulebook-block-id="TEXT"] h3')?.textContent).toBe('Moving your forces');
    expect(container.querySelector('blockquote')?.textContent).toBe('Plans within plans.');
    expect(container.querySelector('[data-rulebook-block-id="QUTE"]')?.textContent).toContain('A Mentat reminder');
    expect(container.querySelector('[data-rulebook-block-id="QUES"]')?.textContent).toContain('Answer:');
  });

  it.each([
    { color: '#3e6337', ink: 'rgb(255, 255, 255)' },
    { color: '#ffe7aa', ink: 'rgb(33, 23, 15)' },
  ])('keeps a faction heading legible against $color', ({ color, ink }) => {
    const { container } = render(
      <RulebookBlockCanvas
        block={{
          id: 'HEAD',
          kind: 'section-heading',
          title: 'Advantages',
          faction: { status: 'ready', factionId: 'faction', name: 'Faction', color },
        }}
      />
    );
    expect(container.querySelector<HTMLElement>('h2')?.style.color).toBe(ink);
  });

  it('keeps the heading and exposes an unavailable faction association', () => {
    const { container } = render(
      <RulebookBlockCanvas
        block={{
          id: 'HEAD',
          kind: 'section-heading',
          title: 'Movement',
          faction: { status: 'unavailable', factionId: 'gone' },
        }}
      />
    );
    expect(container.querySelector('h2')?.textContent).toBe('Movement Faction unavailable');
  });

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
      document.pageOrder.flatMap((id) =>
        getRulebookLayout(document.pagesById[id]!.layoutId).regions.flatMap((region) =>
          region.kind === 'block' ? [region.label] : []
        )
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

  it('keeps full-document folios and alternating artwork in a publication batch', () => {
    const document = createRulebookRenderDocumentFixture();
    document.settings = { size: 'square', design: 'illustrated' };
    document.pageOrder = ['RULE', 'REFS'];
    const { container } = render(<RulebookDocumentRenderer document={document} pageOffset={5} />);
    const pages = [...container.querySelectorAll<HTMLElement>('[data-rulebook-page]')];

    expect(pages.map((page) => page.dataset.rulebookPageNumber)).toEqual(['6', '7']);
    expect(pages.map((page) => page.dataset.rulebookPageSide)).toEqual(['left', 'right']);
    expect(pages.map((page) => page.dataset.rulebookSize)).toEqual(['square', 'square']);
    expect(pages.map((page) => page.querySelector('[aria-label^="Page "]')?.textContent)).toEqual(['6', '7']);
    expect(container.querySelectorAll('img[alt=""]')).toHaveLength(2);
  });

  it('uses the chosen Design and full position for an independent Page', () => {
    const document = createRulebookRenderDocumentFixture();
    const { container } = render(
      <RulebookPageRenderer
        page={document.pagesById.RULE!}
        settings={{ size: 'tall', design: 'restrained' }}
        pageNumber={12}
      />
    );
    const page = container.querySelector('article');

    expect(page?.dataset.rulebookSize).toBe('tall');
    expect(page?.dataset.rulebookDesign).toBe('restrained');
    expect(page?.dataset.rulebookPageSide).toBe('left');
    expect(container.querySelector('[aria-label="Page 12"]')?.textContent).toBe('12');
    expect(container.querySelector('img[alt=""]')).toBeNull();
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
