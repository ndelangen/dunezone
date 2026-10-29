import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, fn, userEvent, within } from 'storybook/test';

import { SearchRefine } from './SearchRefine';
import { commitSearch, Harness } from './SearchRefine.stories.fixture';

const meta = preview.meta({
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

/** The box and its joined refine button, which opens the sort and any filters in a drawer. One row at every width. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Refine cards' }));
    const page = within(canvasElement.ownerDocument.body);
    await expect(await waitForFrame(() => page.getByRole('dialog', { name: 'Refine cards' }))).toBeInTheDocument();
  },
});

/** With a refinement set, the button says so in its name and wears a dot. */
export const Narrowed = meta.story({
  render: () => <Harness active={1} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Refine cards (1 set)' })).toBeInTheDocument();
  },
});

/** A wide page shows the sort joined to the box instead of the button; below 48rem of page the button takes its place. */
export const WithSegments = meta.story({
  render: () => <Harness segmented />,
});
