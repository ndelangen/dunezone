import preview from '@sb/preview';
import { RULEBOOK_BOARD_DEFINITIONS } from '@shared/rulebooks/boardDefinitions';
import { expect } from 'storybook/test';

import { atreidesSide, battleSequencePage, harkonnenSide } from './RulebookBattlePlan.stories.fixture';
import { boardSceneFixture, movementFixture, lossMovementFixture } from './RulebookIllustratedScenes.stories.fixture';
import { RulebookIllustratedStep } from './RulebookIllustratedStep';
import { RulebookPieceMovement } from './RulebookPieceMovement';
import { RulebookPageRenderer } from './RulebookRenderer';
import { RulebookTerritoryScene } from './RulebookTerritoryScene';

const board = RULEBOOK_BOARD_DEFINITIONS[0]!;
const leftTroop = atreidesSide.plan.troops[0]!.artwork;
const rightTroop = harkonnenSide.plan.troops[0]!.artwork;

function Territory() {
  return (
    <RulebookTerritoryScene
      label="Two factions share Hagga Basin"
      board={board}
      viewport={{ x: 125, y: 100, width: 100, height: 125 }}
      highlights={[{ territory: 'hagga-basin', color: '#d79022' }]}
      troops={[
        { id: 'left', artwork: leftTroop, count: 4, x: 162, y: 126, columns: 2, size: 9, gap: 1 },
        { id: 'right', artwork: rightTroop, count: 3, x: 178, y: 162, columns: 2, size: 9, gap: 1 },
      ]}
      labels={[{ x: 175, y: 214, width: 90, text: 'Shared territory' }]}
    />
  );
}

function IllustratedSteps() {
  const page = battleSequencePage([]);
  page.title = 'Illustrating a sequence';
  page.regions[0]!.blocks = ['territory', 'exchange', 'losses'].map((id) => ({ id, kind: 'text', text: '' }));
  return (
    <div style={{ width: 'min(960px, 94vw)' }}>
      <RulebookPageRenderer
        page={page}
        settings={{ size: 'square', design: 'illustrated' }}
        blockRenderer={({ block }) => {
          if (block.id === 'territory') {
            return (
              <RulebookIllustratedStep
                step="1"
                title="Show where an action happens"
                caption="The board crop, territory highlight, and troop positions share the same coordinates."
                visual={<Territory />}
              />
            );
          }
          if (block.id === 'exchange') {
            return (
              <RulebookIllustratedStep
                step="2"
                title="Show which pieces move"
                caption="An exchange places the pieces beside their current owners and shows movement in both directions."
                visual={
                  <RulebookPieceMovement
                    direction="exchange"
                    left={{
                      label: 'Atreides',
                      pieces: [
                        { id: 'left-card', kind: 'source', source: atreidesSide.plan.cards[1]!, label: 'Snooper' },
                      ],
                    }}
                    right={{
                      label: 'Harkonnen',
                      pieces: [
                        { id: 'right-card', kind: 'source', source: harkonnenSide.plan.cards[0]!, label: 'Gom Jabbar' },
                      ],
                    }}
                  />
                }
                dialogue={[{ speaker: 'Harkonnen', text: 'Exchange these cards.' }]}
              />
            );
          }
          return (
            <RulebookIllustratedStep
              step="3"
              title="Show the pieces removed"
              caption="Token groups retain their faction artwork and shape when they move off the board."
              visual={
                <RulebookPieceMovement
                  direction="right"
                  left={{
                    label: 'Leaving the territory',
                    pieces: [{ id: 'left-troops', kind: 'troops', artwork: leftTroop, count: 4 }],
                  }}
                  right={{
                    label: 'To the Tanks',
                    pieces: [{ id: 'right-troops', kind: 'troops', artwork: leftTroop, count: 4 }],
                  }}
                />
              }
              outcome="A short result can sit below the explanation."
            />
          );
        }}
      />
    </div>
  );
}

const meta = preview.meta({
  title: 'Blocks/Illustrated steps/Rendered',
  component: IllustratedSteps,
  parameters: { layout: 'centered' },
});
export const PlacesAndPieceMovement = meta.story({
  play: async ({ canvas, canvasElement }) => {
    await document.fonts.ready;
    await expect(canvas.getByRole('img', { name: 'Two factions share Hagga Basin' })).toBeVisible();
    await expect(canvas.getByLabelText('Exchange')).toBeVisible();
    await expect(canvas.getByLabelText('Move right')).toBeVisible();
    const region = canvasElement.querySelector<HTMLElement>('[data-rulebook-region]')!;
    expect(region.scrollHeight).toBeLessThanOrEqual(region.clientHeight + 1);
  },
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

export const SavedPieceMovements = meta.story({
  render: () => (
    <div style={{ width: 'min(960px, 94vw)' }}>
      <RulebookPageRenderer
        page={{
          ...battleSequencePage([]),
          title: 'Saved piece movements',
          regions: [{ key: 'content', blocks: [movementFixture(), lossMovementFixture()] }],
        }}
        settings={{ size: 'square', design: 'illustrated' }}
      />
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    await document.fonts.ready;
    await expect(canvas.getByLabelText('Exchange')).toBeVisible();
    await expect(canvas.getByText('Support paid')).toBeVisible();
    expect(canvasElement.querySelectorAll('[data-rulebook-block-id]')).toHaveLength(2);
    const region = canvasElement.querySelector<HTMLElement>('[data-rulebook-region]')!;
    expect(region.scrollHeight).toBeLessThanOrEqual(region.clientHeight + 1);
  },
});

export const UnavailableSceneReferences = meta.story({
  render: () => {
    const board = boardSceneFixture();
    board.board = { status: 'unavailable', reference: { kind: 'board', boardId: board.boardId } };
    const movement = lossMovementFixture();
    movement.board = undefined;
    movement.left.pieces = [
      {
        id: 'missing-card',
        kind: 'source',
        source: { status: 'unavailable', reference: { kind: 'asset', assetId: 'missing' } },
        count: 1,
      },
    ];
    movement.right.pieces = [
      {
        id: 'missing-troop',
        kind: 'troops',
        faction: { status: 'unavailable', factionId: 'missing' },
        face: 'front',
        count: 3,
      },
    ];
    return (
      <div style={{ width: 'min(960px, 94vw)' }}>
        <RulebookPageRenderer
          page={{
            ...battleSequencePage([]),
            title: 'Unavailable sources',
            regions: [{ key: 'content', blocks: [board, movement] }],
          }}
          settings={{ size: 'square', design: 'illustrated' }}
        />
      </div>
    );
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Board unavailable', { exact: true })).toBeVisible();
    await expect(canvas.getByText('Source unavailable', { exact: true })).toBeVisible();
    await expect(canvas.getAllByLabelText('Troop artwork unavailable')).toHaveLength(3);
  },
});

export const RoutesAndStandaloneTransfers = meta.story({
  render: () => {
    const board = boardSceneFixture();
    board.annotations = [];
    board.players = [];
    board.troops = [];
    board.storm = undefined;
    board.size = 'fit-width';
    board.caption = '';
    board.routes = [
      {
        id: 'route',
        label: 'Illustrated route with a blocked segment',
        direction: 'forward',
        waypoints: [{ territory: 'tueks' }, { territory: 'pasty-mesa' }, { territory: 'shield-wall' }],
        blockedAfter: 1,
      },
    ];
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
