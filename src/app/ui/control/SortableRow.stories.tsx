import preview from '@sb/preview';

import { SortableRowDemo } from './SortableRow.stories.fixture';

const meta = preview.meta({
  parameters: { layout: 'centered' },
  globals: { motion: 'on' },
});

/** Drag a tile along the row: it follows the pointer and the others slide aside; let go off the row and it settles back. */
export const Row = meta.story({
  render: () => <SortableRowDemo />,
});
