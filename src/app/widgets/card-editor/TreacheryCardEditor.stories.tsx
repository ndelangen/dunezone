import preview from '@sb/preview';
import { expect, fn, userEvent, within } from 'storybook/test';

import { backgroundPresets } from '@game/data/backgrounds';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

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

export const ExistingLogoSymbol = meta.story({
  args: { chapter: 'icon' as const, draft: { ...INITIAL_TREACHERY_DRAFT, ...treacheryCardFixtures.richeseKarama } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const symbol = canvas.getByRole('combobox', { name: 'Icon' });
    await expect(symbol).toHaveValue('Richese');
    /* The icon chapter offers the symbol alone: no background or size controls. */
    await expect(canvas.queryByText('Icon background')).toBeNull();
    await expect(canvas.queryByRole('spinbutton')).toBeNull();
    await expect(args.patch).not.toHaveBeenCalled();
    await userEvent.click(symbol);
    await userEvent.type(symbol, 'shield');
    await userEvent.click(await page.findByRole('option', { name: /^Shield$/ }));
    await expect(args.patch).toHaveBeenCalledWith({
      icon: [backgroundPresets.stripedSpecial, '/vector/icon/shield.svg'],
    });
  },
});
