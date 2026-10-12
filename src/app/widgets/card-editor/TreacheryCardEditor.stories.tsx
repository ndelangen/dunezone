import preview from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { backgroundPresets } from '@game/data/backgrounds';

import { INITIAL_TREACHERY_DRAFT, INITIAL_TREACHERY_MEMORY, TreacheryCardEditor } from './TreacheryCardEditor';

const meta = preview.meta({
  title: 'Treachery Card Editor',
  component: TreacheryCardEditor,
  args: {
    nameField: <input aria-label="Name" readOnly value="Lasgun" />,
    draft: { ...INITIAL_TREACHERY_DRAFT, name: 'Lasgun', subName: 'Weapon - Special' },
    patch: fn(),
    memory: INITIAL_TREACHERY_MEMORY,
    remember: fn(),
    chapter: 'head' as const,
    onChapterChange: fn(),
    onSettle: fn(),
  },
});

export const Category = meta.story({
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await expect(canvas.queryByText('Head background')).toBeNull();
    await expect(canvas.queryByRole('radio', { name: 'Custom' })).toBeNull();
    await userEvent.click(canvas.getByRole('combobox', { name: 'Category' }));
    await userEvent.click(await page.findByRole('option', { name: /^Defense$/ }));
    await expect(args.patch).toHaveBeenCalledWith({
      head: backgroundPresets.defense,
      icon: [backgroundPresets.stripedDefense, INITIAL_TREACHERY_DRAFT.icon[1]],
    });
  },
});
export const Symbol = meta.story({
  args: { chapter: 'icon' as const },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: 'Icon' })).toBeVisible();
    await expect(canvas.queryByText('Icon background')).toBeNull();
    await expect(canvas.queryByRole('spinbutton')).toBeNull();
  },
});
