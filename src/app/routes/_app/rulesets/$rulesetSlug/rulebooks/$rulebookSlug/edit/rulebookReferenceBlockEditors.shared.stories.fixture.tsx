import { Box } from '@mantine/core';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { useState } from 'react';

import { RulebookBlockCanvas } from '@game/rulebook/RulebookBlockRenderer';
import { creditsFixture, referenceTableFixture } from '@game/rulebook/RulebookReferenceMatter.stories.fixture';

import type { RulebookBlockEditorValue } from './rulebookBlockEditors';
import { CreditsEdit, ReferenceTableEdit } from './rulebookReferenceBlockEditors';

export function ReferenceTableStory() {
  const [value, setValue] = useState<RulebookBlockEditorValue<'reference-table'>>(referenceTableFixture());
  return (
    <Box p="lg">
      <DocumentEditorLayout ratio={4 / 3} fit="width">
        <DocumentEditorLayout.Sidebar>
          <ReferenceTableEdit value={value} onChange={setValue} />
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <RulebookBlockCanvas
            block={projectRulebookDraftRenderBlock({ ...value, id: 'TABL', kind: 'reference-table' }, {})}
          />
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}

export function CreditsStory() {
  const [value, setValue] = useState<RulebookBlockEditorValue<'credits'>>(creditsFixture());
  return (
    <Box p="lg">
      <DocumentEditorLayout ratio={4 / 3} fit="width">
        <DocumentEditorLayout.Sidebar>
          <CreditsEdit value={value} onChange={setValue} />
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <RulebookBlockCanvas block={projectRulebookDraftRenderBlock({ ...value, id: 'CRED', kind: 'credits' }, {})} />
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}

export function renderedHeaders(canvasElement: HTMLElement) {
  return [...canvasElement.querySelectorAll('[data-rulebook-block-canvas] th')].map((cell) => cell.textContent);
}

export function renderedRow(canvasElement: HTMLElement, rowId: string) {
  return [
    ...canvasElement.querySelectorAll(`[data-rulebook-block-canvas] tr[data-rulebook-item-id="${rowId}"] td`),
  ].map((cell) => cell.textContent);
}
