import { testingPreview } from '@sb/preview';
import { getRulebookSize } from '@shared/rulebooks/settings';
import type { RulebookSettings } from '@shared/rulebooks/settings';
import { expect } from 'storybook/test';

import { rulebookDesignsMeta } from './RulebookDesigns.stories.fixture';

const meta = testingPreview.meta({ ...rulebookDesignsMeta, title: 'Document/Sizes and styles' });

async function expectFacingPages({ canvasElement }: { canvasElement: HTMLElement }) {
  const pages = [...canvasElement.querySelectorAll<HTMLElement>('[data-rulebook-page]')];
  await expect(pages.map((page) => page.dataset.rulebookPageNumber)).toEqual(['2', '3']);
  await expect(pages.map((page) => page.dataset.rulebookPageSide)).toEqual(['left', 'right']);
  for (const page of pages) {
    const dimensions = getRulebookSize(page.dataset.rulebookSize as RulebookSettings['size']);
    const actual = page.getBoundingClientRect();
    await expect(actual.width / actual.height).toBeCloseTo(dimensions.widthMm / dimensions.heightMm, 2);
    const content = page.querySelector<HTMLElement>('.rulebookPageContent')!;
    const clearanceMm =
      (Number.parseFloat(getComputedStyle(content).paddingBottom) / actual.width) * dimensions.widthMm;
    const expectedClearanceMm =
      page.dataset.rulebookDesign === 'restrained' ? 17 : dimensions.id === 'tall' ? 25.7375 : 35;
    await expect(clearanceMm).toBeCloseTo(expectedClearanceMm, 1);
    const images = page.querySelectorAll('.rulebookPageArtwork img');
    await expect(images).toHaveLength(page.dataset.rulebookDesign === 'illustrated' ? 1 : 0);
  }
}

export const A4Illustrated = meta.story({ args: { size: 'a4', design: 'illustrated' }, play: expectFacingPages });

export const A4Restrained = meta.story({ args: { size: 'a4', design: 'restrained' }, play: expectFacingPages });

export const SquareIllustrated = meta.story({
  args: { size: 'square', design: 'illustrated' },
  play: expectFacingPages,
});

export const SquareRestrained = meta.story({
  args: { size: 'square', design: 'restrained' },
  play: expectFacingPages,
});

export const TallIllustrated = meta.story({ args: { size: 'tall', design: 'illustrated' }, play: expectFacingPages });

export const TallRestrained = meta.story({
  args: { size: 'tall', design: 'restrained' },
  play: expectFacingPages,
});
