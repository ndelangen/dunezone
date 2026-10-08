import preview from '@sb/preview';
import { arrakisBoard, blankBoard } from '@shared/boards/geometry';
import { expect, within } from 'storybook/test';

import { BoardMap } from './Board';

const meta = preview.meta({
  component: BoardMap,
  parameters: { layout: 'centered' },
  render: (args) => (
    <div style={{ width: 600, maxWidth: '100%', aspectRatio: 1 }}>
      <BoardMap {...args} />
    </div>
  ),
});

export const Blank = meta.story({ args: { board: blankBoard() } });
export const Arrakis = meta.story({
  args: { board: arrakisBoard() },
  play: async ({ canvasElement }) => {
    const artwork = within(canvasElement).getByLabelText('Board artwork');
    expect(artwork.querySelectorAll('[data-clipped-territory]')).toHaveLength(42);
    expect(artwork.querySelector('[data-editor-guide]')).toBeNull();
  },
});
