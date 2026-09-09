import preview from '@sb/preview';
import { getRulebookSize, rulebookDesignCatalogue, rulebookSizeCatalogue } from '@shared/rulebooks/settings';
import type { RulebookSettings } from '@shared/rulebooks/settings';
import { expect } from 'storybook/test';

import { RulebookDocumentRenderer } from './RulebookRenderer';
import { createRulebookRenderDocumentFixture } from './RulebookRenderer.stories.fixture';

function DesignPages({ size, design }: RulebookSettings) {
  const document = createRulebookRenderDocumentFixture();
  document.settings = { size, design };
  document.pageOrder = ['RULE', 'REFS'];
  return (
    <div data-rulebook-design-example style={{ width: `min(100%, ${getRulebookSize(size).widthMm * 2}mm)` }}>
      <RulebookDocumentRenderer document={document} pageOffset={1} as="section" />
    </div>
  );
}

const meta = preview.meta({
  title: 'Designs',
  component: DesignPages,
  args: { size: 'a4', design: 'illustrated' },
  argTypes: {
    size: { control: 'radio', options: rulebookSizeCatalogue.map(({ id }) => id) },
    design: { control: 'radio', options: rulebookDesignCatalogue.map(({ id }) => id) },
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ padding: '1rem' }}>
        <style>{`
          @media screen {
            [data-rulebook-design-example] .rulebookDocument {
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 2px;
              align-items: start;
            }
          }
        `}</style>
        <Story />
      </div>
    ),
  ],
});

function expectFacingPages({ canvasElement }: { canvasElement: HTMLElement }) {
  const pages = [...canvasElement.querySelectorAll<HTMLElement>('[data-rulebook-page]')];
  expect(pages.map((page) => page.dataset.rulebookPageNumber)).toEqual(['2', '3']);
  expect(pages.map((page) => page.dataset.rulebookPageSide)).toEqual(['left', 'right']);
  for (const page of pages) {
    const dimensions = getRulebookSize(page.dataset.rulebookSize as RulebookSettings['size']);
    const actual = page.getBoundingClientRect();
    expect(actual.width / actual.height).toBeCloseTo(dimensions.widthMm / dimensions.heightMm, 2);
    const images = page.querySelectorAll('.rulebookPageArtwork img');
    expect(images).toHaveLength(page.dataset.rulebookDesign === 'illustrated' ? 1 : 0);
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

export const SizeAndDesignMatrix = meta.story({
  render: () => (
    <div style={{ display: 'grid', gap: '2rem' }}>
      {rulebookSizeCatalogue.map((size) => (
        <section key={size.id}>
          <h2>{`${size.label}, ${size.widthMm} x ${size.heightMm} mm`}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '2rem' }}>
            {rulebookDesignCatalogue.map((design) => (
              <div key={design.id}>
                <h3>{design.label}</h3>
                <DesignPages size={size.id} design={design.id} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  ),
});
