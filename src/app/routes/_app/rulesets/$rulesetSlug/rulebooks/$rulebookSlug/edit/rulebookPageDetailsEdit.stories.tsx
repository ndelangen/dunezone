import preview from '@sb/preview';
import { expect, userEvent, within } from 'storybook/test';

import { HeadingIconStory } from './rulebookIllustratedBook.stories.fixture';
import {
  onBlockDrag,
  movement,
  stormTiming,
  terrainSequence,
  retreatSequence,
  exampleList,
  stormFigure,
  PageDetailsStory,
  pageDetailsCanvas,
  populatedRulesRegions,
} from './rulebookPageDetailsEdit.stories.fixture';

const meta = preview.meta({
  title: 'Page/Details/Editing',
  parameters: { layout: 'centered' },
});

export const EmptyVisualReference = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{
        title: 'Markers and tokens',
        anchor: 'markers-and-tokens',
        showHeading: true,
      }}
      initialRegions={[
        {
          key: 'rail',
          label: 'Figures',
          blocks: [],
          collapsed: false,
          containsActiveBlock: false,
        },
        {
          key: 'content',
          label: 'Notes',
          blocks: [],
          collapsed: false,
          containsActiveBlock: false,
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = pageDetailsCanvas(canvasElement);
    await expect(canvas.getAllByText('No Blocks in this region.')).toHaveLength(2);
    await expect(canvas.getByLabelText('Figures')).toHaveTextContent('0 Blocks');
  },
});

export const CollapsedRegions = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{ title: 'Movement', anchor: 'movement', showHeading: true }}
      initialRegions={[
        {
          key: 'column1',
          label: 'Rules',
          blocks: [movement, stormTiming],
          collapsed: false,
          containsActiveBlock: false,
        },
        {
          key: 'column2',
          label: 'Examples',
          blocks: [exampleList, stormFigure],
          collapsed: true,
          containsActiveBlock: false,
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = pageDetailsCanvas(canvasElement);
    await expect(canvas.getByLabelText('Examples')).toHaveAccessibleDescription('2 Blocks');
    await expect(
      canvas.queryByRole('button', {
        name: 'Edit Confirm that the destination is adjacent.',
      })
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Expand Examples' }));
    await expect(
      canvas.getByRole('button', {
        name: 'Edit Confirm that the destination is adjacent.',
      })
    ).toBeVisible();
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

export const InvalidCommonValues = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{ title: '', anchor: 'Movement section', showHeading: true }}
      diagnostics={{
        title: 'Enter a Page title.',
        anchor: 'Use lowercase letters, numbers, and single hyphens.',
      }}
      initialRegions={populatedRulesRegions}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = pageDetailsCanvas(canvasElement);
    await expect(canvas.getByRole('textbox', { name: 'Title' })).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByRole('textbox', { name: 'Anchor' })).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByText('Enter a Page title.')).toBeVisible();
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

/** The title icon chosen in the page details leads the rendered page heading, and clearing it takes it away. */
export const HeadingIcon = meta.story({
  render: () => <HeadingIconStory />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('combobox', { name: 'Title icon' })).toHaveValue('Battle');
    const heading = within(canvas.getByRole('article', { name: 'Rulebook page: Battle' })).getByRole('heading', {
      name: 'Battle',
      level: 1,
    });
    await expect(heading.querySelector('img')).toHaveAttribute('src', '/vector/icon/combat.svg');
    await userEvent.click(canvas.getByLabelText('Clear artwork'));
    await expect(heading.querySelector('img')).toBeNull();
  },
});
