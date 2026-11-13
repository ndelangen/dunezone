import preview from '@sb/preview';
import { Eye } from 'lucide-react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { LabeledAction } from '../control/LabeledAction';
import { Notice } from './Notice';

const meta = preview.meta({
  component: Notice,
  parameters: { layout: 'padded' },
  args: {
    title: 'No decals',
    children: 'Decals are optional. The card remains valid without them.',
  },
});

/** An optional part left empty: the quiet default, and not a live region, so page furniture never interrupts a screen reader. */
export const Neutral = meta.story({
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('status')).toBeNull();
    await expect(within(canvasElement).queryByRole('alert')).toBeNull();
    await expect(within(canvasElement).getByRole('note')).toHaveTextContent('No decals');
  },
});

/** Something to look at before going on. */
export const Caution = meta.story({
  args: {
    tone: 'caution',
    title: 'Linked token unavailable',
    children: 'The token this card points to was deleted or made private. Pick another one before publishing.',
  },
});

/** An action that just finished. */
export const Positive = meta.story({
  args: {
    tone: 'positive',
    title: undefined,
    children: 'The new Edition is now current. HTML and PDF are being prepared independently.',
  },
});

/** A fact that asks nothing of the reader. */
export const Info = meta.story({
  args: {
    tone: 'info',
    title: undefined,
    children: 'The saved draft already matches the current Edition.',
  },
});

/** A notice the reader settles on the spot carries its way on under the words. */
export const WithAction = meta.story({
  args: {
    tone: 'caution',
    title: 'Pending requests (2)',
    children: 'Two people asked to join this group.',
    action: <LabeledAction icon={<Eye size={16} />}>Review requests</LabeledAction>,
  },
});

/** One that follows the reader's own action is announced when it appears. */
export const Live = meta.story({
  args: {
    tone: 'caution',
    title: undefined,
    live: true,
    children: 'Another editor saved first. Your changes are still here. Review the differences before saving.',
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('Another editor saved first.');
  },
});

/**
 * An extra on a page that is about something else starts as its title on one line.
 * A press anywhere in the box opens it to the words, and another shuts it.
 */
export const Collapsible = meta.story({
  args: {
    tone: 'info',
    title: 'Shared by every variant',
    collapsible: true,
    children: 'The name, emblem, colors and background belong to the faction, not to this variant.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('button', { name: 'Shared by every variant' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByRole('region', { name: 'Shared by every variant' })).toBeNull();

    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.findByText(/belong to the faction/)).resolves.toBeVisible();

    /* The whole notice is the toggle: a press in its padding lands on the one button. */
    const notice = canvas.getByRole('note');
    const { left, bottom } = notice.getBoundingClientRect();
    const padding = notice.ownerDocument.elementFromPoint(left + 3, bottom - 3);
    await expect(padding).toBe(toggle);
    await userEvent.click(padding!);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Shared by every variant' })).toBeNull());
  },
});
