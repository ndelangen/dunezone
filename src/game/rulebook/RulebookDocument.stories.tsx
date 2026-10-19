import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { RulebookDocumentRenderer } from './RulebookRenderer';
import { document } from './RulebookRendering.shared.stories.fixture';

const meta = preview.meta({
  title: 'Document/Complete book',
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 'min(42rem, 92vw)', aspectRatio: '210 / 297' }}>
        <Story />
      </div>
    ),
  ],
});

export const CompleteDocument = meta.story({
  decorators: [],
  parameters: { layout: 'fullscreen' },
  render: () => <RulebookDocumentRenderer document={document} />,
  /* Every page of the fixture renders once and in its authored order, and no region's content runs past it. */
  play: async ({ canvasElement }) => {
    await canvasElement.ownerDocument.fonts.ready;
    const pages = [...canvasElement.querySelectorAll<HTMLElement>('[data-rulebook-page]')];
    await expect(pages.map((page) => page.dataset.rulebookPageId)).toEqual(document.pageOrder);
    for (const region of canvasElement.querySelectorAll<HTMLElement>('[data-rulebook-region]')) {
      await expect(region.scrollHeight, region.dataset.rulebookRegion).toBeLessThanOrEqual(region.clientHeight + 1);
    }
  },
});
