import { testingPreview } from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { addSceneItem } from './rulebookSceneInteractions.stories.fixture';
import { SceneEditorStory } from './rulebookScenes.stories.fixture';

const meta = testingPreview.meta({
  title: 'Blocks/Board scene/Editing',
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
    await addSceneItem(canvasElement, 'Annotations (0)', 'Add annotation');
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
    await addSceneItem(canvasElement, 'Annotations (0)', 'Add annotation');
    await expect(canvasElement.querySelector('.rulebookTerritoryScene')).toHaveAttribute('data-size', 'large');
    const board = canvasElement.querySelector<SVGElement>('.rulebookTerritoryScene')!;
    const automaticHeight = board.getBoundingClientRect().height;
    await userEvent.click(canvas.getByRole('combobox', { name: 'Board size' }));
    await userEvent.click(await portal.findByRole('option', { name: 'Fill available width' }));
    await expect(canvasElement.querySelector('.rulebookTerritoryScene')).toHaveAttribute('data-size', 'fit-width');
    await userEvent.click(boardSize);
    await userEvent.click(await portal.findByRole('option', { name: 'Compact' }));
    await expect(canvasElement.querySelector('.rulebookTerritoryScene')).toHaveAttribute('data-size', 'compact');
    await expect(board.getBoundingClientRect().height).toBeLessThan(automaticHeight);
    await userEvent.click(boardSize);
    await userEvent.click(await portal.findByRole('option', { name: 'Automatic' }));
    await expect(canvasElement.querySelector('.rulebookTerritoryScene')).toHaveAttribute('data-size', 'large');
    await expect(board.getBoundingClientRect().height).toBeCloseTo(automaticHeight, 0);
    await addSceneItem(canvasElement, 'Routes (0)', 'Add route');
    await userEvent.click(canvas.getByRole('button', { name: 'Add waypoint' }));
    /* Mantine hides a dropdown whose target is scrolled out of view, and this one sits below the sidebar's fold. */
    const blockedSegment = await canvas.findByRole('combobox', { name: 'Blocked segment' });
    /*
     * The Routes panel opens on a height transition and runs another when a waypoint makes it taller.
     * Until it settles it clips and scrolls its own content, so a scroll made earlier is undone as it grows, and Mantine hides the dropdown of a target that left the view.
     */
    const routesPanel = blockedSegment.closest<HTMLElement>('.mantine-Accordion-panel')!;
    await waitForFrame(() => expect(finishTransitions(routesPanel).style.height).toBe(''));
    blockedSegment.scrollIntoView({ block: 'center', behavior: 'instant' });
    await userEvent.click(blockedSegment);
    await userEvent.click(await portal.findByRole('option', { name: 'Waypoint 1 to 2' }));
    await expect(canvasElement.querySelectorAll('[data-route-segment]')).toHaveLength(2);
    await expect(canvasElement.querySelectorAll('[data-route-segment][data-blocked]')).toHaveLength(1);
    await userEvent.click(canvas.getByRole('switch', { name: 'Number the waypoints' }));
    await expect(canvasElement.querySelectorAll('[data-rulebook-route] text')).toHaveLength(0);
    await userEvent.click(canvas.getByRole('switch', { name: 'Position waypoint 1 manually' }));
    await expect(canvas.getByRole('textbox', { name: 'Waypoint 1 x' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Remove last route' }));
    await expect(canvasElement.querySelectorAll('[data-route-segment]')).toHaveLength(0);
  },
});
