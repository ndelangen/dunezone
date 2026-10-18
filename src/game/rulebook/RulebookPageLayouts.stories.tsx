import preview from '@sb/preview';
import { expect, waitFor } from 'storybook/test';

import { geometryCases, GeometryMatrix, regionRects, verifyGeometry } from './RulebookCatalogue.shared.stories.fixture';
import { createCataloguePage } from './RulebookCatalogue.stories.fixture';
import { HeadingMatrix, verifyHeadingConsistency } from './RulebookHeading.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

const meta = preview.meta({ title: 'Page/Layouts/Rendered', parameters: { layout: 'fullscreen' } });

export const FixedGridMatrix = meta.story({
  render: () => <GeometryMatrix />,
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    for (const [index, host] of [...canvasElement.querySelectorAll<HTMLElement>('[data-geometry-case]')].entries()) {
      const item = geometryCases[index]!;
      await verifyGeometry(host, item);
      const before = regionRects(host).map(({ rect }) => ({ width: rect.width, height: rect.height }));
      host.style.width = '180px';
      await waitFor(() => expect(host.getBoundingClientRect().width).toBe(180));
      await verifyGeometry(host, item);
      for (const [regionIndex, { rect }] of regionRects(host).entries()) {
        await expect(rect.width / before[regionIndex]!.width).toBeCloseTo(0.6, 2);
        await expect(rect.height / before[regionIndex]!.height).toBeCloseTo(0.6, 2);
      }
      host.style.width = '300px';
    }
  },
});

export const EmptyRegionsAndHiddenHeading = meta.story({
  render: () => (
    <div style={{ width: 'min(46rem, 100%)' }}>
      <RulebookPageRenderer page={createCataloguePage('band-columns', { empty: true, showHeading: false })} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('h1')).toBeNull();
    await expect(canvasElement.querySelectorAll('[data-rulebook-region]')).toHaveLength(3);
    await expect(canvasElement.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(0);
    for (const { key, rect } of regionRects(canvasElement)) {
      await expect(rect.width).toBeGreaterThan(0);
      if (key === 'band') {
        await expect(rect.height).toBe(0);
      } else {
        await expect(rect.height).toBeGreaterThan(0);
      }
    }
  },
});

export const ClippedRegion = meta.story({
  render: () => {
    const page = createCataloguePage('two-columns');
    page.regions[0]!.blocks = [{ id: 'LONG', kind: 'text', text: 'The storm moves across the board.\n\n'.repeat(100) }];
    return (
      <div style={{ width: 'min(46rem, 100%)' }}>
        <RulebookPageRenderer page={page} />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const regions = [...canvasElement.querySelectorAll<HTMLElement>('[data-rulebook-region]')];
    await expect(regions[0]!.scrollHeight).toBeGreaterThan(regions[0]!.clientHeight);
    await expect(getComputedStyle(regions[0]!).overflow).toBe('clip');
    await expect(Number.parseFloat(getComputedStyle(regions[0]!).overflowClipMargin)).toBeGreaterThan(0);
    await expect(regions[1]!.textContent).toBe('Column 2');
  },
});

export const HeadingConsistency = meta.story({
  render: () => <HeadingMatrix />,
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    await verifyHeadingConsistency(canvasElement);
  },
});

export const ContentWithBottomStrip = meta.story({
  render: () => (
    <div style={{ width: 'min(960px, 100%)' }}>
      <RulebookPageRenderer
        page={(() => {
          const page = createCataloguePage('content-strip');
          page.regions[1]!.blocks = ['First', 'Second', 'Third'].map((name, index) => ({
            id: `item-${index}`,
            kind: 'text',
            text: `${name} supporting block`,
          }));
          return page;
        })()}
        settings={{ size: 'square', design: 'illustrated' }}
      />
    </div>
  ),
});
