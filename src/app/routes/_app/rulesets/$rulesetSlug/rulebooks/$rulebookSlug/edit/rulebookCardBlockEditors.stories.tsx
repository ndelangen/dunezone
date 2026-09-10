import { Box } from '@mantine/core';
import preview from '@sb/preview';
import type { RulebookResolvedAssetsById } from '@shared/rulebooks/projectRenderDocument';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { RulebookBlockCanvas } from '@game/rulebook/RulebookBlockRenderer';
import { cardEntryFixture, cardGroupFixture, cardGuideAssets } from '@game/rulebook/RulebookCardGuides.stories.fixture';

import type { RulebookBlockEditorValue } from './rulebookBlockEditors';
import { CardEntryEdit, CardGroupEdit } from './rulebookCardBlockEditors';

function CardGroupStory({ assets = cardGuideAssets }: { assets?: RulebookResolvedAssetsById }) {
  const [value, setValue] = useState<RulebookBlockEditorValue<'card-group'>>(cardGroupFixture());
  return (
    <Box p="lg">
      <DocumentEditorLayout ratio={4 / 3} fit="width">
        <DocumentEditorLayout.Sidebar>
          <CardGroupEdit value={value} onChange={setValue} references={{ assetsById: assets, factionsById: {} }} />
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <RulebookBlockCanvas
            block={projectRulebookDraftRenderBlock({ ...value, id: 'CRDS', kind: 'card-group' }, assets)}
          />
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}
function CardEntryStory() {
  const [value, setValue] = useState<RulebookBlockEditorValue<'card-entry'>>(cardEntryFixture());
  return (
    <Box p="lg">
      <DocumentEditorLayout ratio={4 / 3} fit="width">
        <DocumentEditorLayout.Sidebar>
          <CardEntryEdit
            value={value}
            onChange={setValue}
            references={{ assetsById: cardGuideAssets, factionsById: {} }}
          />
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <RulebookBlockCanvas
            block={projectRulebookDraftRenderBlock({ ...value, id: 'CARD', kind: 'card-entry' }, cardGuideAssets)}
          />
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}
const meta = preview.meta({
  title: 'Blocks/Card guides',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

export const CardEntry = meta.story({
  render: () => <CardEntryStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const guidance = canvas.getByRole('textbox', { name: 'Guidance' });
    const original = (guidance as HTMLTextAreaElement).value;
    await userEvent.click(canvas.getByRole('button', { name: 'Clear Card' }));
    await expect(guidance).toHaveValue(original);
    await expect(canvas.getByRole('button', { name: 'Choose Card' })).toBeVisible();
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Quantity' }));
    await expect(canvas.getByRole('textbox', { name: 'Quantity' })).toHaveValue('');
  },
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
    handle.focus();
    await userEvent.keyboard('[Space][ArrowDown][ArrowDown][Space]');
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
