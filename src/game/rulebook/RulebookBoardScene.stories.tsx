import preview from '@sb/preview';
import { expect } from 'storybook/test';

import { battleSequencePage } from './RulebookBattlePlan.stories.fixture';
import { RulebookBoardMarkupLayer } from './RulebookBoardMarkup';
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
    await expect(canvasElement.querySelectorAll('[data-rulebook-marker]')).toHaveLength(2);
    await expect(canvasElement.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(1);
    const region = canvasElement.querySelector<HTMLElement>('[data-rulebook-region]')!;
    await expect(region.scrollHeight).toBeLessThanOrEqual(region.clientHeight + 1);
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
    await expect(canvasElement.querySelectorAll('[data-route-segment]')).toHaveLength(2);
    await expect(canvasElement.querySelectorAll('[data-route-segment][data-blocked]')).toHaveLength(1);
    await expect(canvasElement.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(1);
  },
});

/** A selected board token keeps its cut shape and shadow without a selection border. */
export const SelectedToken = meta.story({
  render: () => (
    <svg viewBox="0 0 487.06 487.06" width="512" height="512" role="img" aria-label="Selected board token">
      <RulebookBoardMarkupLayer
        width={487.06}
        height={487.06}
        selectedToken="token-1"
        scene={{
          tokens: [
            {
              layerId: 'token-1',
              asset_id: 'token-bid',
              name: 'Bidding disc',
              x: 243.53,
              y: 243.53,
              size: 100,
              rotation: 0,
              type: 'token-disc',
              imageUrl: '/vector/icon/bidding_disc.svg',
            },
          ],
        }}
      />
    </svg>
  ),
  play: async ({ canvasElement }) => {
    const token = canvasElement.querySelector('[data-token-instance="token-1"]')!;
    await expect(token.querySelector('[stroke]')).toBeNull();
    await expect(getComputedStyle(token).filter).toMatch(/drop-shadow\(.+ 0px 1px 0\.5px\)/);
  },
});
