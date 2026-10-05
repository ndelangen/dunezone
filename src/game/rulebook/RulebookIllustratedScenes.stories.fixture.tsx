import { RULEBOOK_BOARD_DEFINITIONS } from '@shared/rulebooks/boardDefinitions';
import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';

import { factionTokenFixtures } from '../fixtures/factionTokens';
import { renderedBattleStep, revealPanel } from './RulebookBattlePlan.stories.fixture';

const battle = renderedBattleStep(revealPanel, 0);

export function boardSceneFixture(): Extract<RulebookRenderBlockV1, { kind: 'board-scene' }> {
  const board = RULEBOOK_BOARD_DEFINITIONS[0]!;
  return {
    id: 'scene',
    kind: 'board-scene',
    boardId: board.id,
    board: {
      status: 'ready',
      reference: { kind: 'board', boardId: board.id },
      name: 'Complete board with troops and numbered explanations',
      imageUrl: board.imageUrl,
      geometry: board.geometry,
    },
    caption: 'Player markers surround the board; troop stacks occupy territories.',
    viewport: { x: -0.03, y: -0.03, width: 1.06, height: 1.06 },
    storm: { angle: 10 },
    players: (['atreides', 'harkonnen', 'emperor', 'fremen', 'guild', 'beneGesserit'] as const).map((name, index) => ({
      id: name,
      angle: 60 + index * 60,
      faction: { status: 'ready', factionId: name, name, color: '#765432', token: factionTokenFixtures[name] },
    })),
    troops: [
      {
        ...battle.left.troops[0]!,
        id: 'left',
        faction: battle.left.faction,
        count: 4,
        x: 0.332,
        y: 0.259,
        columns: 2,
        size: 0.02,
        gap: 0.002,
      },
      {
        ...battle.right.troops[0]!,
        id: 'right',
        faction: battle.right.faction,
        count: 3,
        x: 0.365,
        y: 0.332,
        columns: 2,
        size: 0.02,
        gap: 0.002,
      },
    ],
    highlights: [{ territory: 'hagga-basin', color: '#d79022', opacity: 0.38 }],
    annotations: [
      {
        id: 'storm',
        title: 'Read around the table',
        text: 'The storm and player markers show an order around the board.',
        x: 0.99,
        y: 0.34,
        targetX: 0.925,
        targetY: 0.426,
      },
      {
        id: 'troops',
        title: 'Place troops in a territory',
        text: 'Troops and territory outlines use the same board coordinates.',
        x: 0.17,
        y: 0.28,
        targetX: 0.35,
        targetY: 0.32,
      },
    ],
  };
}

export function movementFixture(): Extract<RulebookRenderBlockV1, { kind: 'piece-movement' }> {
  return {
    id: 'movement',
    kind: 'piece-movement',
    step: '1',
    title: 'Move pieces between groups',
    caption: 'The supplied card references appear beside their owners. An exchange arrow points both ways.',
    direction: 'exchange',
    left: {
      label: 'Atreides',
      pieces: [{ id: 'left', kind: 'source', source: battle.left.cards[1]!, count: 1, label: 'Snooper' }],
    },
    right: {
      label: 'Harkonnen',
      pieces: [{ id: 'right', kind: 'source', source: battle.right.cards[0]!, count: 1, label: 'Gom Jabbar' }],
    },
  };
}

export function lossMovementFixture(): Extract<RulebookRenderBlockV1, { kind: 'piece-movement' }> {
  const board = boardSceneFixture();
  return {
    ...movementFixture(),
    id: 'losses',
    step: '2',
    title: 'Show losses beside the remaining board state',
    caption: 'The cropped board shows what remains, while separate groups show the removed troops.',
    direction: 'none',
    board: {
      ...board,
      caption: '',
      viewport: { x: 0.25, y: 0.1, width: 0.32, height: 0.39 },
      storm: undefined,
      players: [],
      annotations: [],
    },
    left: {
      label: 'Atreides to Tanks',
      pieces: [
        {
          id: 'left',
          kind: 'troops',
          faction: battle.left.faction,
          artwork: battle.left.troops[0]!.artwork,
          face: 'front',
          count: 4,
        },
      ],
    },
    right: {
      label: 'Harkonnen to Tanks',
      pieces: [
        {
          id: 'right',
          kind: 'troops',
          faction: battle.right.faction,
          artwork: battle.right.troops[0]!.artwork,
          face: 'front',
          count: 3,
        },
      ],
    },
    notes: [
      {
        id: 'spice',
        label: 'Support paid',
        source: {
          status: 'ready',
          reference: { kind: 'stock', artworkId: '/vector/icon/spice.svg' },
          name: 'Spice',
          imageUrl: '/vector/icon/spice.svg',
        },
        count: 2,
      },
    ],
  };
}
