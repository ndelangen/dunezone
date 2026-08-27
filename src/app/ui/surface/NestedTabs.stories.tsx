import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ActionIcon } from '@mantine/core';
import preview from '@sb/preview';
import {
  Circle,
  FileText,
  Hexagon,
  Image,
  List,
  Plus,
  Rows3,
  Settings2,
  SlidersHorizontal,
  Square,
  Triangle,
  Type,
} from 'lucide-react';
import { useState } from 'react';
import type { Key, MouseEvent, ReactNode } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { SortableItem } from '../control/SortableItem';
import { SortableReorderHandle } from '../control/SortableReorderHandle';
import { NestedTabs } from './NestedTabs';
import type { NestedTabsPath } from './NestedTabs';
import styles from './NestedTabs.stories.module.css';
import { SurfaceFiller } from './SurfaceFiller.stories.fixture';

const PAGE_ONE = 'p-a7';
const PAGE_TWO = 'p-k4';
const PAGE_THREE = 'p-r9';

const DETAILS = 'details';
const CONTROL_SEO = 'c-n3';
const CONTROL_RULES = 'c-t8';
const BLOCK_INTRO = 'b-h2';
const BLOCK_IMAGE = 'b-q5';
const BLOCK_LIST = 'b-w7';

interface PathItemProps {
  key?: Key;
  path: NestedTabsPath;
  label: string;
  icon: ReactNode;
  onNavigate: (path: NestedTabsPath) => void;
}

function pathItem({ key, path, label, icon, onNavigate }: PathItemProps) {
  return (
    <NestedTabs.Item
      key={key}
      as="a"
      href={`#${path.join('/')}`}
      path={path}
      label={label}
      icon={icon}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        onNavigate(path.length === 1 ? [path[0] ?? PAGE_ONE, DETAILS] : path);
      }}
    />
  );
}

function pageLevel({ onNavigate }: { onNavigate: PathItemProps['onNavigate'] }) {
  return (
    <NestedTabs.Level label="Pages">
      {pathItem({ path: [PAGE_ONE], label: 'Cover layout', icon: <Triangle />, onNavigate })}
      {pathItem({ path: [PAGE_TWO], label: 'Article layout', icon: <Hexagon />, onNavigate })}
      {pathItem({ path: [PAGE_THREE], label: 'Reference layout', icon: <Square />, onNavigate })}
      <NestedTabs.Tools>
        <ActionIcon variant="subtle" aria-label="Add page">
          <Plus aria-hidden />
        </ActionIcon>
      </NestedTabs.Tools>
    </NestedTabs.Level>
  );
}

function detailLevel({ onNavigate }: { onNavigate: PathItemProps['onNavigate'] }) {
  return (
    <NestedTabs.Level label="Page">
      {pathItem({ path: [PAGE_TWO, DETAILS], label: 'Page details', icon: <FileText />, onNavigate })}
      {pathItem({
        path: [PAGE_TWO, CONTROL_SEO],
        label: 'Search and sharing',
        icon: <SlidersHorizontal />,
        onNavigate,
      })}
      {pathItem({
        path: [PAGE_TWO, CONTROL_RULES],
        label: 'Rule presentation',
        icon: <Settings2 />,
        onNavigate,
      })}
      <NestedTabs.Group label="Opening region" icon={<Rows3 />}>
        {pathItem({
          path: [PAGE_TWO, BLOCK_INTRO],
          label: 'Introduction block',
          icon: <Type />,
          onNavigate,
        })}
        {pathItem({
          path: [PAGE_TWO, BLOCK_IMAGE],
          label: 'Illustration block',
          icon: <Image />,
          onNavigate,
        })}
      </NestedTabs.Group>
      <NestedTabs.Group label="Reference region" icon={<List />}>
        {pathItem({
          path: [PAGE_TWO, BLOCK_LIST],
          label: 'Reference list block',
          icon: <List />,
          onNavigate,
        })}
      </NestedTabs.Group>
    </NestedTabs.Level>
  );
}

function PanelFixture() {
  return <SurfaceFiller height={420} />;
}

function HierarchyFixture({
  initialPath,
  className,
  tools = true,
}: {
  initialPath: NestedTabsPath;
  className?: string;
  tools?: boolean;
}) {
  const [activePath, setActivePath] = useState<NestedTabsPath>(initialPath);
  return (
    <NestedTabs activePath={activePath} ariaLabel="Rulebook editor" className={className}>
      {tools ? (
        pageLevel({ onNavigate: setActivePath })
      ) : (
        <NestedTabs.Level label="Pages">
          {pathItem({ path: [PAGE_ONE], label: 'Cover layout', icon: <Triangle />, onNavigate: setActivePath })}
          {pathItem({ path: [PAGE_TWO], label: 'Article layout', icon: <Hexagon />, onNavigate: setActivePath })}
          {pathItem({ path: [PAGE_THREE], label: 'Reference layout', icon: <Square />, onNavigate: setActivePath })}
        </NestedTabs.Level>
      )}
      {detailLevel({ onNavigate: setActivePath })}
      <NestedTabs.ContentPanel aria-label="Editor controls">
        <PanelFixture />
      </NestedTabs.ContentPanel>
    </NestedTabs>
  );
}

type DemoBlockKind = 'text' | 'image' | 'list';
type DemoRegionId = 'opening' | 'aside' | 'references' | 'notes';

interface DemoBlock {
  id: string;
  label: string;
  kind: DemoBlockKind;
}

interface DemoRegionDefinition {
  id: DemoRegionId;
  label: string;
  accepts: readonly DemoBlockKind[];
  capacity: number;
}

const demoRegions: readonly DemoRegionDefinition[] = [
  {
    id: 'opening',
    label: 'Opening region',
    accepts: ['text', 'image'],
    capacity: 4,
  },
  { id: 'notes', label: 'Notes region', accepts: ['text'], capacity: 2 },
  { id: 'aside', label: 'Aside region', accepts: ['image'], capacity: 1 },
  {
    id: 'references',
    label: 'Reference region',
    accepts: ['list'],
    capacity: 3,
  },
];

const initialRegionBlocks: Record<DemoRegionId, DemoBlock[]> = {
  opening: [
    { id: BLOCK_INTRO, label: 'Introduction block', kind: 'text' },
    { id: BLOCK_IMAGE, label: 'Illustration block', kind: 'image' },
  ],
  aside: [{ id: 'b-z4', label: 'Aside illustration', kind: 'image' }],
  references: [{ id: BLOCK_LIST, label: 'Reference list block', kind: 'list' }],
  notes: [],
};

function blockIcon(kind: DemoBlockKind) {
  if (kind === 'image') {
    return <Image />;
  }
  if (kind === 'list') {
    return <List />;
  }
  return <Type />;
}

function findBlockRegion(regions: Record<DemoRegionId, DemoBlock[]>, blockId: string): DemoRegionId | undefined {
  return demoRegions.find((region) => regions[region.id].some((block) => block.id === blockId))?.id;
}

function canRegionAccept(
  definition: DemoRegionDefinition,
  blocks: readonly DemoBlock[],
  block: DemoBlock,
  sourceRegion: DemoRegionId
) {
  const keepsSameCount = sourceRegion === definition.id;
  return definition.accepts.includes(block.kind) && (keepsSameCount || blocks.length < definition.capacity);
}

function sortingDetailLevel({
  regions,
  onNavigate,
}: {
  regions: Record<DemoRegionId, DemoBlock[]>;
  onNavigate: PathItemProps['onNavigate'];
}) {
  return (
    <NestedTabs.Level label="Page">
      {pathItem({ path: [PAGE_TWO, DETAILS], label: 'Page details', icon: <FileText />, onNavigate })}
      {pathItem({
        path: [PAGE_TWO, CONTROL_RULES],
        label: 'Rule presentation',
        icon: <Settings2 />,
        onNavigate,
      })}
      {demoRegions.map((region) => (
        <NestedTabs.Group key={region.id} label={region.label} icon={<Rows3 />}>
          {regions[region.id].map((block) =>
            pathItem({
              key: block.id,
              path: [PAGE_TWO, block.id],
              label: block.label,
              icon: blockIcon(block.kind),
              onNavigate,
            })
          )}
        </NestedTabs.Group>
      ))}
    </NestedTabs.Level>
  );
}

function SortableBlockCard({ block }: { block: DemoBlock }) {
  return (
    <SortableItem id={block.id}>
      {({ setActivatorNodeRef, attributes, listeners }) => (
        <div className={styles.sortableBlock} data-block-id={block.id}>
          <SortableReorderHandle
            label={`Reorder ${block.label}`}
            setActivatorNodeRef={setActivatorNodeRef}
            attributes={attributes}
            listeners={listeners}
          />
          <SurfaceFiller className={styles.sortableBlockContent} height={32} />
        </div>
      )}
    </SortableItem>
  );
}

function SortableRegion({
  definition,
  blocks,
  activeBlock,
  sourceRegion,
}: {
  definition: DemoRegionDefinition;
  blocks: DemoBlock[];
  activeBlock: DemoBlock | null;
  sourceRegion: DemoRegionId | undefined;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `region:${definition.id}`,
  });
  const canAccept =
    activeBlock && sourceRegion ? canRegionAccept(definition, blocks, activeBlock, sourceRegion) : undefined;
  const dropState =
    activeBlock && (isOver || definition.id !== sourceRegion) ? (canAccept ? 'valid' : 'invalid') : undefined;

  return (
    <section
      ref={setNodeRef}
      className={styles.dragRegion}
      data-region={definition.id}
      data-drop-state={dropState}
      aria-label={definition.label}
    >
      <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
        <div className={styles.sortableBlocks}>
          {blocks.map((block) => (
            <SortableBlockCard key={block.id} block={block} />
          ))}
          {blocks.length === 0 ? <div className={styles.emptyTarget} aria-hidden /> : null}
        </div>
      </SortableContext>
    </section>
  );
}

function SortingFixture() {
  const [activePath, setActivePath] = useState<NestedTabsPath>([PAGE_TWO, BLOCK_INTRO]);
  const [regions, setRegions] = useState<Record<DemoRegionId, DemoBlock[]>>(initialRegionBlocks);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState('Ready');
  const draggedBlock = draggedId
    ? (demoRegions.flatMap((region) => regions[region.id]).find((block) => block.id === draggedId) ?? null)
    : null;
  const sourceRegion = draggedId ? findBlockRegion(regions, draggedId) : undefined;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragStart({ active }: DragStartEvent) {
    setDraggedId(String(active.id));
    setOutcome('Dragging does not change the active path.');
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const blockId = String(active.id);
    const from = findBlockRegion(regions, blockId);
    const overId = over ? String(over.id) : undefined;
    const to = overId?.startsWith('region:')
      ? (overId.slice('region:'.length) as DemoRegionId)
      : overId
        ? findBlockRegion(regions, overId)
        : undefined;
    const block = from ? regions[from].find((candidate) => candidate.id === blockId) : undefined;

    setDraggedId(null);
    if (!from || !to || !block || !overId) {
      setOutcome('No Page-local Block region accepted that drop.');
      return;
    }

    const definition = demoRegions.find((region) => region.id === to);
    if (!definition || !canRegionAccept(definition, regions[to], block, from)) {
      setOutcome(`${definition?.label ?? 'That target'} does not accept ${block.kind} blocks here.`);
      return;
    }

    if (from === to) {
      const fromIndex = regions[from].findIndex((candidate) => candidate.id === blockId);
      const toIndex = overId.startsWith('region:')
        ? regions[to].length - 1
        : regions[to].findIndex((candidate) => candidate.id === overId);
      if (fromIndex !== toIndex && toIndex >= 0) {
        setRegions((current) => ({
          ...current,
          [from]: arrayMove(current[from], fromIndex, toIndex),
        }));
        setOutcome(`${block.label} reordered inside ${definition.label}.`);
      }
      return;
    }

    const insertAt = overId.startsWith('region:')
      ? regions[to].length
      : Math.max(
          0,
          regions[to].findIndex((candidate) => candidate.id === overId)
        );
    setRegions((current) => {
      const nextSource = current[from].filter((candidate) => candidate.id !== blockId);
      const nextTarget = [...current[to]];
      nextTarget.splice(insertAt, 0, block);
      return { ...current, [from]: nextSource, [to]: nextTarget };
    });
    setOutcome(`${block.label} moved to ${definition.label}. The active path stayed on the Block.`);
  }

  return (
    <NestedTabs activePath={activePath} ariaLabel="Sortable Rulebook editor" className={styles.fixedHeight}>
      {pageLevel({ onNavigate: setActivePath })}
      {sortingDetailLevel({ regions, onNavigate: setActivePath })}
      <NestedTabs.ContentPanel aria-label="Sortable Page regions">
        <div className={styles.panel}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragCancel={() => setDraggedId(null)}
            onDragEnd={handleDragEnd}
          >
            <div className={styles.dragRegions}>
              {demoRegions.map((definition) => (
                <SortableRegion
                  key={definition.id}
                  definition={definition}
                  blocks={regions[definition.id]}
                  activeBlock={draggedBlock}
                  sourceRegion={sourceRegion}
                />
              ))}
            </div>
          </DndContext>
          <p className={styles.visuallyHidden} role="status">
            {outcome}
          </p>
        </div>
      </NestedTabs.ContentPanel>
    </NestedTabs>
  );
}

const meta = preview.meta({
  title: 'Nested Tabs',
  component: NestedTabs,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'NestedTabs renders two connected icon-only navigation Levels beside a caller-owned ContentPanel. The caller owns path and navigation state; Items remain semantic links.',
      },
    },
  },
});

export const PageDetailsActive = meta.story({
  render: () => (
    <main className={styles.stage}>
      <HierarchyFixture initialPath={[PAGE_TWO, DETAILS]} />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Article layout' })).toHaveAttribute('data-path-state', 'ancestor');
    await expect(canvas.getByRole('link', { name: 'Page details' })).toHaveAttribute('aria-current', 'page');
    await expect(canvas.queryByRole('tab')).not.toBeInTheDocument();
  },
});

export const ControlRegionActive = meta.story({
  render: () => (
    <main className={styles.stage}>
      <HierarchyFixture initialPath={[PAGE_TWO, CONTROL_RULES]} />
    </main>
  ),
});

export const BlockActive = meta.story({
  render: () => (
    <main className={styles.stage}>
      <HierarchyFixture initialPath={[PAGE_TWO, BLOCK_IMAGE]} />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Illustration block' })).toHaveAttribute('aria-current', 'page');
    await expect(canvas.getByRole('list', { name: 'Opening region' }).parentElement).toHaveAttribute(
      'data-contains-active-item',
      'true'
    );
  },
});

export const SamePageBlockSorting = meta.story({
  render: () => (
    <main className={styles.stage}>
      <SortingFixture />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Introduction block' })).toHaveAttribute('aria-current', 'page');
    await expect(canvas.getByRole('button', { name: 'Reorder Introduction block' })).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-region]')).toHaveLength(4);
    await expect(canvasElement.querySelector('[data-nested-tabs-level] [data-region]')).toBeNull();
  },
});

export const GroupContainmentComparison = meta.story({
  render: () => (
    <main className={styles.comparison}>
      <section className={styles.comparisonCase}>
        <p className={styles.caseLabel}>Derived Group emphasis</p>
        <HierarchyFixture initialPath={[PAGE_TWO, BLOCK_IMAGE]} tools={false} />
      </section>
      <section className={styles.comparisonCase}>
        <p className={styles.caseLabel}>State exposed, no visual emphasis</p>
        <HierarchyFixture initialPath={[PAGE_TWO, BLOCK_IMAGE]} className={styles.withoutGroupEmphasis} tools={false} />
      </section>
    </main>
  ),
});

function OverflowFixture() {
  const [activePath, setActivePath] = useState<NestedTabsPath>(['page-10', 'block-12']);
  return (
    <NestedTabs activePath={activePath} ariaLabel="Overflowing rulebook editor" className={styles.fixedHeight}>
      <NestedTabs.Level label="Many Pages">
        {Array.from({ length: 14 }, (_, index) => {
          const id = `page-${index + 1}`;
          return pathItem({
            key: id,
            path: [id],
            label: `Chapter ${index + 1}: A deliberately long Page label`,
            icon: index % 3 === 0 ? <Circle /> : index % 3 === 1 ? <Triangle /> : <Hexagon />,
            onNavigate: setActivePath,
          });
        })}
        <NestedTabs.Tools>
          <ActionIcon variant="subtle" aria-label="Add page">
            <Plus aria-hidden />
          </ActionIcon>
        </NestedTabs.Tools>
      </NestedTabs.Level>
      <NestedTabs.Level label="Current Page">
        {pathItem({
          path: ['page-10', DETAILS],
          label: 'Page details with a deliberately long label',
          icon: <FileText />,
          onNavigate: setActivePath,
        })}
        <NestedTabs.Group label="A long structural region label" icon={<Rows3 />}>
          {Array.from({ length: 16 }, (_, index) => {
            const id = `block-${index + 1}`;
            return pathItem({
              key: id,
              path: ['page-10', id],
              label: `Block ${index + 1}: long descriptive name`,
              icon: index % 2 === 0 ? <Type /> : <Image />,
              onNavigate: setActivePath,
            });
          })}
        </NestedTabs.Group>
      </NestedTabs.Level>
      <NestedTabs.ContentPanel aria-label="Tall editor content">
        <SurfaceFiller height={1200} />
      </NestedTabs.ContentPanel>
    </NestedTabs>
  );
}

export const OverflowAndLongLabels = meta.story({
  render: () => (
    <main className={styles.stage}>
      <OverflowFixture />
    </main>
  ),
});

export const NarrowContainer = meta.story({
  globals: { viewport: { value: 'appMobile' } },
  render: () => (
    <main className={styles.stage}>
      <HierarchyFixture initialPath={[PAGE_TWO, BLOCK_LIST]} />
    </main>
  ),
});

export const LevelWithoutTools = meta.story({
  render: () => (
    <main className={styles.stage}>
      <HierarchyFixture initialPath={[PAGE_TWO, DETAILS]} tools={false} />
    </main>
  ),
});

export const ReducedMotion = meta.story({
  render: () => (
    <main className={styles.stage}>
      <HierarchyFixture initialPath={[PAGE_TWO, DETAILS]} className={styles.reducedMotion} />
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('link', { name: 'Search and sharing' }));
    await expect(canvas.getByRole('link', { name: 'Search and sharing' })).toHaveAttribute('aria-current', 'page');
  },
});
