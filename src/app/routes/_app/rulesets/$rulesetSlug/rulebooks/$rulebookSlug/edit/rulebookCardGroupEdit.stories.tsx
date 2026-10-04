import preview from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { cardGroupFixture, cardGuideAssets } from '@game/rulebook/RulebookCardGuides.stories.fixture';

import { CardGroupStory } from './rulebookCardBlockEditors.shared.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Card group/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

export const CardGroup = meta.story({
  render: () => <CardGroupStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const portal = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Treatment' }));
    await userEvent.click(portal.getByRole('option', { name: 'Featured Card' }));
    await expect(canvas.getByRole('combobox', { name: 'Featured Card' })).toHaveValue('1. Supplies!');
    const handle = canvas.getByRole('button', { name: 'Reorder Card 1' });
    handle.scrollIntoView({ block: 'center', behavior: 'instant' });
    handle.focus();
    await userEvent.keyboard('[Space]');
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.keyboard('[ArrowDown]');
    await waitFor(() =>
      expect(portal.getByText('Draggable item SUPL was moved over droppable area SEED.')).toBeInTheDocument()
    );
    await userEvent.keyboard('[ArrowDown]');
    await waitFor(() =>
      expect(portal.getByText('Draggable item SUPL was moved over droppable area TRSH.')).toBeInTheDocument()
    );
    await userEvent.keyboard('[Space]');
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: '3. Supplies!' })).toHaveAttribute('aria-pressed', 'true')
    );
    await expect(canvas.getByRole('combobox', { name: 'Featured Card' })).toHaveValue('3. Supplies!');
    await expect(canvas.getByRole('textbox', { name: 'Guidance' })).toHaveValue(
      cardGroupFixture().itemsById.SUPL!.text
    );
    await userEvent.click(canvas.getByRole('combobox', { name: 'Treatment' }));
    await userEvent.click(portal.getByRole('option', { name: 'Gallery' }));
    await expect(canvas.queryByRole('combobox', { name: 'Featured Card' })).toBeNull();
    await userEvent.click(canvas.getByRole('combobox', { name: 'Treatment' }));
    await userEvent.click(portal.getByRole('option', { name: 'Featured Card' }));
    await expect(canvas.getByRole('combobox', { name: 'Featured Card' })).toHaveValue('3. Supplies!');
    await userEvent.click(canvas.getByRole('button', { name: 'Remove last Card' }));
    await expect(canvas.getByRole('combobox', { name: 'Featured Card' })).toHaveValue('');
    await expect(canvas.getAllByRole('button', { name: /Reorder Card/ })).toHaveLength(2);
    await userEvent.click(canvas.getByRole('button', { name: 'Add Card' }));
    await expect(canvas.getByRole('textbox', { name: 'Guidance' })).toHaveValue('');
    await expect(canvas.getByRole('button', { name: 'Choose Card' })).toBeVisible();
  },
});

export const AwaitingImages = meta.story({
  render: () => (
    <CardGroupStory
      assets={Object.fromEntries(
        Object.entries(cardGuideAssets).map(([id, asset]) => [id, { ...asset, imageUrl: null }])
      )}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const portal = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByRole('button', { name: '1. Supplies!' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: '2. Ernoc Seed!' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: '3. Trishula!' })).toBeVisible();
    await userEvent.click(canvas.getByRole('combobox', { name: 'Treatment' }));
    await userEvent.click(portal.getByRole('option', { name: 'Featured Card' }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'Featured Card' }));
    await userEvent.click(portal.getByRole('option', { name: '2. Ernoc Seed!' }));
    await expect(canvas.getByRole('combobox', { name: 'Featured Card' })).toHaveValue('2. Ernoc Seed!');
  },
});
