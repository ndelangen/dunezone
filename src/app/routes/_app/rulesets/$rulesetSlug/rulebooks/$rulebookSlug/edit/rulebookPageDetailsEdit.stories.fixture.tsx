import { Box, Menu } from '@mantine/core';
import type { RulebookBlockDraft, RulebookBlockRegionKey } from '@shared/rulebooks/contents';
import { AddAction } from '@ui/control/ListLengthActions';
import { NestedTabs } from '@ui/surface';
import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { fn, within } from 'storybook/test';

import { rulebookBlockIcon, rulebookLayoutIcon, rulebookRegionIcon } from './rulebookEditorIcons';
import { PageDetailsEdit, rulebookBlockLabel } from './rulebookPageDetailsEdit';
import type {
  RulebookPageDetailsBlockDragEvent,
  RulebookPageDetailsBlockRegion,
  RulebookPageDetailsDiagnostics,
  RulebookPageDetailsDropStatus,
  RulebookPageDetailsValue,
} from './rulebookPageDetailsEdit';

export const onPageChange = fn();
export const onNavigateBlock = fn();
export const onAddBlock = fn();
export const onToggleBlockRegion = fn();
export const onBlockDrag = fn();

export const movement: RulebookBlockDraft = {
  id: 'MVVE',
  kind: 'text',
  name: 'Movement sequence',
  text: 'Choose a troop, choose an adjacent destination, then resolve the move.',
};

export const stormTiming: RulebookBlockDraft = {
  id: 'TEXT',
  kind: 'text',
  text: 'The storm closes the boundary between its two sectors.',
};

export const terrainSequence: RulebookBlockDraft = {
  id: 'TRRN',
  kind: 'text',
  name: 'Terrain costs',
  text: 'Pay the terrain cost before entering the destination sector.',
};

export const retreatSequence: RulebookBlockDraft = {
  id: 'RTRT',
  kind: 'text',
  name: 'Retreat movement',
  text: 'Resolve retreat movement after battle losses are assigned.',
};

export const exampleList: RulebookBlockDraft = {
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

export const stormFigure: RulebookBlockDraft = {
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

export function PageDetailsStory({
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

export function pageDetailsCanvas(canvasElement: HTMLElement) {
  const destination = within(canvasElement).getByLabelText('Page details destination');
  return within(within(destination).getByLabelText('Page details'));
}

export const populatedRulesRegions: readonly RulebookPageDetailsBlockRegion[] = [
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
