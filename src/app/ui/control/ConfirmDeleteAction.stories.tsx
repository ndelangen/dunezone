import preview from '@sb/preview';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { ConfirmDeleteAction } from './ConfirmDeleteAction';

const meta = preview.meta({
  component: ConfirmDeleteAction,
  parameters: { layout: 'centered' },
  globals: { backgrounds: { value: 'light', grid: false } },
  args: {
    label: 'Delete faction',
    prompt: 'Delete faction?',
    pending: false,
    onConfirm: fn(),
  },
});

/** Collapsed: one red glyph among the other toolbar actions, carrying its name for people who cannot see it. */
export const Default = meta.story({});

/** Clicking the glyph replaces it in place with the question and its two answers. No dialog, no lost context. */
export const Confirming = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(page.getByRole('button', { name: 'Delete faction' }));

    const question = await page.findByRole('group', { name: 'Delete faction' });
    await expect(question).toHaveTextContent('Delete faction?');
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
    /* The swap must hand focus over, or a keyboard reader is stranded on an unmounted node. */
    await waitFor(() => expect(question).toHaveFocus());
  },
});

/** Confirming fires the caller's intent once. The component neither deletes anything nor closes itself. */
export const Confirmed = meta.story({
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(page.getByRole('button', { name: 'Delete faction' }));
    await userEvent.click(await page.findByRole('button', { name: 'Delete' }));

    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
    await expect(page.getByRole('group', { name: 'Delete faction' })).toBeVisible();
  },
});

/** Cancel collapses it back to the glyph and returns focus there, so a misclick costs nothing. */
export const Cancelled = meta.story({
  play: async ({ args, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(page.getByRole('button', { name: 'Delete faction' }));
    await userEvent.click(await page.findByRole('button', { name: 'Cancel' }));

    const trigger = await page.findByRole('button', { name: 'Delete faction' });
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(args.onConfirm).not.toHaveBeenCalled();
  },
});

/** While the deletion is in flight the confirm latches, so an impatient second click cannot fire it twice. Cancel stays live: it closes the asking, and there is no abort channel it could reach. */
export const Pending = meta.story({
  args: { pending: true },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(page.getByRole('button', { name: 'Delete faction' }));

    await waitFor(() => expect(page.getByRole('button', { name: 'Delete' })).toBeDisabled());
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  },
});

/** The words follow whatever is being deleted, and the question is where a page names a consequence the trigger cannot carry. */
export const OtherWords = meta.story({
  args: { label: 'Retire deck', prompt: 'Retire this deck for everyone?', confirmLabel: 'Retire' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);

    await userEvent.click(page.getByRole('button', { name: 'Retire deck' }));

    const question = await page.findByRole('group', { name: 'Retire deck' });
    await expect(question).toHaveTextContent('Retire this deck for everyone?');
    await expect(page.getByRole('button', { name: 'Retire' })).toBeVisible();
  },
});
