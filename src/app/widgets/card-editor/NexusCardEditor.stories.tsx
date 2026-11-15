import { TextInput } from '@mantine/core';
import preview from '@sb/preview';
import { GF9_NEXUS_CARDS } from '@shared/assets/gf9Nexus';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import type { ComponentProps } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { INITIAL_NEXUS_MEMORY, NexusCardEditor } from './NexusCardEditor';

const meta = preview.meta({
  title: 'Nexus Card Editor',
  component: NexusCardEditor,
  args: {
    nameField: <TextInput aria-label="Name" readOnly value="Atreides" />,
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

/* The page's workbench frame gives the editor its reading column, so the Faction field shows at the width a page gives it. */
const inWorkbench = {
  parameters: { layout: 'padded' as const },
  render: (args: ComponentProps<typeof NexusCardEditor>) => (
    <WorkbenchLayout>
      <NexusCardEditor {...args} />
    </WorkbenchLayout>
  ),
};

/* A saved card's link: the Faction's id and its own address. */
const LINKED = { ...GF9_NEXUS_CARDS[0]!, factionLink: { id: 'house-atreides', slug: 'house-atreides' } };

/** The Faction chapter on a linked card: the link is the field, with the Faction's variant count beside it and Change faction as its tool. */
export const Faction = meta.story({
  ...inWorkbench,
  args: {
    chapter: 'faction' as const,
    draft: LINKED,
    linkedFaction: { ...LINKED.factionLink, variantCount: 3, formerVariant: null },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Atreides' })).toBeVisible();
    await expect(canvas.getByRole('img', { name: '3 variants' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Change faction' })).toBeVisible();
    await expect(canvas.queryByRole('option')).toBeNull();
  },
});
