import { Box } from '@mantine/core';
import type { RulebookResolvedAssetsById } from '@shared/rulebooks/projectRenderDocument';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { useState } from 'react';

import { RulebookBlockCanvas } from '@game/rulebook/RulebookBlockRenderer';
import { cardEntryFixture, cardGroupFixture, cardGuideAssets } from '@game/rulebook/RulebookCardGuides.stories.fixture';

import type { RulebookBlockEditorValue } from './rulebookBlockEditors';
import { CardEntryEdit, CardGroupEdit } from './rulebookCardBlockEditors';

export function CardGroupStory({ assets = cardGuideAssets }: { assets?: RulebookResolvedAssetsById }) {
  const [value, setValue] = useState<RulebookBlockEditorValue<'card-group'>>(cardGroupFixture());
  return (
    <Box p="lg">
      <DocumentEditorLayout ratio={4 / 3} fit="width">
        <DocumentEditorLayout.Sidebar>
          <CardGroupEdit value={value} onChange={setValue} references={{ assetsById: assets, factionsById: {} }} />
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <RulebookBlockCanvas
            block={projectRulebookDraftRenderBlock({ ...value, id: 'CRDS', kind: 'card-group' }, assets)}
          />
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}

export function CardEntryStory() {
  const [value, setValue] = useState<RulebookBlockEditorValue<'card-entry'>>(cardEntryFixture());
  return (
    <Box p="lg">
      <DocumentEditorLayout ratio={4 / 3} fit="width">
        <DocumentEditorLayout.Sidebar>
          <CardEntryEdit
            value={value}
            onChange={setValue}
            references={{ assetsById: cardGuideAssets, factionsById: {} }}
          />
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <RulebookBlockCanvas
            block={projectRulebookDraftRenderBlock({ ...value, id: 'CARD', kind: 'card-entry' }, cardGuideAssets)}
          />
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}
