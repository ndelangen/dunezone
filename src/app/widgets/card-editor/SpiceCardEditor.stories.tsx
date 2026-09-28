import preview from '@sb/preview';
import { publishingSpiceCard } from '@shared/assets/fixtures/publishingSpiceCard';
import { expect, fn, userEvent, within } from 'storybook/test';

import { INITIAL_SPICE_DRAFT, SpiceCardEditor, spiceDraftWarnings } from './SpiceCardEditor';

const meta = preview.meta({
  title: 'Spice Card Editor',
  component: SpiceCardEditor,
  args: {
    nameField: <input aria-label="Name" readOnly value="Arsunt" />,
    draft: publishingSpiceCard,
    patch: fn(),
    chapter: 'head' as const,
    onChapterChange: fn(),
    onSettle: fn(),
  },
});

/** The Head chapter: name, type line and the icon choice, beside the live proof. */
export const Head = meta.story({
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Type' })).toHaveValue('Spice blow');
    await userEvent.click(canvas.getByText('Spice mine'));
    await expect(args.patch).toHaveBeenLastCalledWith({ icon: 'spice-mine' });
  },
});

/** The Map chapter, where the highlighted territories are chosen by their readable names and added to the ones already there. */
export const Territories = meta.story({
  args: { chapter: 'map' as const },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(canvas.getByRole('combobox', { name: 'Highlighted territories' }), 'Broken');
    await userEvent.click(await page.findByRole('option', { name: 'Broken Land' }));
    await expect(args.patch).toHaveBeenLastCalledWith({ highlights: ['arsunt', 'broken-land'] });
  },
});

/** The Body chapter: the amount is a whole number of at least one, and an empty body prints the standard sentence. */
export const Body = meta.story({
  args: { chapter: 'body' as const },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Body' })).toHaveValue('');
    /* The proof prints the renderer's own sentence, whose amount is marked up. */
    await expect(canvas.getByText('6 spice')).toBeVisible();
    const amount = canvas.getByRole('textbox', { name: 'Amount' });
    await userEvent.tripleClick(amount);
    await userEvent.keyboard('9');
    await expect(args.patch).toHaveBeenLastCalledWith({ amount: 9 });
  },
});

/** A fresh card warns about its missing name and territory rather than refusing to draw. */
export const Blank = meta.story({
  args: { draft: INITIAL_SPICE_DRAFT, nameField: <input aria-label="Name" readOnly value="" /> },
  play: async () => {
    await expect(spiceDraftWarnings(INITIAL_SPICE_DRAFT).map(({ missing }) => missing)).toEqual([
      'a name',
      'a highlighted territory',
    ]);
  },
});
