import preview from '@sb/preview';
import { getRulebookCoverPreset } from '@shared/rulebooks/coverPresets';
import { getRulebookSize, rulebookDesignCatalogue, rulebookSizeCatalogue } from '@shared/rulebooks/settings';
import type { RulebookSettings } from '@shared/rulebooks/settings';
import { expect, within } from 'storybook/test';

import { createCoverFooter, CoverExample, expectCoverBounds } from './RulebookCovers.stories.fixture';

const meta = preview.meta({
  title: 'Page/Cover/Rendered',
  component: CoverExample,
  args: { size: 'a4' as const, design: 'illustrated' as const },
  argTypes: {
    size: { control: 'radio', options: rulebookSizeCatalogue.map(({ id }) => id) },
    design: { control: 'radio', options: rulebookDesignCatalogue.map(({ id }) => id) },
  },
  parameters: { layout: 'fullscreen' },
});

export const BackgroundImage = meta.story({ play: expectCoverBounds });
/** The titles stay when only the Dune logo is switched off. */
export const WithoutLogo = meta.story({
  args: { showDuneLogo: false },
  play: async (context) => {
    await expectCoverBounds(context);
    const canvas = within(context.canvasElement);
    await expect(canvas.queryByRole('img', { name: 'Dune' })).toBeNull();
    await expect(canvas.getByRole('heading', { name: context.args.title })).toBeVisible();
  },
});
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
    await expect(bounds.width / bounds.height).toBeCloseTo(dimensions.widthMm / dimensions.heightMm, 2);
    await expect(footerBounds.x).toBeCloseTo(bounds.x, 1);
    await expect(footerBounds.width).toBeCloseTo(bounds.width, 1);
    await expect(footerBounds.bottom).toBeCloseTo(bounds.bottom, 1);
    await expect(footerBounds.height).toBeCloseTo((bounds.width / dimensions.widthMm) * 46, 0);
    await expect(page.querySelector('.rulebookPageFolio')).toBeNull();
    for (const text of page.querySelectorAll<HTMLElement>(
      '.rulebookCoverTitles, .rulebookCover > header, .rulebookCover > .rulebookCoverSupportingText'
    )) {
      await expect(text.getBoundingClientRect().bottom).toBeLessThan(footerBounds.top);
    }
    const title = footer.querySelector<HTMLElement>('.rulebookCoverFooterTitle')!;
    const label = footer.querySelector<HTMLElement>('.rulebookCoverFooterLabel')!;
    await expect(getComputedStyle(title).whiteSpace).toBe('pre-line');
    await expect(title.getBoundingClientRect().bottom).toBeLessThanOrEqual(label.getBoundingClientRect().top);
    for (const field of [title, label]) {
      await expect(field.scrollHeight).toBeLessThanOrEqual(field.clientHeight + 1);
      await expect(field.scrollWidth).toBeLessThanOrEqual(field.clientWidth + 1);
    }
    for (const emblem of footer.querySelectorAll('.rulebookCoverFooterEmblem')) {
      const emblemBounds = emblem.getBoundingClientRect();
      await expect(emblemBounds.top).toBeGreaterThanOrEqual(footerBounds.top);
      await expect(emblemBounds.bottom).toBeLessThanOrEqual(label.getBoundingClientRect().top);
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
  /* The right slot holds the unavailable mark instead of the Richese token, and the left slot is untouched. */
  play: async (context) => {
    await expectFooterBounds(context);
    const footer = within(within(context.canvasElement).getByLabelText('Cover footer'));
    await expect(footer.getByRole('img', { name: 'Faction unavailable' })).toBeVisible();
    await expect(footer.queryByRole('img', { name: 'Richese' })).toBeNull();
    await expect(footer.getByRole('img', { name: 'CHOAM' })).toBeVisible();
  },
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
