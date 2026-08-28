import { Box, Menu } from '@mantine/core';
import preview from '@sb/preview';
import type { RulebookBlockDraft, RulebookBlockRegionKey } from '@shared/rulebooks/contents';
import { AddAction } from '@ui/control/ListLengthActions';
import { NestedTabs } from '@ui/surface';
import {
  Circle,
  FileImage,
  FileText,
  Layers3,
  ListTree,
  MessageSquareQuote,
  SlidersHorizontal,
  Square,
} from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { PageDetailsEdit } from './-rulebookPageDetailsEdit';
import type {
  RulebookPageDetailsBlockMoveIntent,
  RulebookPageDetailsBlockRegion,
  RulebookPageDetailsDiagnostics,
  RulebookPageDetailsDropStatus,
  RulebookPageDetailsValue,
} from './-rulebookPageDetailsEdit';

const onPageChange = fn();
const onNavigateBlock = fn();
const onAddBlock = fn();
const onToggleBlockRegion = fn();
const onMoveBlock = fn();

const movement: RulebookBlockDraft = {
  id: 'MVVE',
  kind: 'rule-group',
  title: 'Movement sequence',
  text: 'Choose a force, choose an adjacent destination, then resolve the move.',
};

const stormTiming: RulebookBlockDraft = {
  id: 'TEXT',
  kind: 'text',
  text: 'The storm closes the boundary between its two sectors.',
};

const terrainSequence: RulebookBlockDraft = {
  id: 'TRRN',
  kind: 'rule-group',
  title: 'Terrain costs',
  text: 'Pay the terrain cost before entering the destination sector.',
};

const retreatSequence: RulebookBlockDraft = {
  id: 'RTRT',
  kind: 'rule-group',
  title: 'Retreat movement',
  text: 'Resolve retreat movement after combat losses are assigned.',
};

const exampleList: RulebookBlockDraft = {
  id: 'L5ST',
  kind: 'repeated-text',
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
  kind: 'repeated-text',
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
  kind: 'asset-figure',
  assetId: 'Storm marker',
  text: 'The storm marker advances one sector.',
};

const terrainFigure: RulebookBlockDraft = {
  id: 'TRFG',
  kind: 'asset-figure',
  assetId: 'Terrain cost chart',
  text: 'A compact reference for the terrain movement costs.',
};

const retreatFigure: RulebookBlockDraft = {
  id: 'RTFG',
  kind: 'asset-figure',
  assetId: 'Retreat diagram',
  text: 'A legal retreat path around an occupied sector.',
};

function storyBlockLabel(block: RulebookBlockDraft) {
  if (block.kind === 'rule-group') {
    return block.title;
  }
  if (block.kind === 'asset-figure') {
    return block.assetId ?? 'Asset figure Block';
  }
  if (block.kind === 'repeated-text') {
    const firstItemId = block.itemOrder[0];
    return (firstItemId ? block.itemsById[firstItemId]?.text : undefined) ?? 'Repeated text Block';
  }
  return block.text || 'Text Block';
}

function storyBlockIcon(block: RulebookBlockDraft) {
  if (block.kind === 'rule-group') {
    return <ListTree />;
  }
  if (block.kind === 'asset-figure') {
    return <FileImage />;
  }
  if (block.kind === 'repeated-text') {
    return <MessageSquareQuote />;
  }
  return <FileText />;
}

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
  intent: RulebookPageDetailsBlockMoveIntent
): RulebookPageDetailsBlockRegion[] {
  let movedBlock: RulebookBlockDraft | undefined;
  const withoutBlock = regions.map((region) => {
    const block = region.blocks.find((candidate) => candidate.id === intent.blockId);
    movedBlock ??= block;
    return {
      ...region,
      blocks: region.blocks.filter((candidate) => candidate.id !== intent.blockId),
    };
  });
  if (!movedBlock) {
    return [...regions];
  }
  const blockToMove = movedBlock;
  return withoutBlock.map((region) => {
    if (region.key !== intent.regionKey) {
      return region;
    }
    const blocks = [...region.blocks];
    blocks.splice(Math.max(0, Math.min(intent.index, blocks.length)), 0, blockToMove);
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
  if (!target.acceptedBlockKinds.includes(block.kind)) {
    return {
      allowed: false,
      reason: `${target.label} does not accept ${block.kind} Blocks.`,
    };
  }
  const countWithoutActive = target.blocks.length - (source.key === target.key ? 1 : 0);
  if (target.maximum !== null && countWithoutActive >= target.maximum) {
    return { allowed: false, reason: `${target.label} is full.` };
  }
  return { allowed: true, reason: `${target.label} accepts this Block.` };
}

function PageDetailsStory({
  initialValue,
  initialRegions,
  diagnostics,
  width = 'min(64rem, calc(100vw - 2rem))',
}: Readonly<{
  initialValue: RulebookPageDetailsValue;
  initialRegions: readonly RulebookPageDetailsBlockRegion[];
  diagnostics?: RulebookPageDetailsDiagnostics;
  width?: string;
}>) {
  const [value, setValue] = useState(initialValue);
  const [regions, setRegions] = useState(initialRegions);
  return (
    <Box w={width}>
      <NestedTabs activePath={['page-a', 'details']} ariaLabel="Rulebook editor navigation">
        <NestedTabs.Level label="Pages">
          <NestedTabs.Item as="a" href="#page-a" path={['page-a']} label="Page A" icon={<Circle />} />
          <NestedTabs.Item as="a" href="#page-b" path={['page-b']} label="Page B" icon={<Square />} />
          <NestedTabs.Tools>
            <StoryRailAddMenu
              label="Add Page"
              choices={[
                { label: 'Rules Page', icon: <ListTree /> },
                { label: 'Figure Page', icon: <FileImage /> },
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
            icon={<FileText />}
          />
          <NestedTabs.Item
            as="a"
            href="#page-a/control"
            path={['page-a', 'control']}
            label="Control region"
            icon={<SlidersHorizontal />}
          />
          {regions.map((region) => (
            <NestedTabs.Group key={region.key} label={region.label} icon={<Layers3 />}>
              {region.blocks.map((block) => (
                <NestedTabs.Item
                  key={block.id}
                  as="a"
                  href={`#page-a/${block.id}`}
                  path={['page-a', block.id]}
                  label={storyBlockLabel(block)}
                  icon={storyBlockIcon(block)}
                />
              ))}
            </NestedTabs.Group>
          ))}
          <NestedTabs.Tools>
            <StoryRailAddMenu
              label="Add Page region"
              choices={[
                { label: 'Control region', icon: <SlidersHorizontal /> },
                { label: 'Block region', icon: <Layers3 /> },
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
            onToggleBlockRegion={(regionKey, collapsed) => {
              onToggleBlockRegion(regionKey, collapsed);
              setRegions((current) =>
                current.map((region) => (region.key === regionKey ? { ...region, collapsed } : region))
              );
            }}
            getBlockDropStatus={(blockId, regionKey) => blockDropStatus(regions, blockId, regionKey)}
            onMoveBlock={(intent) => {
              onMoveBlock(intent);
              setRegions((current) => moveBlock(current, intent));
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
    key: 'rules',
    label: 'Rules',
    acceptedBlockKinds: ['text', 'rule-group'],
    minimum: 0,
    maximum: 6,
    blocks: [movement, terrainSequence, stormTiming, retreatSequence],
    collapsed: false,
    containsActiveBlock: false,
    canAddBlock: true,
  },
  {
    key: 'examples',
    label: 'Examples',
    acceptedBlockKinds: ['text', 'repeated-text', 'asset-figure'],
    minimum: 0,
    maximum: 6,
    blocks: [exampleList, stormFigure, retreatExamples],
    collapsed: false,
    containsActiveBlock: false,
    canAddBlock: true,
  },
  {
    key: 'figures',
    label: 'Figures',
    acceptedBlockKinds: ['asset-figure'],
    minimum: 0,
    maximum: 3,
    blocks: [terrainFigure, retreatFigure],
    collapsed: false,
    containsActiveBlock: false,
    canAddBlock: true,
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
    await expect(within(movementButton).queryByText('Rule group')).not.toBeInTheDocument();
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
    await expect(onAddBlock).toHaveBeenCalledWith('rules', 'text');
    await userEvent.click(canvas.getByRole('button', { name: 'Collapse Examples' }));
    await expect(onToggleBlockRegion).toHaveBeenCalledWith('examples', true);
    await expect(canvas.getByRole('button', { name: 'Expand Examples' })).toBeVisible();
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
          key: 'figures',
          label: 'Figures',
          acceptedBlockKinds: ['asset-figure'],
          minimum: 0,
          maximum: 2,
          blocks: [],
          collapsed: false,
          containsActiveBlock: false,
          canAddBlock: true,
        },
        {
          key: 'notes',
          label: 'Notes',
          acceptedBlockKinds: ['text', 'repeated-text'],
          minimum: 0,
          maximum: 4,
          blocks: [],
          collapsed: false,
          containsActiveBlock: false,
          canAddBlock: true,
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = pageDetailsCanvas(canvasElement);
    await expect(canvas.getAllByText('No Blocks in this region.')).toHaveLength(2);
    await expect(canvas.getByRole('button', { name: 'Add a Block to Figures' })).toBeEnabled();
  },
});

export const BoundedAndCollapsedRegions = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{ title: 'Movement', anchor: 'movement' }}
      initialRegions={[
        {
          key: 'rules',
          label: 'Rules',
          acceptedBlockKinds: ['text', 'rule-group'],
          minimum: 0,
          maximum: 2,
          blocks: [movement, stormTiming],
          collapsed: false,
          containsActiveBlock: false,
          canAddBlock: false,
          diagnostic: 'Rules has reached its two-Block limit.',
        },
        {
          key: 'examples',
          label: 'Examples',
          acceptedBlockKinds: ['text', 'repeated-text', 'asset-figure'],
          minimum: 0,
          maximum: 3,
          blocks: [exampleList, stormFigure],
          collapsed: true,
          containsActiveBlock: false,
          canAddBlock: true,
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = pageDetailsCanvas(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Add a Block to Rules' })).toBeDisabled();
    await expect(canvas.getByText('Rules has reached its two-Block limit.')).toBeVisible();
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
          key: 'rules',
          label: 'Rules',
          acceptedBlockKinds: ['text', 'rule-group'],
          minimum: 0,
          maximum: 6,
          blocks: [stormTiming],
          collapsed: false,
          containsActiveBlock: false,
          canAddBlock: true,
        },
        {
          key: 'examples',
          label: 'Examples',
          acceptedBlockKinds: ['text', 'repeated-text', 'asset-figure'],
          minimum: 0,
          maximum: 3,
          blocks: [],
          collapsed: false,
          containsActiveBlock: false,
          canAddBlock: true,
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    onMoveBlock.mockClear();
    const canvas = pageDetailsCanvas(canvasElement);
    const handle = within(canvas.getByLabelText('Rules')).getByRole('button', {
      name: 'Edit The storm closes the boundary between its two sectors.',
    });
    handle.focus();
    await userEvent.keyboard('[Space][ArrowDown][Space]');
    await expect(onMoveBlock).toHaveBeenCalled();
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
          key: 'rules',
          label: 'Rules',
          acceptedBlockKinds: ['text', 'rule-group'],
          minimum: 0,
          maximum: 6,
          blocks: [movement, terrainSequence, retreatSequence],
          collapsed: false,
          containsActiveBlock: false,
          canAddBlock: true,
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    onMoveBlock.mockClear();
    const canvas = pageDetailsCanvas(canvasElement);
    const row = canvas.getByRole('button', { name: 'Edit Movement sequence' });
    row.focus();
    await userEvent.keyboard('[Space][ArrowDown]');
    await expect(onMoveBlock).not.toHaveBeenCalled();
    await userEvent.keyboard('[Space]');
    await expect(onMoveBlock).toHaveBeenCalledTimes(1);
    await expect(onMoveBlock).toHaveBeenLastCalledWith({
      blockId: 'MVVE',
      regionKey: 'rules',
      index: 1,
      reason: 'drag',
    });
  },
});

export const IncompatibleAndFullDragPresentation = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{ title: 'Movement', anchor: 'movement' }}
      initialRegions={[
        {
          key: 'rules',
          label: 'Rules',
          acceptedBlockKinds: ['text', 'rule-group'],
          minimum: 0,
          maximum: 6,
          blocks: [stormTiming],
          collapsed: false,
          containsActiveBlock: false,
          canAddBlock: true,
        },
        {
          key: 'figures',
          label: 'Figures',
          acceptedBlockKinds: ['asset-figure'],
          minimum: 0,
          maximum: 2,
          blocks: [stormFigure],
          collapsed: false,
          containsActiveBlock: false,
          canAddBlock: true,
        },
        {
          key: 'examples',
          label: 'Full examples',
          acceptedBlockKinds: ['text'],
          minimum: 1,
          maximum: 1,
          blocks: [{ ...stormTiming, id: 'FULL' }],
          collapsed: false,
          containsActiveBlock: false,
          canAddBlock: false,
        },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = pageDetailsCanvas(canvasElement);
    const handle = within(canvas.getByLabelText('Rules')).getByRole('button', {
      name: 'Edit The storm closes the boundary between its two sectors.',
    });
    handle.focus();
    await userEvent.keyboard('[Space]');
    const sourceRow = handle.closest<HTMLElement>('li');
    const preview = canvasElement.ownerDocument.querySelector<HTMLElement>('[data-block-drag-preview]');
    await expect(sourceRow).not.toBeNull();
    await expect(preview).not.toBeNull();
    await expect(
      Math.abs(preview!.getBoundingClientRect().width - sourceRow!.getBoundingClientRect().width)
    ).toBeLessThan(1);
    await expect(canvas.getByLabelText('Figures')).toHaveAttribute('data-drop-eligibility', 'incompatible');
    await expect(canvas.getByLabelText('Full examples')).toHaveAttribute('data-drop-eligibility', 'incompatible');
    await expect(canvas.getByLabelText('Full examples')).toHaveAccessibleDescription(
      'Accepts Text. 1 of 1 Block. Minimum 1.'
    );
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

export const NarrowContainer = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{ title: 'Movement', anchor: 'movement' }}
      initialRegions={populatedRulesRegions}
      width="28rem"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = pageDetailsCanvas(canvasElement);
    const rules = within(canvas.getByLabelText('Rules'));
    const help = await rules.findByRole('img', { name: 'Rules details' });
    await expect(help).toBeVisible();
    await userEvent.hover(help);
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() =>
      expect(page.getByRole('tooltip')).toHaveTextContent('Accepts Text, Rule group. 4 of 6 Blocks.')
    );
  },
});
