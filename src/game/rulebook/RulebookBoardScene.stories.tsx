import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { battleSequencePage } from './RulebookBattlePlan.stories.fixture';
import { boardSceneFixture, boardRouteFixture } from './RulebookIllustratedScenes.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

const meta = preview.meta({
  title: 'Blocks/Board scene/Rendered',
  parameters: { layout: 'centered' },
});

export const AnnotatedBoardWithPieces = meta.story({
  render: () => (
    <div style={{ width: 'min(960px, 94vw)' }}>
      <RulebookPageRenderer
        page={{
          ...battleSequencePage([]),
          title: 'A saved board scene',
          regions: [{ key: 'content', blocks: [boardSceneFixture()] }],
        }}
        settings={{ size: 'square', design: 'illustrated' }}
      />
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    await document.fonts.ready;
    await expect(
      canvas.getByRole('img', { name: 'Complete board with troops and numbered explanations' })
    ).toBeVisible();
    await expect(canvas.getByRole('list', { name: 'Explanations' })).toBeVisible();
    expect(canvasElement.querySelectorAll('[data-rulebook-marker]')).toHaveLength(2);
    expect(canvasElement.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(1);
    const region = canvasElement.querySelector<HTMLElement>('[data-rulebook-region]')!;
    expect(region.scrollHeight).toBeLessThanOrEqual(region.clientHeight + 1);
  },
});

export const Routes = meta.story({
  render: () => (
    <div style={{ width: 'min(960px, 94vw)' }}>
      <RulebookPageRenderer
        page={{
          ...battleSequencePage([]),
          title: 'Routes on a board',
          regions: [{ key: 'content', blocks: [{ ...boardRouteFixture(), size: 'compact' }] }],
        }}
        settings={{ size: 'square', design: 'illustrated' }}
      />
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole('list', { name: 'Routes' })).toBeVisible();
    expect(canvasElement.querySelectorAll('[data-route-segment]')).toHaveLength(2);
    expect(canvasElement.querySelectorAll('[data-route-segment][data-blocked]')).toHaveLength(1);
    expect(canvasElement.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(1);
  },
});
