import { testingPreview } from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import {
  onPageChange,
  onNavigateBlock,
  onAddBlock,
  onToggleBlockRegion,
  PageDetailsStory,
  pageDetailsCanvas,
  populatedRulesRegions,
  onBlockDrag,
  movement,
  stormTiming,
  terrainSequence,
  retreatSequence,
} from './rulebookPageDetailsEdit.stories.fixture';

const meta = testingPreview.meta({
  title: 'Page/Details/Editing',
  parameters: { layout: 'centered' },
});

export const PopulatedRulesPage = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{ title: 'Movement', anchor: 'movement', showHeading: true }}
      initialRegions={populatedRulesRegions}
    />
  ),
  play: async ({ canvasElement }) => {
    onPageChange.mockClear();
    onNavigateBlock.mockClear();
    onAddBlock.mockClear();
    onToggleBlockRegion.mockClear();
    const canvas = pageDetailsCanvas(canvasElement);
    const title = canvas.getByRole('textbox', { name: 'Title' });
    const anchor = canvas.getByRole('textbox', { name: 'Anchor' });
    await expect(canvas.getAllByRole('textbox').slice(0, 2)).toEqual([anchor, title]);
    await expect(anchor.parentElement?.querySelector('svg')).not.toBeNull();
    await expect(canvas.getAllByRole('img', { name: 'Help' })).toHaveLength(4);
    await userEvent.clear(title);
    await userEvent.type(title, 'Advanced movement');
    await expect(onPageChange).toHaveBeenLastCalledWith({
      title: 'Advanced movement',
      anchor: 'movement',
      showHeading: true,
    });
    anchor.focus();
    await expect(anchor).toHaveFocus();
    const movementButton = canvas.getByRole('button', {
      name: 'Edit Movement sequence',
    });
    await expect(within(movementButton).queryByText('Text')).not.toBeInTheDocument();
    const rules = canvas.getByLabelText('Rules');
    const rulesHeader = rules.querySelector<HTMLElement>('[data-region-header]');
    await expect(rulesHeader).not.toBeNull();
    await expect(rulesHeader!.getBoundingClientRect().right).toBeLessThanOrEqual(rules.getBoundingClientRect().right);
    await expect(rulesHeader!.getBoundingClientRect().left).toBe(rules.getBoundingClientRect().left);
    await expect(rulesHeader!.querySelector('svg')?.getBoundingClientRect().left).toBe(
      rulesHeader!.getBoundingClientRect().left
    );
    const addButtons = canvas.getAllByRole('button', {
      name: /^Add a Block to/,
    });
    const addButtonRightEdges = addButtons.map((button) => button.getBoundingClientRect().right);
    await expect(new Set(addButtonRightEdges).size).toBe(1);
    await expect(addButtonRightEdges[0]).toBe(rulesHeader!.getBoundingClientRect().right);
    movementButton.focus();
    await expect(onNavigateBlock).not.toHaveBeenCalled();
    await userEvent.keyboard('[Enter]');
    await expect(onNavigateBlock).toHaveBeenCalledWith('MVVE');
    await userEvent.click(canvas.getByRole('button', { name: 'Add a Block to Rules' }));
    const page = within(canvasElement.ownerDocument.body);
    /*
     * The dropdown mounts at opacity 0 from one animation-frame callback and starts its fade only from the next, so a page whose frames run late fails a plain wait with the item already found.
     * Each poll runs the waiting frames itself (https://github.com/ndelangen/dunezone/issues/1199).
     */
    await waitForFrame(() => expect(finishTransitions(page.getByRole('menuitem', { name: 'Text' }))).toBeVisible());
    await userEvent.click(page.getByRole('menuitem', { name: 'Text' }));
    await expect(onAddBlock).toHaveBeenCalledWith('column1', 'text');
    await userEvent.click(canvas.getByRole('button', { name: 'Collapse Examples' }));
    await expect(onToggleBlockRegion).toHaveBeenCalledWith('column2', true);
    await expect(canvas.getByRole('button', { name: 'Expand Examples' })).toBeVisible();
    const exampleBlocks = canvasElement.ownerDocument.getElementById('page-details-region-column2')!;
    await expect(exampleBlocks).not.toBeVisible();
    await expect(exampleBlocks.getBoundingClientRect().height).toBe(0);
    await userEvent.click(canvas.getByRole('button', { name: 'Expand Examples' }));
    await expect(exampleBlocks).toBeVisible();
    await expect(exampleBlocks.getBoundingClientRect().height).toBeGreaterThan(0);
    await userEvent.clear(title);
    await userEvent.type(title, 'Movement');
  },
});

export const DragBetweenCompatibleRegions = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{ title: 'Movement', anchor: 'movement', showHeading: true }}
      initialRegions={[
        {
          key: 'column1',
          label: 'Rules',
          blocks: [stormTiming],
          collapsed: false,
          containsActiveBlock: false,
        },
        {
          key: 'column2',
          label: 'Examples',
          blocks: [],
          collapsed: false,
          containsActiveBlock: false,
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    onBlockDrag.mockClear();
    const canvas = pageDetailsCanvas(canvasElement);
    const handle = within(canvas.getByLabelText('Rules')).getByRole('button', {
      name: 'Edit The storm closes the boundary between its two sectors.',
    });
    handle.focus();
    await userEvent.keyboard('[Space][ArrowDown][Space]');
    await expect(onBlockDrag).toHaveBeenCalledWith(expect.objectContaining({ kind: 'commit', blockId: 'TEXT' }));
    await expect(canvas.getByLabelText('Examples')).toHaveTextContent(
      'The storm closes the boundary between its two sectors.'
    );
  },
});

export const SameRegionDragCommitsOnDrop = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{ title: 'Movement', anchor: 'movement', showHeading: true }}
      initialRegions={[
        {
          key: 'column1',
          label: 'Rules',
          blocks: [movement, terrainSequence, retreatSequence],
          collapsed: false,
          containsActiveBlock: false,
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    onBlockDrag.mockClear();
    const canvas = pageDetailsCanvas(canvasElement);
    const row = canvas.getByRole('button', { name: 'Edit Movement sequence' });
    row.focus();
    await userEvent.keyboard('[Space][ArrowDown]');
    const sourceRow = row.closest<HTMLElement>('li');
    const dragPreview = canvasElement.ownerDocument.querySelector<HTMLElement>('[data-block-drag-preview]');
    await expect(sourceRow).not.toBeNull();
    await expect(dragPreview).not.toBeNull();
    await expect(
      Math.abs(dragPreview!.getBoundingClientRect().width - sourceRow!.getBoundingClientRect().width)
    ).toBeLessThan(1);
    await expect(onBlockDrag.mock.calls.filter(([event]) => event.kind === 'commit')).toHaveLength(0);
    await userEvent.keyboard('[Space]');
    await expect(onBlockDrag.mock.calls.filter(([event]) => event.kind === 'commit')).toEqual([
      [
        {
          kind: 'commit',
          blockId: 'MVVE',
          placement: { regionKey: 'column1', index: 1 },
        },
      ],
    ]);
  },
});

export const InteriorHeadingVisibility = meta.story({
  render: () => (
    <PageDetailsStory initialValue={{ anchor: 'movement', title: 'Movement', showHeading: true }} initialRegions={[]} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('switch', { name: 'Show page heading' });
    await userEvent.click(toggle);
    await expect(toggle).not.toBeChecked();
    await expect(canvas.getByRole('textbox', { name: 'Title' })).toHaveValue('Movement');
  },
});
