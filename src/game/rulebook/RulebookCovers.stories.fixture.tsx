import type { RulebookRenderPageByLayoutV1 } from '@shared/rulebooks/renderDocument';
import { getRulebookSize } from '@shared/rulebooks/settings';
import type { RulebookSettings } from '@shared/rulebooks/settings';
import { expect } from 'storybook/test';

import { factionTokenFixtures } from '../fixtures/factionTokens';
import { RulebookPageRenderer } from './RulebookRenderer';

type CoverFooter = NonNullable<RulebookRenderPageByLayoutV1<'cover'>['controlValues']['cover']['footer']>;

export function createCoverFooter(options: Partial<CoverFooter> = {}): CoverFooter {
  return {
    enabled: true,
    title: 'CHOAM &\nRICHESE',
    label: 'HOUSE EXPANSION',
    leftFaction: {
      status: 'ready',
      factionId: 'choam',
      name: 'CHOAM',
      color: '#e6bc65',
      emblemUrl: '/vector/logo/choam.svg',
      token: factionTokenFixtures.choam,
    },
    rightFaction: {
      status: 'ready',
      factionId: 'richese',
      name: 'Richese',
      color: '#7ec3de',
      emblemUrl: '/vector/logo/richese.svg',
      token: factionTokenFixtures.richese,
    },
    ...options,
  };
}

export function createImageCoverPage(
  options: Partial<RulebookRenderPageByLayoutV1<'cover'>['controlValues']['cover']> = {}
): RulebookRenderPageByLayoutV1<'cover'> {
  return {
    id: 'CVER',
    anchor: 'cover',
    title: 'Dreamrules',
    layoutId: 'cover',
    showHeading: true,
    controlValues: {
      cover: {
        artwork: { status: 'unselected' },
        backgroundImageUrl: '/page/cover-a.svg',
        showDuneLogo: true,
        showSubtitle: true,
        subtitle: 'A guide to Arrakis',
        supportingText: '',
        ...options,
      },
    },
    regions: [],
  };
}

export function CoverExample({
  size,
  design,
  backgroundImageUrl = '/page/cover-a.svg',
  showDuneLogo = true,
  showHeading = true,
  showSubtitle = true,
  title = 'Dreamrules',
  supportingText = '',
  footer,
  legacyArtwork = false,
}: RulebookSettings & {
  backgroundImageUrl?: string;
  showDuneLogo?: boolean;
  showHeading?: boolean;
  showSubtitle?: boolean;
  title?: string;
  supportingText?: string;
  footer?: RulebookRenderPageByLayoutV1<'cover'>['controlValues']['cover']['footer'];
  legacyArtwork?: boolean;
}) {
  const page = createImageCoverPage({
    backgroundImageUrl: legacyArtwork ? undefined : backgroundImageUrl,
    artwork: legacyArtwork
      ? { status: 'ready', assetId: 'storm', name: 'Storm marker', type: 'marker', imageUrl: '/page/storm.svg' }
      : { status: 'unselected' },
    showDuneLogo,
    showSubtitle,
    supportingText,
    footer,
  });
  page.title = title;
  page.showHeading = showHeading;
  return (
    <div style={{ width: `min(100%, ${getRulebookSize(size).widthMm}mm)` }}>
      <RulebookPageRenderer page={page} settings={{ size, design }} />
    </div>
  );
}

export async function expectCoverBounds({ canvasElement }: { canvasElement: HTMLElement }) {
  await document.fonts.ready;
  await Promise.all([...canvasElement.querySelectorAll<HTMLImageElement>('img')].map((image) => image.decode()));
  const pages = [...canvasElement.querySelectorAll<HTMLElement>('[data-rulebook-page]')];
  await expect(pages.length).toBeGreaterThan(0);
  for (const page of pages) {
    const dimensions = getRulebookSize(page.dataset.rulebookSize as RulebookSettings['size']);
    const bounds = page.getBoundingClientRect();
    await expect(bounds.width / bounds.height).toBeCloseTo(dimensions.widthMm / dimensions.heightMm, 2);
    await expect(page.querySelector('.rulebookPageFolio')).toBeNull();
    await expect(page.querySelector('.rulebookPageArtwork')).toBeNull();
    await expect(getComputedStyle(page, '::after').content).toBe('none');
    await expect(getComputedStyle(page.querySelector('.rulebookPageContent')!).padding).toBe('0px');
    const background = page.querySelector('.rulebookCoverBackground');
    if (background) {
      const imageBounds = background.getBoundingClientRect();
      await expect(imageBounds.x).toBeCloseTo(bounds.x, 1);
      await expect(imageBounds.y).toBeCloseTo(bounds.y, 1);
      await expect(imageBounds.width).toBeCloseTo(bounds.width, 1);
      await expect(imageBounds.height).toBeCloseTo(bounds.height, 1);
      await expect(getComputedStyle(background).objectFit).toBe('cover');
    }
  }
}
