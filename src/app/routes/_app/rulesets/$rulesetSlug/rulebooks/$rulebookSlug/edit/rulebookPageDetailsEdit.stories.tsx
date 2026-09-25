import { Box, Menu } from '@mantine/core';
import preview from '@sb/preview';
import type { RulebookBlockDraft, RulebookBlockRegionKey } from '@shared/rulebooks/contents';
import { AddAction } from '@ui/control/ListLengthActions';
import { NestedTabs } from '@ui/surface';
import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { rulebookBlockIcon, rulebookLayoutIcon, rulebookRegionIcon } from './rulebookEditorIcons';
import { PageDetailsEdit, rulebookBlockLabel } from './rulebookPageDetailsEdit';
import type {
  RulebookPageDetailsBlockDragEvent,
  RulebookPageDetailsBlockRegion,
  RulebookPageDetailsDiagnostics,
  RulebookPageDetailsDropStatus,
  RulebookPageDetailsValue,
} from './rulebookPageDetailsEdit';

const onPageChange = fn();
const onNavigateBlock = fn();
const onAddBlock = fn();
const onToggleBlockRegion = fn();
const onBlockDrag = fn();

const movement: RulebookBlockDraft = {
  id: 'MVVE',
  kind: 'text',
  name: 'Movement sequence',
  text: 'Choose a force, choose an adjacent destination, then resolve the move.',
};

const stormTiming: RulebookBlockDraft = {
  id: 'TEXT',
  kind: 'text',
  text: 'The storm closes the boundary between its two sectors.',
};

const terrainSequence: RulebookBlockDraft = {
  id: 'TRRN',
  kind: 'text',
  name: 'Terrain costs',
  text: 'Pay the terrain cost before entering the destination sector.',
};

const retreatSequence: RulebookBlockDraft = {
  id: 'RTRT',
  kind: 'text',
  name: 'Retreat movement',
  text: 'Resolve retreat movement after combat losses are assigned.',
};

const exampleList: RulebookBlockDraft = {
  id: 'L5ST',
  kind: 'list',
  style: 'bulleted',
  itemOrder: ['example-one'],
  itemsById: {
    'example-one': {
      id: 'example-one',
      text: 'Confirm that the destination is adjacent.',
    },
  },
};

const retreatExamples: RulebookBlockDraft = {
  id: 'RPTS',
  kind: 'list',
  style: 'numbered',
  itemOrder: ['retreat-one', 'retreat-two'],
  itemsById: {
    'retreat-one': {
      id: 'retreat-one',
      text: 'Retreat through an unoccupied adjacent sector.',
    },
    'retreat-two': {
      id: 'retreat-two',
      text: 'Do not retreat across the storm boundary.',
    },
  },
};

const stormFigure: RulebookBlockDraft = {
  id: 'ASST',
  kind: 'referenced-illustration',
  source: { kind: 'asset', assetId: 'Storm marker' },
  caption: 'The storm marker advances one sector.',
};

const terrainFigure: RulebookBlockDraft = {
  id: 'TRFG',
  kind: 'referenced-illustration',
  source: { kind: 'asset', assetId: 'Terrain cost chart' },
  caption: 'A compact reference for the terrain movement costs.',
};

const retreatFigure: RulebookBlockDraft = {
  id: 'RTFG',
  kind: 'referenced-illustration',
  source: { kind: 'asset', assetId: 'Retreat diagram' },
  caption: 'A legal retreat path around an occupied sector.',
};

function StoryRailAddMenu({
  label,
  choices,
}: Readonly<{
  label: string;
  choices: readonly { label: string; icon: ReactNode }[];
}>) {
  return (
    <Menu position="right-end" withArrow>
      <Menu.Target>
        <AddAction label={label} />
      </Menu.Target>
      <Menu.Dropdown>
        {choices.map((choice) => (
          <Menu.Item key={choice.label} leftSection={choice.icon}>
            {choice.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function moveBlock(
  regions: readonly RulebookPageDetailsBlockRegion[],
  event: Extract<RulebookPageDetailsBlockDragEvent, { kind: 'preview' | 'commit' }>
): RulebookPageDetailsBlockRegion[] {
  let movedBlock: RulebookBlockDraft | undefined;
  const withoutBlock = regions.map((region) => {
    const block = region.blocks.find((candidate) => candidate.id === event.blockId);
    movedBlock ??= block;
    return {
      ...region,
      blocks: region.blocks.filter((candidate) => candidate.id !== event.blockId),
    };
  });
  if (!movedBlock) {
    return [...regions];
  }
  const blockToMove = movedBlock;
  return withoutBlock.map((region) => {
    if (region.key !== event.placement.regionKey) {
      return region;
    }
    const blocks = [...region.blocks];
    blocks.splice(Math.max(0, Math.min(event.placement.index, blocks.length)), 0, blockToMove);
    return { ...region, blocks };
  });
}

function blockDropStatus(
  regions: readonly RulebookPageDetailsBlockRegion[],
  blockId: string,
  regionKey: RulebookBlockRegionKey
): RulebookPageDetailsDropStatus {
  const source = regions.find((region) => region.blocks.some((block) => block.id === blockId));
  const block = source?.blocks.find((candidate) => candidate.id === blockId);
  const target = regions.find((region) => region.key === regionKey);
  if (!source || !block || !target) {
    return { allowed: false, reason: 'The Block placement no longer exists.' };
  }
  return { allowed: true, reason: `${target.label} accepts this Block.` };
}

function PageDetailsStory({
  initialValue,
  initialRegions,
  diagnostics,
}: Readonly<{
  initialValue: RulebookPageDetailsValue;
  initialRegions: readonly RulebookPageDetailsBlockRegion[];
  diagnostics?: RulebookPageDetailsDiagnostics;
}>) {
  const [value, setValue] = useState(initialValue);
  const [canonicalRegions, setCanonicalRegions] = useState(initialRegions);
  const [dragPreview, setDragPreview] = useState<Extract<
    RulebookPageDetailsBlockDragEvent,
    { kind: 'preview' }
  > | null>(null);
  const regions = dragPreview ? moveBlock(canonicalRegions, dragPreview) : canonicalRegions;
  return (
    <Box w="min(64rem, calc(100vw - 2rem))">
      <NestedTabs activePath={['page-a', 'details']} ariaLabel="Rulebook editor navigation">
        <NestedTabs.Level label="Pages">
          <NestedTabs.Item
            as="a"
            href="#page-a"
            path={['page-a']}
            label="Page A"
            icon={rulebookLayoutIcon('two-columns')}
          />
          <NestedTabs.Item
            as="a"
            href="#page-b"
            path={['page-b']}
            label="Page B"
            icon={rulebookLayoutIcon('outer-rail')}
          />
          <NestedTabs.Tools>
            <StoryRailAddMenu
              label="Add Page"
              choices={[
                { label: 'Two equal columns', icon: rulebookLayoutIcon('two-columns') },
                { label: 'Outer rail with two columns', icon: rulebookLayoutIcon('outer-rail') },
              ]}
            />
          </NestedTabs.Tools>
        </NestedTabs.Level>
        <NestedTabs.Level label="Page">
          <NestedTabs.Item
            as="a"
            href="#page-a/details"
            path={['page-a', 'details']}
            label="Page details"
            icon={<SlidersHorizontal aria-hidden />}
          />
          <NestedTabs.Item
            as="a"
            href="#page-a/control"
            path={['page-a', 'control']}
            label="Control region"
            icon={rulebookRegionIcon('cover')}
          />
          {regions.map((region) => (
            <NestedTabs.Group
              key={region.key}
              label={region.label}
              icon={region.icon ?? rulebookRegionIcon(region.key)}
            >
              {region.blocks.map((block) => (
                <NestedTabs.Item
                  key={block.id}
                  as="a"
                  href={`#page-a/${block.id}`}
                  path={['page-a', block.id]}
                  label={rulebookBlockLabel(block)}
                  icon={rulebookBlockIcon(block.kind)}
                />
              ))}
            </NestedTabs.Group>
          ))}
          <NestedTabs.Tools>
            <StoryRailAddMenu
              label="Add Page region"
              choices={[
                { label: 'Control region', icon: rulebookRegionIcon('cover') },
                { label: 'Block region', icon: rulebookRegionIcon('content') },
              ]}
            />
          </NestedTabs.Tools>
        </NestedTabs.Level>
        <NestedTabs.ContentPanel aria-label="Page details destination">
          <PageDetailsEdit
            value={value}
            diagnostics={diagnostics}
            regions={regions}
            onChange={(nextValue) => {
              onPageChange(nextValue);
              setValue(nextValue);
            }}
            onNavigateBlock={onNavigateBlock}
            onAddBlock={onAddBlock}
            onDeleteBlock={(blockId) =>
              setCanonicalRegions((current) =>
                current.map((region) => ({ ...region, blocks: region.blocks.filter((block) => block.id !== blockId) }))
              )
            }
            onToggleBlockRegion={(regionKey, collapsed) => {
              onToggleBlockRegion(regionKey, collapsed);
              setCanonicalRegions((current) =>
                current.map((region) => (region.key === regionKey ? { ...region, collapsed } : region))
              );
            }}
            getBlockDropStatus={(blockId, regionKey) => blockDropStatus(regions, blockId, regionKey)}
            onBlockDrag={(event) => {
              onBlockDrag(event);
              if (event.kind === 'preview') {
                setDragPreview(event);
              } else if (event.kind === 'commit') {
                setCanonicalRegions((current) => moveBlock(current, event));
                setDragPreview(null);
              } else if (event.kind === 'cancel') {
                setDragPreview(null);
              }
            }}
          />
        </NestedTabs.ContentPanel>
      </NestedTabs>
    </Box>
  );
}

function pageDetailsCanvas(canvasElement: HTMLElement) {
  const destination = within(canvasElement).getByLabelText('Page details destination');
  return within(within(destination).getByLabelText('Page details'));
}

const populatedRulesRegions: readonly RulebookPageDetailsBlockRegion[] = [
  {
    key: 'column1',
    label: 'Rules',
    blocks: [movement, terrainSequence, stormTiming, retreatSequence],
    collapsed: false,
    containsActiveBlock: false,
  },
  {
    key: 'column2',
    label: 'Examples',
    blocks: [exampleList, stormFigure, retreatExamples],
    collapsed: false,
    containsActiveBlock: false,
  },
  {
    key: 'rail',
    label: 'Figures',
    blocks: [terrainFigure, retreatFigure],
    collapsed: false,
    containsActiveBlock: false,
  },
];

const meta = preview.meta({
  title: 'Rulebooks/Page details editor',
  globals: { colorScheme: 'dark' },
  parameters: { layout: 'centered' },
});

export const PopulatedRulesPage = meta.story({
  render: () => (
    <PageDetailsStory initialValue={{ title: 'Movement', anchor: 'movement' }} initialRegions={populatedRulesRegions} />
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
    await expect(canvas.getAllByRole('img', { name: 'Help' })).toHaveLength(2);
    await userEvent.clear(title);
    await userEvent.type(title, 'Advanced movement');
    await expect(onPageChange).toHaveBeenLastCalledWith({
      title: 'Advanced movement',
      anchor: 'movement',
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
    await waitFor(() => expect(page.getByRole('menuitem', { name: 'Text' })).toBeVisible());
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

export const EmptyVisualReference = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{
        title: 'Markers and tokens',
        anchor: 'markers-and-tokens',
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
      initialValue={{ title: 'Movement', anchor: 'movement' }}
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
    await expect(canvas.getByLabelText('Examples')).toHaveTextContent('2 Blocks');
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
      initialValue={{ title: 'Movement', anchor: 'movement' }}
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
      initialValue={{ title: 'Movement', anchor: 'movement' }}
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
      initialValue={{ title: '', anchor: 'Movement section' }}
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
    expect(toggle).not.toBeChecked();
    expect(canvas.getByRole('textbox', { name: 'Title' })).toHaveValue('Movement');
  },
});
