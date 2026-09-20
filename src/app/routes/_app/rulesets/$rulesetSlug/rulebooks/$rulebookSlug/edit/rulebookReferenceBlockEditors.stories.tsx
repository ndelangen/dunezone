import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { RulebookBlockCanvas } from '@game/rulebook/RulebookBlockRenderer';
import { creditsFixture, referenceTableFixture } from '@game/rulebook/RulebookReferenceMatter.stories.fixture';

import type { RulebookBlockEditorValue } from './rulebookBlockEditors';
import { CreditsEdit, ReferenceTableEdit } from './rulebookReferenceBlockEditors';

function ReferenceTableStory() {
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

function CreditsStory() {
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

const meta = preview.meta({
  title: 'Blocks/Reference matter',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

function renderedHeaders(canvasElement: HTMLElement) {
  return [...canvasElement.querySelectorAll('[data-rulebook-block-canvas] th')].map((cell) => cell.textContent);
}

function renderedRow(canvasElement: HTMLElement, rowId: string) {
  return [
    ...canvasElement.querySelectorAll(`[data-rulebook-block-canvas] tr[data-rulebook-item-id="${rowId}"] td`),
  ].map((cell) => cell.textContent);
}

export const ReferenceTable = meta.story({
  render: () => <ReferenceTableStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const portal = within(canvasElement.ownerDocument.body);
    expect(renderedRow(canvasElement, 'ATRE')).toEqual(['Atreides', '10', '10 in Arrakeen', '2']);

    /* Moving the first column to the end carries its cells: the Atreides row reads the same values in the new order. */
    const handle = canvas.getByRole('button', { name: 'Reorder column 1' });
    handle.scrollIntoView({ block: 'center', behavior: 'instant' });
    handle.focus();
    await userEvent.keyboard('[Space]');
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.keyboard('[ArrowDown]');
    await waitFor(() =>
      expect(portal.getByText('Draggable item FACT was moved over droppable area SPCE.')).toBeInTheDocument()
    );
    await userEvent.keyboard('[Space]');
    await waitFor(() =>
      expect(renderedHeaders(canvasElement)).toEqual(['Starting spice', 'Faction', 'Forces on Dune', 'Free revival'])
    );
    expect(renderedRow(canvasElement, 'ATRE')).toEqual(['10', 'Atreides', '10 in Arrakeen', '2']);

    /* A new column supplies a blank cell to every row, and typing fills only the row being edited. */
    await userEvent.click(canvas.getByRole('button', { name: 'Add column' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Column 5 label' }), 'Alliance');
    await waitFor(() => expect(renderedHeaders(canvasElement)).toHaveLength(5));
    expect(renderedRow(canvasElement, 'ATRE')).toEqual(['10', 'Atreides', '10 in Arrakeen', '2', '']);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Row 1, Alliance' }), 'Any');
    await waitFor(() =>
      expect(renderedRow(canvasElement, 'ATRE')).toEqual(['10', 'Atreides', '10 in Arrakeen', '2', 'Any'])
    );
    expect(renderedRow(canvasElement, 'HARK')).toEqual(['10', 'Harkonnen', '10 in Carthag', '2', '']);

    /* Removing the moved column takes only its cells; the other columns keep theirs. */
    await userEvent.click(canvas.getByRole('button', { name: 'Remove column 2' }));
    await waitFor(() =>
      expect(renderedHeaders(canvasElement)).toEqual(['Starting spice', 'Forces on Dune', 'Free revival', 'Alliance'])
    );
    expect(renderedRow(canvasElement, 'ATRE')).toEqual(['10', '10 in Arrakeen', '2', 'Any']);

    await userEvent.click(canvas.getByRole('button', { name: 'Remove row 6' }));
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-rulebook-block-canvas] tr[data-rulebook-item-id="BENE"]')).toBeNull()
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Add row' }));
    await expect(canvas.getByRole('textbox', { name: 'Row 6, Alliance' })).toHaveValue('');
  },
});

export const Credits = meta.story({
  render: () => <CreditsStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const portal = within(canvasElement.ownerDocument.body);
    const rendered = () =>
      [...canvasElement.querySelectorAll('[data-rulebook-block-canvas] li')].map((item) =>
        item.getAttribute('data-rulebook-item-id')
      );
    expect(rendered()).toEqual(['EBER', 'KITT', 'OLOT', 'ILLU', 'TYPE', 'EDIT']);

    /* Moving a group carries its contributors with it. */
    const handle = canvas.getByRole('button', { name: 'Reorder group 1' });
    handle.scrollIntoView({ block: 'center', behavior: 'instant' });
    handle.focus();
    await userEvent.keyboard('[Space]');
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.keyboard('[ArrowDown]');
    await waitFor(() =>
      expect(portal.getByText('Draggable item DSGN was moved over droppable area ARTW.')).toBeInTheDocument()
    );
    await userEvent.keyboard('[Space]');
    await waitFor(() => expect(rendered()).toEqual(['ILLU', 'TYPE', 'EBER', 'KITT', 'OLOT', 'EDIT']));

    /* A contributor joins the group it was added to, with an optional role. */
    await userEvent.click(canvas.getByRole('button', { name: 'Add contributor to group 3' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Group 3 contributor 2 name' }), 'Norbert de Langen');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Group 3 contributor 2 role' }), 'Publication');
    await waitFor(() =>
      expect(canvasElement.querySelector('[data-rulebook-block-canvas]')!.textContent).toContain(
        'Norbert de LangenPublication'
      )
    );
    expect(rendered()).toHaveLength(7);

    /* Removing a group removes its contributors and nothing else. */
    await userEvent.click(canvas.getByRole('button', { name: 'Remove group 1' }));
    await waitFor(() => expect(rendered()).toHaveLength(5));
    expect(rendered().slice(0, 3)).toEqual(['EBER', 'KITT', 'OLOT']);
  },
});
