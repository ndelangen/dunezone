import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { PageState } from './PageState';

const meta = preview.meta({
  component: PageState,
  parameters: { layout: 'padded' },
  args: {
    kind: 'absent' as const,
    title: 'Ruleset not found',
    children: 'This ruleset does not exist or was deleted.',
  },
});

/** A page waiting for its own subject. The heading names what is coming, the sentence says it is still on its way, and both are announced. */
export const Pending = meta.story({
  args: { kind: 'pending' as const, title: 'Loading faction', children: 'The faction details are still loading.' },
  play: async ({ canvasElement }) => {
    const status = within(canvasElement).getByRole('status');
    await expect(within(status).getByRole('heading', { name: 'Loading faction' })).toBeVisible();
    await expect(within(status).getByText('The faction details are still loading.')).toBeVisible();
  },
});

/** The thing is not there. The page deliberately does not distinguish "never existed" from "deleted", so a deleted row leaks nothing by its absence. */
export const Absent = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('status')).not.toBeInTheDocument();
    await expect(within(canvasElement).getByRole('heading', { name: 'Ruleset not found' })).toBeVisible();
  },
});
