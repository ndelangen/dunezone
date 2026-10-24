import { testingPreview } from '@sb/preview';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { boardExplainerFixture, leaderExplainerFixture } from '@game/rulebook/RulebookAssetExplainer.stories.fixture';

import { ExplainerStory } from './rulebookAssetExplainerEdit.stories.fixture';

const meta = testingPreview.meta({
  title: 'Blocks/Annotated component/Editing',
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
