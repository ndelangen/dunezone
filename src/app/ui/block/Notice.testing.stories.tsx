import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { Notice } from './Notice';

const meta = testingPreview.meta({
  component: Notice,
  parameters: { layout: 'padded' },
  args: {
    title: 'Shared by every variant',
    children: 'The name, emblem, colors and background belong to the faction, not to this variant.',
  },
});

/**
 * A collapsible notice opens to its words on a press, and shuts on a press anywhere in its box.
 * It ends shut, as a reader first meets it.
 */
export const CollapsibleOpensAndShuts = meta.story({
  args: { tone: 'info', collapsible: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('button', { name: 'Shared by every variant' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    /* Shut, it is the title alone on one line, level with the glyph. */
    const notice = canvas.getByRole('note');
    await expect(notice.getBoundingClientRect().height).toBeLessThan(64);

    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    /* The panel opens with a short animation, so wait for the words to show. */
    await waitFor(() => expect(canvas.getByText(/belong to the faction/)).toBeVisible());

    /* The whole notice is the toggle: a press in its padding lands on the one button. */
    const { left, bottom } = notice.getBoundingClientRect();
    const padding = notice.ownerDocument.elementFromPoint(left + 3, bottom - 3);
    await expect(padding).toBe(toggle);
    await userEvent.click(padding!);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(canvas.queryByRole('region', { name: 'Shared by every variant' })).toBeNull());
  },
});
