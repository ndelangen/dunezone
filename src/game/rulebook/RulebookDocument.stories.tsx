import preview from '@sb/preview';

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
});
