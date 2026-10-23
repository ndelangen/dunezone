import preview from '@sb/preview';

import { SortableListDemo } from './SortableDnd.stories.fixture';

const meta = preview.meta({
  parameters: { layout: 'centered' },
});

export const SilentHandles = meta.story({
  render: () => <SortableListDemo silent />,
});
