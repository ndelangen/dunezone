import { Box } from '@mantine/core';
import preview from '@sb/preview';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { boardExplainerFixture, leaderExplainerFixture } from '@game/rulebook/RulebookAssetExplainer.stories.fixture';
import { RulebookBlockCanvas } from '@game/rulebook/RulebookBlockRenderer';

import { AssetExplainerEdit } from './rulebookAssetExplainerEdit';
import type { RulebookBlockEditorValue } from './rulebookBlockEditors';
import type { RulebookEditorReferences } from './rulebookVisualBlockEditors';

type Explainer = Extract<RulebookRenderBlockV1, { kind: 'asset-explainer' }>;
function ExplainerStory({ initial, unavailable = false }: { initial: Explainer; unavailable?: boolean }) {
  const [value, setValue] = useState<RulebookBlockEditorValue<'asset-explainer'>>({
    source: initial.source.status === 'unselected' ? undefined : initial.source.reference,
    caption: initial.caption,
    numbering: initial.numbering,
    colorMode: initial.colorMode,
    itemOrder: initial.items.map((item) => item.id),
    itemsById: Object.fromEntries(initial.items.map((item) => [item.id, item])),
  });
  const source = initial.source;
  const references: RulebookEditorReferences = { assetsById: {}, factionsById: {} };
  if (!unavailable && source.status === 'ready' && source.reference.kind === 'faction-member') {
    const factionId = source.reference.factionId;
    references.factionsById = { [factionId]: { factionId, name: 'Atreides', color: '#374b2d', leaders: [source] } };
  }
  return (
    <Box p="lg">
      <DocumentEditorLayout ratio={4 / 3} fit="width">
        <DocumentEditorLayout.Sidebar>
          <AssetExplainerEdit value={value} onChange={setValue} references={references} />
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <RulebookBlockCanvas
            block={projectRulebookDraftRenderBlock(
              { ...value, id: 'EXPL', kind: 'asset-explainer' },
              references.assetsById,
              references.factionsById
            )}
          />
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}
const meta = preview.meta({
  title: 'Blocks/AssetExplainer',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});

export const Board = meta.story({
  render: () => <ExplainerStory initial={boardExplainerFixture()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      portal = within(canvasElement.ownerDocument.body);
    await expect(canvas.queryByRole('textbox', { name: 'Marker label' })).toBeNull();
    await expect(canvas.queryByRole('textbox', { name: 'Marker number' })).toBeNull();
    await userEvent.click(canvas.getByRole('combobox', { name: 'Marker labels' }));
    await userEvent.click(portal.getByRole('option', { name: 'Custom labels' }));
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Marker label' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Marker label' }), '★');
    await userEvent.click(canvas.getByRole('switch', { name: 'Automatic colors' }));
    await expect(canvas.getByRole('textbox', { name: 'Marker color' })).toHaveValue('#9c2920');
    await userEvent.clear(canvas.getByRole('textbox', { name: 'Marker color' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Marker color' }), '#2');
    await expect(canvas.getByRole('textbox', { name: 'Marker color' })).toHaveValue('#2');
    await userEvent.click(canvas.getByRole('switch', { name: 'Automatic colors' }));
    await expect(canvas.queryByRole('textbox', { name: 'Marker color' })).toBeNull();
    await userEvent.click(canvas.getByRole('switch', { name: 'Automatic colors' }));
    await expect(canvas.getByRole('textbox', { name: 'Marker color' })).toHaveValue('#9c2920');
    const handle = canvas.getByRole('button', { name: 'Reorder explanation 1' });
    handle.focus();
    await userEvent.keyboard('[Space][ArrowDown][Space]');
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: '★. Arrakeen' })).toHaveAttribute('aria-pressed', 'true')
    );
    await expect(canvas.getByRole('textbox', { name: 'Marker label' })).toHaveValue('★');
    await expect(canvas.getByRole('textbox', { name: 'Marker color' })).toHaveValue('#9c2920');
    await userEvent.click(canvas.getByRole('combobox', { name: 'Marker labels' }));
    await userEvent.click(portal.getByRole('option', { name: 'Automatic numbers (1, 2, 3)' }));
    await expect(canvas.queryByRole('textbox', { name: 'Marker label' })).toBeNull();
    await expect(canvas.getByRole('button', { name: '2. Arrakeen' })).toHaveAttribute('aria-pressed', 'true');
  },
});
export const Leader = meta.story({
  render: () => <ExplainerStory initial={leaderExplainerFixture()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      portal = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: 'Add explanation' }));
    await expect(canvas.getByRole('textbox', { name: 'Explanation' })).toHaveValue('');
    await expect(canvas.getByRole('combobox', { name: 'Part of the component' })).toHaveValue('');
    await userEvent.click(canvas.getByRole('combobox', { name: 'Target type' }));
    await userEvent.click(portal.getByRole('option', { name: 'Positioned marker' }));
    const horizontal = canvas.getByRole('textbox', { name: 'Horizontal position' });
    await userEvent.clear(horizontal);
    await userEvent.type(horizontal, '82');
    await userEvent.tab();
    await expect(horizontal).toHaveValue('82%');
    await expect(canvas.getByRole('slider', { name: 'Horizontal position slider' })).toHaveAttribute(
      'aria-valuenow',
      '82'
    );
    await userEvent.type(canvas.getByRole('textbox', { name: 'Explanation' }), 'A positioned detail.');
    await userEvent.click(canvas.getByRole('button', { name: 'Remove last explanation' }));
    await expect(canvas.getAllByRole('button', { name: /Reorder explanation/ })).toHaveLength(4);
    await expect(canvas.queryByRole('slider', { name: 'Horizontal position slider' })).toBeNull();
  },
});
export const MissingSource = meta.story({
  render: () => <ExplainerStory initial={leaderExplainerFixture()} unavailable />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Unavailable source' })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Explanation' })).toHaveValue(
      leaderExplainerFixture().items[0]!.text
    );
    await expect(canvas.getByRole('combobox', { name: 'Part of the component' })).toHaveValue('Portrait (unavailable)');
  },
});
export const Empty = meta.story({
  render: () => (
    <ExplainerStory initial={{ ...leaderExplainerFixture(), source: { status: 'unselected' }, items: [] }} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Remove last explanation' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Add explanation' }));
    await expect(canvas.getByRole('textbox', { name: 'Explanation' })).toHaveValue('');
    await expect(canvas.getByRole('combobox', { name: 'Part of the component' })).toHaveValue('');
    await userEvent.type(canvas.getByRole('textbox', { name: 'Explanation' }), 'Remove this explanation.');
    await userEvent.click(canvas.getByRole('button', { name: 'Remove last explanation' }));
    await expect(canvas.getByRole('button', { name: 'Remove last explanation' })).toBeDisabled();
    await expect(canvas.queryByRole('textbox', { name: 'Explanation' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Add explanation' }));
    await expect(canvas.getByRole('textbox', { name: 'Explanation' })).toHaveValue('');
    await expect(canvas.getAllByRole('button', { name: /Reorder explanation/ })).toHaveLength(1);
  },
});

export const ReplacedSource = meta.story({
  render: () => {
    const initial = leaderExplainerFixture();
    return (
      <ExplainerStory
        initial={{
          ...initial,
          items: initial.items.map((item) => ({
            ...item,
            target: { ...item.target, source: { kind: 'board', boardId: 'arrakis' } },
          })),
        }}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      portal = within(canvasElement.ownerDocument.body);
    const part = canvas.getByRole('combobox', { name: 'Part of the component' });
    await expect(part).toHaveAttribute('placeholder', 'Portrait (previous source)');
    await expect(canvas.getByRole('button', { name: '1. Portrait (unavailable)' })).toBeVisible();
    await userEvent.click(part);
    await userEvent.click(portal.getByRole('option', { name: 'Portrait' }));
    await expect(canvas.getByRole('button', { name: '1. Portrait' })).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Explanation' })).toHaveValue(
      leaderExplainerFixture().items[0]!.text
    );
  },
});
