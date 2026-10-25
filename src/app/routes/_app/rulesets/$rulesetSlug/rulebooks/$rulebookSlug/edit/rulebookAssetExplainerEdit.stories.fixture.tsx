import { Box } from '@mantine/core';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { useState } from 'react';

import { RulebookBlockCanvas } from '@game/rulebook/RulebookBlockRenderer';

import { AssetExplainerEdit } from './rulebookAssetExplainerEdit';
import type { RulebookBlockEditorValue } from './rulebookBlockEditors';
import type { RulebookEditorReferences } from './rulebookVisualBlockEditors';

export type Explainer = Extract<RulebookRenderBlockV1, { kind: 'asset-explainer' }>;
export function ExplainerStory({ initial, unavailable = false }: { initial: Explainer; unavailable?: boolean }) {
  const [value, setValue] = useState<RulebookBlockEditorValue<'asset-explainer'>>({
    source: initial.source.status === 'unselected' ? undefined : initial.source.reference,
    caption: initial.caption,
    numbering: initial.numbering,
    colorMode: initial.colorMode,
    itemOrder: initial.items.map((item) => item.id),
    itemsById: Object.fromEntries(initial.items.map((item) => [item.id, item])),
  });
  const source = initial.source;
  const references: RulebookEditorReferences = { assetsById: {}, factionsById: {} };
  if (!unavailable && source.status === 'ready' && source.reference.kind === 'faction-member') {
    const factionId = source.reference.factionId;
    references.factionsById = { [factionId]: { factionId, name: 'Atreides', color: '#374b2d', leaders: [source] } };
  }
  return (
    <Box p="lg">
      <DocumentEditorLayout ratio={4 / 3} fit="width">
        <DocumentEditorLayout.Sidebar>
          <AssetExplainerEdit value={value} onChange={setValue} references={references} />
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <RulebookBlockCanvas
            block={projectRulebookDraftRenderBlock(
              { ...value, id: 'EXPL', kind: 'asset-explainer' },
              references.assetsById,
              references.factionsById
            )}
          />
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}
