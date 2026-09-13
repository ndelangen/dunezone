import preview from '@sb/preview';
import { getRulebookSize, rulebookDesignCatalogue, rulebookSizeCatalogue } from '@shared/rulebooks/settings';
import type { RulebookSettings } from '@shared/rulebooks/settings';
import { expect } from 'storybook/test';

import { createImageCoverPage } from './RulebookCovers.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

function CoverExample({
  size,
  design,
  backgroundImageUrl = '/page/cover-a.svg',
  showDuneLogo = true,
  showHeading = true,
  showSubtitle = true,
}: RulebookSettings & {
  backgroundImageUrl?: string;
  showDuneLogo?: boolean;
  showHeading?: boolean;
  showSubtitle?: boolean;
}) {
  const page = createImageCoverPage({ backgroundImageUrl, showDuneLogo, showSubtitle });
  page.showHeading = showHeading;
  return (
    <div style={{ width: `min(100%, ${getRulebookSize(size).widthMm}mm)` }}>
      <RulebookPageRenderer page={page} settings={{ size, design }} />
    </div>
  );
}

const meta = preview.meta({
  title: 'Covers',
  component: CoverExample,
  args: { size: 'a4' as const, design: 'illustrated' as const },
  argTypes: {
    size: { control: 'radio', options: rulebookSizeCatalogue.map(({ id }) => id) },
    design: { control: 'radio', options: rulebookDesignCatalogue.map(({ id }) => id) },
  },
  parameters: { layout: 'fullscreen' },
});

async function expectCoverBounds({ canvasElement }: { canvasElement: HTMLElement }) {
  await document.fonts.ready;
  await Promise.all([...canvasElement.querySelectorAll<HTMLImageElement>('img')].map((image) => image.decode()));
  const pages = [...canvasElement.querySelectorAll<HTMLElement>('[data-rulebook-page]')];
  expect(pages.length).toBeGreaterThan(0);
  for (const page of pages) {
    const dimensions = getRulebookSize(page.dataset.rulebookSize as RulebookSettings['size']);
    const bounds = page.getBoundingClientRect();
    expect(bounds.width / bounds.height).toBeCloseTo(dimensions.widthMm / dimensions.heightMm, 2);
    expect(page.querySelector('.rulebookPageFolio')).toBeNull();
    expect(page.querySelector('.rulebookPageArtwork')).toBeNull();
    expect(getComputedStyle(page, '::after').content).toBe('none');
    expect(getComputedStyle(page.querySelector('.rulebookPageContent')!).padding).toBe('0px');
    const background = page.querySelector('.rulebookCoverBackground');
    if (background) {
      const imageBounds = background.getBoundingClientRect();
      expect(imageBounds.x).toBeCloseTo(bounds.x, 1);
      expect(imageBounds.y).toBeCloseTo(bounds.y, 1);
      expect(imageBounds.width).toBeCloseTo(bounds.width, 1);
      expect(imageBounds.height).toBeCloseTo(bounds.height, 1);
      expect(getComputedStyle(background).objectFit).toBe('cover');
    }
  }
}

export const BackgroundImage = meta.story({ play: expectCoverBounds });
export const WithoutLogo = meta.story({ args: { showDuneLogo: false }, play: expectCoverBounds });
export const LogoOnBlankCover = meta.story({ args: { backgroundImageUrl: '' }, play: expectCoverBounds });
export const ArtworkOnly = meta.story({
  args: { showDuneLogo: false, showHeading: false, showSubtitle: false },
  play: expectCoverBounds,
});
export const SizeAndDesignMatrix = meta.story({
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem' }}>
      {rulebookDesignCatalogue.flatMap((design) =>
        rulebookSizeCatalogue.map((size) => (
          <CoverExample size={size.id} design={design.id} key={`${design.id}-${size.id}`} />
        ))
      )}
    </div>
  ),
  play: expectCoverBounds,
});
