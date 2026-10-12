import preview from '@sb/preview';
import { GF9_NEXUS_CARDS } from '@shared/assets/gf9Nexus';
import { expect, fn, userEvent, within } from 'storybook/test';

import { INITIAL_NEXUS_MEMORY, NexusCardEditor } from './NexusCardEditor';

const meta = preview.meta({
  title: 'Nexus Card Editor',
  component: NexusCardEditor,
  args: {
    nameField: <input aria-label="Name" readOnly value="Atreides" />,
    draft: GF9_NEXUS_CARDS[0]!,
    patch: fn(),
    memory: INITIAL_NEXUS_MEMORY,
    remember: fn(),
    chapter: 'head' as const,
    onChapterChange: fn(),
    onSettle: fn(),
  },
});

export const Head = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText('Head background')).toBeNull();
    await expect(canvas.getByRole('textbox', { name: 'Type' })).toHaveAttribute('readonly');
    await expect(canvas.getByRole('textbox', { name: 'Type' })).toHaveValue('Nexus');
  },
});
export const Effects = meta.story({
  args: { chapter: 'effects' as const },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const cunning = canvas.getByRole('textbox', { name: 'Cunning' });
    await userEvent.clear(cunning);
    await userEvent.type(cunning, 'Custom cunning');
    await expect(args.patch).toHaveBeenCalled();
    await expect(canvas.getByRole('textbox', { name: 'Betrayal' })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Secret Ally' })).toBeVisible();
  },
});
