import preview from '@sb/preview';
import { Eye } from 'lucide-react';
import { expect, within } from 'storybook/test';

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
