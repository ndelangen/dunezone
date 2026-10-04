import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { CreditsStory } from './rulebookReferenceBlockEditors.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Credits/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
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
