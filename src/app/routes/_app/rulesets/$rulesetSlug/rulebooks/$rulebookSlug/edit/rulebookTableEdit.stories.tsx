import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { WeaponTableStory } from './rulebookIllustratedBook.stories.fixture';
import {
  ReferenceTableStory,
  renderedHeaders,
  renderedRow,
} from './rulebookReferenceBlockEditors.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Table/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

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

export const WeaponsAndDefenses = meta.story({ render: () => <WeaponTableStory /> });
