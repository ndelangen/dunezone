import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { battleSequencePage } from './RulebookBattlePlan.stories.fixture';
import { movementFixture } from './RulebookIllustratedScenes.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

const meta = preview.meta({
  title: 'Blocks/Piece transfer/Rendered',
  parameters: { layout: 'centered' },
});

export const ReferencedGroups = meta.story({
  render: () => {
    const movement = movementFixture();
    return (
      <div style={{ width: 'min(960px, 94vw)' }}>
        <RulebookPageRenderer
          page={{
            ...battleSequencePage([]),
            title: 'An exchange of pieces',
            regions: [
              {
                key: 'content',
                blocks: [
                  {
                    id: 'transfer',
                    kind: 'piece-transfer',
                    left: movement.left,
                    right: movement.right,
                    direction: 'exchange',
                  },
                ],
              },
            ],
          }}
          settings={{ size: 'square', design: 'illustrated' }}
        />
      </div>
    );
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByLabelText('Exchange')).toBeVisible();
    expect(canvasElement.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(1);
  },
});
