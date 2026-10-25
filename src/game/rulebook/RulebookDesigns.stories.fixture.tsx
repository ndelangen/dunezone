import { rulebookDesignCatalogue, rulebookSizeCatalogue } from '@shared/rulebooks/settings';
import { getRulebookSize } from '@shared/rulebooks/settings';
import type { RulebookSettings } from '@shared/rulebooks/settings';
import type { Meta } from '@storybook/tanstack-react';

import { RulebookDocumentRenderer } from './RulebookRenderer';
import { createRulebookRenderDocumentFixture } from './RulebookRenderer.stories.fixture';

export function DesignPages({ size, design }: RulebookSettings) {
  const document = createRulebookRenderDocumentFixture();
  document.settings = { size, design };
  document.pageOrder = ['RULE', 'REFS'];
  return (
    <div data-rulebook-design-example style={{ width: `min(100%, ${getRulebookSize(size).widthMm * 2}mm)` }}>
      <RulebookDocumentRenderer document={document} pageOffset={1} as="section" />
    </div>
  );
}

export const rulebookDesignsMeta = {
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
} satisfies Meta<typeof DesignPages>;
