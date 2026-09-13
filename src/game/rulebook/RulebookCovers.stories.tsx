import preview from '@sb/preview';
import { getRulebookCoverPreset } from '@shared/rulebooks/coverPresets';
import type { RulebookRenderPageByLayoutV1 } from '@shared/rulebooks/renderDocument';
import { getRulebookSize, rulebookDesignCatalogue, rulebookSizeCatalogue } from '@shared/rulebooks/settings';
import type { RulebookSettings } from '@shared/rulebooks/settings';
import { expect } from 'storybook/test';

import { createCoverFooter, createImageCoverPage } from './RulebookCovers.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

function CoverExample({
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

async function expectFooterBounds({ canvasElement }: { canvasElement: HTMLElement }) {
  await document.fonts.ready;
  await Promise.all([...canvasElement.querySelectorAll<HTMLImageElement>('img')].map((image) => image.decode()));
  for (const page of canvasElement.querySelectorAll<HTMLElement>('[data-rulebook-page]')) {
    const dimensions = getRulebookSize(page.dataset.rulebookSize as RulebookSettings['size']);
    const bounds = page.getBoundingClientRect();
    const footer = page.querySelector<HTMLElement>('.rulebookCoverFooter')!;
    const footerBounds = footer.getBoundingClientRect();
    expect(bounds.width / bounds.height).toBeCloseTo(dimensions.widthMm / dimensions.heightMm, 2);
    expect(footerBounds.x).toBeCloseTo(bounds.x, 1);
    expect(footerBounds.width).toBeCloseTo(bounds.width, 1);
    expect(footerBounds.bottom).toBeCloseTo(bounds.bottom, 1);
    expect(footerBounds.height).toBeCloseTo((bounds.width / dimensions.widthMm) * 46, 0);
    expect(page.querySelector('.rulebookPageFolio')).toBeNull();
    for (const text of page.querySelectorAll<HTMLElement>(
      '.rulebookCoverTitles, .rulebookCover > header, .rulebookCover > .rulebookCoverSupportingText'
    )) {
      expect(text.getBoundingClientRect().bottom).toBeLessThan(footerBounds.top);
    }
    const title = footer.querySelector<HTMLElement>('.rulebookCoverFooterTitle')!;
    const label = footer.querySelector<HTMLElement>('.rulebookCoverFooterLabel')!;
    expect(getComputedStyle(title).whiteSpace).toBe('pre-line');
    expect(title.getBoundingClientRect().bottom).toBeLessThanOrEqual(label.getBoundingClientRect().top);
    for (const field of [title, label]) {
      expect(field.scrollHeight).toBeLessThanOrEqual(field.clientHeight + 1);
      expect(field.scrollWidth).toBeLessThanOrEqual(field.clientWidth + 1);
    }
    for (const emblem of footer.querySelectorAll('.rulebookCoverFooterEmblem')) {
      const emblemBounds = emblem.getBoundingClientRect();
      expect(emblemBounds.top).toBeGreaterThanOrEqual(footerBounds.top);
      expect(emblemBounds.bottom).toBeLessThanOrEqual(label.getBoundingClientRect().top);
    }
  }
}

export const Footer = meta.story({
  args: {
    backgroundImageUrl: getRulebookCoverPreset('sandworm').imageUrl,
    footer: createCoverFooter(),
    showHeading: false,
    showSubtitle: false,
  },
  play: expectFooterBounds,
});

export const FooterWithoutFactions = meta.story({
  args: {
    footer: createCoverFooter({ leftFaction: { status: 'unselected' }, rightFaction: { status: 'unselected' } }),
  },
  play: expectFooterBounds,
});

export const FooterUnavailableFaction = meta.story({
  args: { footer: createCoverFooter({ rightFaction: { status: 'unavailable', factionId: 'richese' } }) },
  play: expectFooterBounds,
});

export const LegacyCoverWithFooter = meta.story({
  args: {
    footer: createCoverFooter(),
    legacyArtwork: true,
    showDuneLogo: false,
    supportingText: 'Rules and reference',
  },
  play: expectFooterBounds,
});

export const FooterSizeAndDesignMatrix = meta.story({
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem' }}>
      {rulebookDesignCatalogue.flatMap((design) =>
        rulebookSizeCatalogue.map((size) => (
          <CoverExample
            size={size.id}
            design={design.id}
            key={`${design.id}-${size.id}`}
            title={'Dune\nDreamrules'}
            supportingText="Rules and reference"
            footer={createCoverFooter()}
          />
        ))
      )}
    </div>
  ),
  play: async (context) => {
    await expectCoverBounds(context);
    await expectFooterBounds(context);
  },
});

export const FooterLongTitle = meta.story({
  args: {
    size: 'tall',
    footer: createCoverFooter({ title: 'THE GREAT HOUSES\nOF THE IMPERIUM', label: 'RULES & REFERENCE' }),
  },
  play: expectFooterBounds,
});
