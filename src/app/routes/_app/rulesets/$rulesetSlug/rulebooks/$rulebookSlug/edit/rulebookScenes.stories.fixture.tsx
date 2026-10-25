import { Box } from '@mantine/core';
import type { RulebookBlockDraft } from '@shared/rulebooks/contents';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { useState } from 'react';

import { RulebookBlockCanvas } from '@game/rulebook/RulebookBlockRenderer';
import { RulebookBoardMarkupEditing } from '@game/rulebook/RulebookBoardMarkup';

import { rulebookMarkupEditor, RulebookMarkupUiProvider, useRulebookMarkupUiState } from './rulebookBoardMarkup';
import {
  BattleComparisonEdit,
  BoardSceneEdit,
  PieceMovementEdit,
  PieceTransferEdit,
} from './rulebookSceneBlockEditors';
import type { RulebookEditorReferences } from './rulebookVisualBlockEditors';

const emptyReferences: RulebookEditorReferences = { assetsById: {}, factionsById: {} };

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
  transfer: {
    id: 'XFER',
    kind: 'piece-transfer',
    direction: 'right',
    left: { label: 'Reserves', pieces: [] },
    right: { label: 'Board', pieces: [] },
  },
  comparison: {
    id: 'CMPR',
    kind: 'battle-comparison',
    examples: [example, { ...example, title: 'Another battle plan' }],
  },
} satisfies Record<string, RulebookBlockDraft>;

export function SceneEditorStory({
  kind,
  initial,
  references = emptyReferences,
}: {
  kind: keyof typeof initialBlocks;
  /** A block to start from instead of the kind's empty one. */
  initial?: RulebookBlockDraft;
  references?: RulebookEditorReferences;
}) {
  const [block, setBlock] = useState<RulebookBlockDraft>(initial ?? initialBlocks[kind]);
  const markupUi = useRulebookMarkupUiState(block.id);
  const editor =
    block.kind === 'board-scene' ? (
      <BoardSceneEdit value={block} onChange={(value) => setBlock({ ...block, ...value })} references={references} />
    ) : block.kind === 'piece-movement' ? (
      <PieceMovementEdit value={block} onChange={(value) => setBlock({ ...block, ...value })} references={references} />
    ) : block.kind === 'piece-transfer' ? (
      <PieceTransferEdit value={block} onChange={(value) => setBlock({ ...block, ...value })} />
    ) : block.kind === 'battle-comparison' ? (
      <BattleComparisonEdit value={block} onChange={(value) => setBlock({ ...block, ...value })} />
    ) : null;
  const markupEditor =
    block.kind === 'board-scene'
      ? rulebookMarkupEditor({
          value: block,
          onChange: (value) => setBlock({ ...block, ...value }),
          assetsById: references.assetsById,
          ui: markupUi,
        })
      : null;
  return (
    <Box p="lg">
      <DocumentEditorLayout ratio={1} fit="width">
        <DocumentEditorLayout.Sidebar>
          <RulebookMarkupUiProvider state={markupUi}>{editor}</RulebookMarkupUiProvider>
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <RulebookBoardMarkupEditing.Provider
            value={markupEditor ? { blockId: block.id, editor: markupEditor } : null}
          >
            <RulebookBlockCanvas
              block={projectRulebookDraftRenderBlock(block, references.assetsById, references.factionsById)}
            />
          </RulebookBoardMarkupEditing.Provider>
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}
