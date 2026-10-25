import { testingPreview } from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { SearchRefine } from './SearchRefine';
import { commitSearch, Harness } from './SearchRefine.stories.fixture';

const meta = testingPreview.meta({
  component: SearchRefine,
  parameters: { layout: 'padded' },
  /* The harness owns the state, so these only satisfy the component's props. */
  args: {
    label: 'Card filters',
    search: { value: '', onChange: fn(), onCommit: commitSearch, label: 'Search cards', placeholder: '' },
    refine: { label: 'Refine cards', content: null },
  },
  render: () => <Harness onCommit={commitSearch} />,
});

/** Enter commits the search and leaves the box. */
export const CommitsOnEnter = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Search cards' }), 'shield{Enter}');
    await expect(commitSearch).toHaveBeenCalled();
    await expect(canvas.getByRole('textbox', { name: 'Search cards' })).not.toHaveFocus();
  },
});

/** A picker keeps its type selector joined to a live search at every width. */
export const JoinedSelector = meta.story({
  render: () => <Harness inline />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox', { name: 'Search cards' });
    await userEvent.type(input, 'shield{Enter}');
    await expect(input).toHaveFocus();
    await expect(input).toHaveValue('shield');
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Card type' }), 'Spice cards');
    await expect(input).toHaveValue('shield');
  },
});
