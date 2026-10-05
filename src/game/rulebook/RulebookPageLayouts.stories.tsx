import preview from '@sb/preview';
import { expect, waitFor } from 'storybook/test';

import { battleSequencePage, deathPanel, presciencePanel, revealPanel } from './RulebookBattlePlan.stories.fixture';
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
      verifyGeometry(host, item);
      const before = regionRects(host).map(({ rect }) => ({ width: rect.width, height: rect.height }));
      host.style.width = '180px';
      await waitFor(() => expect(host.getBoundingClientRect().width).toBe(180));
      verifyGeometry(host, item);
      regionRects(host).forEach(({ rect }, regionIndex) => {
        expect(rect.width / before[regionIndex]!.width).toBeCloseTo(0.6, 2);
        expect(rect.height / before[regionIndex]!.height).toBeCloseTo(0.6, 2);
      });
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
  play: ({ canvasElement }) => {
    expect(canvasElement.querySelector('h1')).toBeNull();
    expect(canvasElement.querySelectorAll('[data-rulebook-region]')).toHaveLength(3);
    expect(canvasElement.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(0);
    for (const { key, rect } of regionRects(canvasElement)) {
      expect(rect.width).toBeGreaterThan(0);
      if (key === 'band') expect(rect.height).toBe(0);
      else expect(rect.height).toBeGreaterThan(0);
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
  play: ({ canvasElement }) => {
    const regions = [...canvasElement.querySelectorAll<HTMLElement>('[data-rulebook-region]')];
    expect(regions[0]!.scrollHeight).toBeGreaterThan(regions[0]!.clientHeight);
    expect(getComputedStyle(regions[0]!).overflow).toBe('clip');
    expect(Number.parseFloat(getComputedStyle(regions[0]!).overflowClipMargin)).toBeGreaterThan(0);
    expect(regions[1]!.textContent).toBe('Column 2');
  },
});

export const StepByStep = meta.story({
  render: () => (
    <div style={{ width: 'min(960px, 100%)' }}>
      <RulebookPageRenderer
        page={battleSequencePage([presciencePanel, revealPanel, deathPanel])}
        settings={{ size: 'square', design: 'illustrated' }}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const region = canvasElement.querySelector<HTMLElement>('[data-rulebook-region]')!;
    expect(region.scrollHeight).toBeLessThanOrEqual(region.clientHeight + 1);
    expect(region.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(3);
  },
});

export const HeadingConsistency = meta.story({
  render: () => <HeadingMatrix />,
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    verifyHeadingConsistency(canvasElement);
  },
});

export const PairedRows = meta.story({
  render: () => (
    <div style={{ width: 'min(960px, 100%)' }}>
      <RulebookPageRenderer
        page={createCataloguePage('paired-rows')}
        settings={{ size: 'square', design: 'illustrated' }}
      />
    </div>
  ),
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
