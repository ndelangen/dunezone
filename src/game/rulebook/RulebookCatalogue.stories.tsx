import preview from '@sb/preview';
import { getRulebookLayoutsForSize, getRulebookRegionOrder } from '@shared/rulebooks/contents';
import type { RulebookAuthoredLayoutId } from '@shared/rulebooks/contents';
import { getRulebookSize } from '@shared/rulebooks/settings';
import type { RulebookSettings } from '@shared/rulebooks/settings';
import { expect, waitFor } from 'storybook/test';

import { createCataloguePage } from './RulebookCatalogue.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

const meta = preview.meta({ title: 'Catalogue', parameters: { layout: 'fullscreen' } });

type GeometryCase = {
  layoutId: RulebookAuthoredLayoutId;
  size: RulebookSettings['size'];
  design: RulebookSettings['design'];
  pageNumber: number;
  widePosition?: 'left' | 'right';
  bandPosition?: 'top' | 'bottom';
};

const geometryCases: GeometryCase[] = (['restrained', 'illustrated'] as const).flatMap((design) => [
  ...(['square', 'a4', 'tall'] as const).flatMap((size) =>
    getRulebookLayoutsForSize(size).map(({ id }) => ({ layoutId: id, size, design, pageNumber: 1 }))
  ),
  ...(['square', 'a4'] as const).flatMap((size): GeometryCase[] => [
    { layoutId: 'wide-narrow', size, design, pageNumber: 2, widePosition: 'right' },
    { layoutId: 'outer-rail', size, design, pageNumber: 2 },
    { layoutId: 'band-columns', size, design, pageNumber: 2, bandPosition: 'bottom' },
  ]),
]);

function GeometryMatrix() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'start', gap: 24, padding: 24 }}>
      <style>
        {
          '[data-geometry-case] [data-rulebook-region] { outline: 1px dashed #b3a574; outline-offset: -1px; background: rgb(179 165 116 / 8%); }'
        }
      </style>
      {geometryCases.map((item, index) => {
        const page = createCataloguePage(item.layoutId, { ...item, written: item.layoutId !== 'cover' });
        return (
          <div key={index} data-geometry-case={index} style={{ width: 300 }}>
            <p>
              {getRulebookSize(item.size).label}: {item.layoutId} / {item.design}
              {item.pageNumber === 2 ? ' / alternate placement' : ''}
            </p>
            <RulebookPageRenderer
              page={{ ...page, anchor: `geometry-${index}` }}
              settings={{ size: item.size, design: item.design }}
              pageNumber={item.pageNumber}
            />
          </div>
        );
      })}
    </div>
  );
}

function regionRects(host: HTMLElement) {
  return [...host.querySelectorAll<HTMLElement>('[data-rulebook-region]')].map((element) => ({
    key: element.dataset.rulebookRegion!,
    rect: element.getBoundingClientRect(),
  }));
}

function verifyGeometry(host: HTMLElement, item: GeometryCase) {
  const page = host.querySelector<HTMLElement>('[data-rulebook-page]')!;
  const pageRect = page.getBoundingClientRect();
  const size = getRulebookSize(item.size);
  expect(pageRect.width / pageRect.height).toBeCloseTo(size.widthMm / size.heightMm, 2);
  const regions = regionRects(host);
  expect(regions.map(({ key }) => key)).toEqual(
    getRulebookRegionOrder(createCataloguePage(item.layoutId, item), item.pageNumber)
  );
  for (const { rect } of regions) {
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(rect.left).toBeGreaterThanOrEqual(pageRect.left);
    expect(rect.right).toBeLessThanOrEqual(pageRect.right);
    expect(rect.bottom).toBeLessThanOrEqual(pageRect.bottom);
  }
  const byKey = Object.fromEntries(regions.map(({ key, rect }) => [key, rect]));
  if (item.layoutId === 'wide-narrow') {
    expect(byKey.wide!.width / byKey.narrow!.width).toBeCloseTo(2, 1);
    expect(byKey.wide!.top).toBeCloseTo(byKey.narrow!.top, 1);
    expect(byKey.wide!.left < byKey.narrow!.left).toBe(item.widePosition !== 'right');
  }
  if (item.layoutId === 'two-columns' || item.layoutId === 'outer-rail' || item.layoutId === 'band-columns') {
    expect(byKey.column1!.width).toBeCloseTo(byKey.column2!.width, 1);
    expect(byKey.column1!.top).toBeCloseTo(byKey.column2!.top, 1);
    expect(byKey.column1!.right).toBeLessThan(byKey.column2!.left);
  }
  if (item.layoutId === 'outer-rail') {
    expect(byKey.rail!.left < byKey.column1!.left).toBe(item.pageNumber % 2 === 0);
  }
  if (item.layoutId === 'band-columns') {
    expect(byKey.band!.top < byKey.column1!.top).toBe(item.bandPosition !== 'bottom');
    expect(byKey.band!.width).toBeGreaterThan(byKey.column1!.width * 2);
  }
}

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

export const WrittenRules = meta.story({
  render: () => (
    <div style={{ width: 'min(46rem, 100%)' }}>
      <RulebookPageRenderer page={createCataloguePage('two-columns', { written: true })} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    expect(canvasElement.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(7);
    expect(canvasElement.querySelector('ol > li strong')?.textContent).toBe('Choose a group');
    expect(canvasElement.querySelector('[data-faction-id="atreides"]')?.textContent).toBe('Shipment and movement');
    expect(canvasElement.querySelectorAll('blockquote')).toHaveLength(1);
    for (const region of canvasElement.querySelectorAll<HTMLElement>('[data-rulebook-region]')) {
      expect(region.scrollHeight).toBeLessThanOrEqual(region.clientHeight + 1);
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
    for (const { rect } of regionRects(canvasElement)) {
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
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
    expect(getComputedStyle(regions[0]!).overflow).toBe('hidden');
    expect(regions[1]!.textContent).toBe('Column 2');
  },
});
