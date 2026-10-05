import { Box } from '@mantine/core';
import type { RulebookBlockDraft } from '@shared/rulebooks/contents';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { useState } from 'react';

import { RulebookBlockCanvas } from '@game/rulebook/RulebookBlockRenderer';

import { BattleComparisonEdit, BoardSceneEdit, PieceMovementEdit } from './rulebookSceneBlockEditors';

const side = { role: '', revealed: false, dial: 0, spice: 0, cards: [], troops: [] };
const example = { step: '', title: 'One battle plan', caption: '', left: side, right: side };
const initialBlocks = {
  board: {
    id: 'BRDD',
    kind: 'board-scene',
    boardId: 'arrakis',
    caption: 'Place the factions on the board.',
    players: [],
    troops: [],
    highlights: [],
    annotations: [],
  },
  movement: {
    id: 'MVMT',
    kind: 'piece-movement',
    step: '10',
    title: 'Discard played cards',
    caption: '',
    left: { label: 'Played cards', pieces: [] },
    right: { label: 'Discard pile', pieces: [] },
  },
  comparison: {
    id: 'CMPR',
    kind: 'battle-comparison',
    examples: [example, { ...example, title: 'Another battle plan' }],
  },
} satisfies Record<string, RulebookBlockDraft>;

export function SceneEditorStory({ kind }: { kind: keyof typeof initialBlocks }) {
  const [block, setBlock] = useState<RulebookBlockDraft>(initialBlocks[kind]);
  const editor =
    block.kind === 'board-scene' ? (
      <BoardSceneEdit value={block} onChange={(value) => setBlock({ ...block, ...value })} />
    ) : block.kind === 'piece-movement' ? (
      <PieceMovementEdit value={block} onChange={(value) => setBlock({ ...block, ...value })} />
    ) : block.kind === 'battle-comparison' ? (
      <BattleComparisonEdit value={block} onChange={(value) => setBlock({ ...block, ...value })} />
    ) : null;
  return (
    <Box p="lg">
      <DocumentEditorLayout ratio={1} fit="width">
        <DocumentEditorLayout.Sidebar>{editor}</DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <RulebookBlockCanvas block={projectRulebookDraftRenderBlock(block, {})} />
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}
