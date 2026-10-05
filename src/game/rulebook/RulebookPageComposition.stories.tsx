import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { battleSequencePage } from './RulebookBattlePlan.stories.fixture';
import { createCataloguePage } from './RulebookCatalogue.stories.fixture';
import { boardRouteFixture, movementFixture } from './RulebookIllustratedScenes.stories.fixture';
import { ReferenceMatterStory, expectContained } from './RulebookReferenceMatter.shared.stories.fixture';
import { RulebookPageRenderer } from './RulebookRenderer';

const meta = preview.meta({
  title: 'Page/Composition/Rendered',
  component: ReferenceMatterStory,
  args: { treatment: 'table', size: 'a4' },
  parameters: { layout: 'centered' },
});

export const TableAndCredits = meta.story({ args: { treatment: 'both' }, play: expectContained });

export const EmptyBlocks = meta.story({
  args: { treatment: 'empty', size: 'square' },
  play: async (context) => {
    await expectContained(context);
    expect(context.canvasElement.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(2);
    expect(context.canvasElement.querySelector('th')).toBeNull();
    expect(context.canvasElement.querySelector('[data-rulebook-block-id="CRED"] h3')).toBeNull();
  },
});

export const WrittenRules = meta.story({
  render: () => (
    <div style={{ width: 'min(46rem, 100%)' }}>
      <RulebookPageRenderer page={createCataloguePage('two-columns', { written: true })} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    expect(canvasElement.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(7);
    expect(within(canvasElement).getByRole('heading', { name: 'Choose a group', level: 3 })).toBeVisible();
    expect(canvasElement.querySelector('[data-faction-id="atreides"]')?.textContent).toBe('Shipment and movement');
    expect(canvasElement.querySelectorAll('blockquote')).toHaveLength(1);
    for (const region of canvasElement.querySelectorAll<HTMLElement>('[data-rulebook-region]')) {
      expect(region.scrollHeight).toBeLessThanOrEqual(region.clientHeight + 1);
    }
  },
});

export const RoutesAndStandaloneTransfers = meta.story({
  render: () => {
    const board = boardRouteFixture();
    const movement = movementFixture();
    return (
      <div style={{ width: 'min(960px, 94vw)' }}>
        <RulebookPageRenderer
          page={{
            ...battleSequencePage([]),
            title: 'Paths and transfers',
            layoutId: 'two-columns',
            controlValues: {},
            regions: [
              { key: 'column1', blocks: [board] },
              {
                key: 'column2',
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
    expect(canvasElement.querySelectorAll('[data-route-segment]')).toHaveLength(2);
    expect(canvasElement.querySelectorAll('[data-route-segment][data-blocked]')).toHaveLength(1);
    const board = canvasElement.querySelector<SVGElement>('.rulebookTerritoryScene')!;
    expect(board.getBoundingClientRect().width).toBeGreaterThan(300);
  },
});
