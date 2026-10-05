import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { SceneEditorStory } from './rulebookScenes.stories.fixture';

const meta = preview.meta({
  title: 'Blocks/Board scene/Editing',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'fullscreen' },
});
export const MarkersAndAnnotations = meta.story({
  render: () => <SceneEditorStory kind="board" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('switch', { name: 'Show storm' }));
    const angle = canvas.getByRole('textbox', { name: 'Storm angle' });
    await userEvent.clear(angle);
    await userEvent.type(angle, '45');
    await userEvent.tab();
    await expect(angle).toHaveValue('45');
    await userEvent.click(canvas.getByRole('button', { name: 'Annotations (0)' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Add annotation' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Annotation 1 title' }), 'Shared territory');
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Annotation 1 explanation' }),
      'Both factions have troops here.'
    );
    await expect(canvas.getByText('Both factions have troops here.', { selector: 'p' })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole('switch', { name: 'Point at another location' }));
    await expect(canvas.getByRole('textbox', { name: 'Annotation 1 target x' })).toBeVisible();
    await userEvent.click(canvas.getByRole('switch', { name: 'Focus on part of the board' }));
    await expect(canvas.getByRole('textbox', { name: 'Crop x' })).toHaveValue('0');
  },
});

export const RoutesAndSizing = meta.story({
  render: () => <SceneEditorStory kind="board" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const portal = within(canvasElement.ownerDocument.body);
    const boardSize = canvas.getByRole('combobox', { name: 'Board size' });
    await expect(boardSize).toHaveValue('Automatic');
    await expect(canvasElement.querySelector('.rulebookTerritoryScene')).toHaveAttribute('data-size', 'compact');
    await userEvent.click(canvas.getByRole('button', { name: 'Annotations (0)' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Add annotation' }));
    await expect(canvasElement.querySelector('.rulebookTerritoryScene')).toHaveAttribute('data-size', 'large');
    await userEvent.click(canvas.getByRole('combobox', { name: 'Board size' }));
    await userEvent.click(portal.getByRole('option', { name: 'Fill available width' }));
    await expect(canvasElement.querySelector('.rulebookTerritoryScene')).toHaveAttribute('data-size', 'fit-width');
    await userEvent.click(boardSize);
    await userEvent.click(portal.getByRole('option', { name: 'Compact' }));
    await expect(canvasElement.querySelector('.rulebookTerritoryScene')).toHaveAttribute('data-size', 'compact');
    await userEvent.click(boardSize);
    await userEvent.click(portal.getByRole('option', { name: 'Automatic' }));
    await expect(canvasElement.querySelector('.rulebookTerritoryScene')).toHaveAttribute('data-size', 'large');
    await userEvent.click(canvas.getByRole('button', { name: 'Routes (0)' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Add route' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Add waypoint' }));
    await userEvent.click(canvas.getByRole('combobox', { name: 'Blocked segment' }));
    await userEvent.click(portal.getByRole('option', { name: 'Waypoint 1 to 2' }));
    expect(canvasElement.querySelectorAll('[data-route-segment]')).toHaveLength(2);
    expect(canvasElement.querySelectorAll('[data-route-segment][data-blocked]')).toHaveLength(1);
    await userEvent.click(canvas.getByRole('switch', { name: 'Number the waypoints' }));
    expect(canvasElement.querySelectorAll('[data-rulebook-route] text')).toHaveLength(0);
    await userEvent.click(canvas.getByRole('switch', { name: 'Position waypoint 1 manually' }));
    await expect(canvas.getByRole('textbox', { name: 'Waypoint 1 x' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Remove last route' }));
    expect(canvasElement.querySelectorAll('[data-route-segment]')).toHaveLength(0);
  },
});
