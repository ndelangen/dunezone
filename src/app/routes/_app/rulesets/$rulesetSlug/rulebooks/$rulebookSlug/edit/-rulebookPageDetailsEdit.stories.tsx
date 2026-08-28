import { Box } from '@mantine/core';
import preview from '@sb/preview';
import type { RulebookBlockDraft, RulebookBlockRegionKey } from '@shared/rulebooks/contents';
import { NestedTabs } from '@ui/surface';
import { Circle, FileText, ListTree, SlidersHorizontal, Square } from 'lucide-react';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { PageDetailsEdit } from './-rulebookPageDetailsEdit';
import type {
  RulebookPageDetailsBlockMoveIntent,
  RulebookPageDetailsBlockRegion,
  RulebookPageDetailsDiagnostics,
  RulebookPageDetailsDropStatus,
  RulebookPageDetailsRegion,
  RulebookPageDetailsValue,
} from './-rulebookPageDetailsEdit';

const onPageChange = fn();
const onNavigateControlRegion = fn();
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

const stormFigure: RulebookBlockDraft = {
  id: 'ASST',
  kind: 'asset-figure',
  assetId: 'Storm marker',
  text: 'The storm marker advances one sector.',
};

function moveBlock(
  regions: readonly RulebookPageDetailsRegion[],
  intent: RulebookPageDetailsBlockMoveIntent
): RulebookPageDetailsRegion[] {
  let movedBlock: RulebookBlockDraft | undefined;
  const withoutBlock = regions.map((region) => {
    if (region.kind === 'control') {
      return region;
    }
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
    if (region.kind === 'control' || region.key !== intent.regionKey) {
      return region;
    }
    const blocks = [...region.blocks];
    blocks.splice(Math.max(0, Math.min(intent.index, blocks.length)), 0, blockToMove);
    return { ...region, blocks };
  });
}

function blockDropStatus(
  regions: readonly RulebookPageDetailsRegion[],
  blockId: string,
  regionKey: RulebookBlockRegionKey
): RulebookPageDetailsDropStatus {
  const source = regions.find(
    (region): region is RulebookPageDetailsBlockRegion =>
      region.kind === 'block' && region.blocks.some((block) => block.id === blockId)
  );
  const block = source?.blocks.find((candidate) => candidate.id === blockId);
  const target = regions.find(
    (region): region is RulebookPageDetailsBlockRegion => region.kind === 'block' && region.key === regionKey
  );
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
  activeBlockId,
  diagnostics,
  width = 'min(64rem, calc(100vw - 2rem))',
}: Readonly<{
  initialValue: RulebookPageDetailsValue;
  initialRegions: readonly RulebookPageDetailsRegion[];
  activeBlockId?: string;
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
          <NestedTabs.Group label="Block region" icon={<ListTree />}>
            <NestedTabs.Item
              as="a"
              href="#page-a/block-a"
              path={['page-a', 'block-a']}
              label="Block A"
              icon={<FileText />}
            />
          </NestedTabs.Group>
        </NestedTabs.Level>
        <NestedTabs.ContentPanel aria-label="Page details destination">
          <PageDetailsEdit
            value={value}
            diagnostics={diagnostics}
            regions={regions}
            activeBlockId={activeBlockId}
            onChange={(nextValue) => {
              onPageChange(nextValue);
              setValue(nextValue);
            }}
            onNavigateControlRegion={onNavigateControlRegion}
            onNavigateBlock={onNavigateBlock}
            onAddBlock={onAddBlock}
            onToggleBlockRegion={(regionKey, collapsed) => {
              onToggleBlockRegion(regionKey, collapsed);
              setRegions((current) =>
                current.map((region) =>
                  region.kind === 'block' && region.key === regionKey ? { ...region, collapsed } : region
                )
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

const guidanceRegion = {
  kind: 'control',
  key: 'guidance',
  label: 'Page guidance',
  summary: ['Rules page', 'Resolve movement before starting combat.'],
  active: false,
} as const;

const populatedRulesRegions: readonly RulebookPageDetailsRegion[] = [
  guidanceRegion,
  {
    kind: 'block',
    key: 'rules',
    label: 'Rules',
    acceptedBlockKinds: ['text', 'rule-group'],
    minimum: 0,
    maximum: 6,
    blocks: [movement, stormTiming],
    collapsed: false,
    containsActiveBlock: true,
    canAddBlock: true,
  },
  {
    kind: 'block',
    key: 'examples',
    label: 'Examples',
    acceptedBlockKinds: ['text', 'repeated-text', 'asset-figure'],
    minimum: 0,
    maximum: 3,
    blocks: [exampleList, stormFigure],
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
    <PageDetailsStory
      initialValue={{ title: 'Movement', anchor: 'movement' }}
      initialRegions={populatedRulesRegions}
      activeBlockId="TEXT"
    />
  ),
  play: async ({ canvasElement }) => {
    onPageChange.mockClear();
    onNavigateControlRegion.mockClear();
    onNavigateBlock.mockClear();
    onAddBlock.mockClear();
    onToggleBlockRegion.mockClear();
    const canvas = pageDetailsCanvas(canvasElement);
    const title = canvas.getByRole('textbox', { name: 'Title' });
    const anchor = canvas.getByRole('textbox', { name: 'Anchor' });
    await expect(title).toHaveAccessibleDescription('Name this Page in the editor and Rulebook.');
    await userEvent.clear(title);
    await userEvent.type(title, 'Advanced movement');
    await expect(onPageChange).toHaveBeenLastCalledWith({
      title: 'Advanced movement',
      anchor: 'movement',
    });
    await userEvent.tab();
    await expect(anchor).toHaveFocus();
    await userEvent.tab();
    const guidance = canvas.getByRole('button', { name: /Page guidance/ });
    await expect(guidance).toHaveFocus();
    await expect(onNavigateControlRegion).not.toHaveBeenCalled();
    await userEvent.keyboard('[Enter]');
    await expect(onNavigateControlRegion).toHaveBeenCalledWith('guidance');
    await userEvent.click(canvas.getByRole('button', { name: 'Edit Movement sequence' }));
    await expect(onNavigateBlock).toHaveBeenCalledWith('MVVE');
    await userEvent.click(canvas.getByRole('button', { name: 'Add a Block to Rules' }));
    await expect(onAddBlock).toHaveBeenCalledWith('rules');
    await userEvent.click(canvas.getByRole('button', { name: 'Collapse Examples' }));
    await expect(onToggleBlockRegion).toHaveBeenCalledWith('examples', true);
    await expect(canvas.getByRole('button', { name: 'Expand Examples' })).toBeVisible();
    await expect(canvas.getByLabelText('Rules')).toHaveAttribute('data-contains-active-block', 'true');
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
          kind: 'block',
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
          kind: 'block',
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
    await expect(canvas.queryByRole('button', { name: /Page guidance/ })).not.toBeInTheDocument();
  },
});

export const SimpleControlRegion = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{
        title: 'Welcome to Arrakis',
        anchor: 'welcome-to-arrakis',
      }}
      initialRegions={[
        {
          kind: 'control',
          key: 'chapter-label',
          label: 'Chapter label',
          summary: ['Chapter one'],
          active: true,
        },
        {
          kind: 'block',
          key: 'feature',
          label: 'Feature',
          acceptedBlockKinds: ['asset-figure', 'rule-group'],
          minimum: 0,
          maximum: 2,
          blocks: [stormFigure],
          collapsed: false,
          containsActiveBlock: false,
          canAddBlock: true,
        },
      ]}
    />
  ),
});

export const BoundedAndCollapsedRegions = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{ title: 'Movement', anchor: 'movement' }}
      initialRegions={[
        guidanceRegion,
        {
          kind: 'block',
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
          kind: 'block',
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
    await expect(canvas.queryByRole('button', { name: 'Edit Repeated text Block' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Expand Examples' }));
    await expect(canvas.getByRole('button', { name: 'Edit Repeated text Block' })).toBeVisible();
  },
});

export const DragBetweenCompatibleRegions = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{ title: 'Movement', anchor: 'movement' }}
      initialRegions={[
        {
          kind: 'block',
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
          kind: 'block',
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
      name: 'Move Text Block',
    });
    handle.focus();
    await userEvent.keyboard('[Space][ArrowDown][Space]');
    await expect(onMoveBlock).toHaveBeenCalled();
    await expect(canvas.getByLabelText('Examples')).toHaveTextContent('Text Block');
  },
});

export const IncompatibleAndFullDragPresentation = meta.story({
  render: () => (
    <PageDetailsStory
      initialValue={{ title: 'Movement', anchor: 'movement' }}
      initialRegions={[
        {
          kind: 'block',
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
          kind: 'block',
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
          kind: 'block',
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
      name: 'Move Text Block',
    });
    handle.focus();
    await userEvent.keyboard('[Space]');
    await expect(canvas.getByLabelText('Figures')).toHaveAttribute('data-drop-eligibility', 'incompatible');
    await expect(canvas.getByLabelText('Full examples')).toHaveAttribute('data-drop-eligibility', 'incompatible');
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
      activeBlockId="TEXT"
      width="34rem"
    />
  ),
});
