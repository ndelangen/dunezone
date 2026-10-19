import preview from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { LoadMoreButton } from './LoadMoreButton';

const meta = preview.meta({
  component: LoadMoreButton,
  parameters: { layout: 'padded' },
  args: { loading: false, onLoadMore: fn() },
});

/** A press asks for more, once. */
export const Default = meta.story({
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Load more' });
    await expect(button).toHaveAttribute('aria-disabled', 'false');
    await userEvent.click(button);
    await expect(args.onLoadMore).toHaveBeenCalledOnce();
  },
});

/** While the longer list loads the button stays focusable, says it is busy, and a second press asks for nothing. */
export const Loading = meta.story({
  args: { loading: true },
  play: async ({ args, canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Load more' });
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(button).toBeEnabled();
    await userEvent.click(button);
    await expect(args.onLoadMore).not.toHaveBeenCalled();
  },
});
