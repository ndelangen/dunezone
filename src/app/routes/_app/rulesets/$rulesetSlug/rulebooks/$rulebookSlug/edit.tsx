import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ActionIcon, Alert, Badge, Box, Button, Group, Menu, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { parseFormattedText } from '@shared/formattedText';
import type { FormattedTextParseResult } from '@shared/formattedText';
import type { RulebookBlockDraft, RulebookPageDraft } from '@shared/rulebooks/contents';
import { createFileRoute } from '@tanstack/react-router';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { IconAction } from '@ui/control/IconAction';
import { SortableItem } from '@ui/control/SortableItem';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  BookOpenText,
  ChevronDown,
  CircleHelp,
  FileImage,
  Link,
  ListTree,
  MessageSquareQuote,
  PanelsTopLeft,
  Plus,
  TextCursorInput,
} from 'lucide-react';
import { Fragment, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import styles from './edit.module.css';
import { createRulebookEditorStateManager } from './edit/-rulebookEditorState';
import type { RulebookEditorResult, RulebookEditorStateManager } from './edit/-rulebookEditorState';
import { createEditorialRulebookEditorInput } from './edit/-rulebookEditorState.fixtures';

type PreviewFit = 'height' | 'width';
type DrilldownDepth = 'pages' | 'page' | 'blocks' | 'controls';
type ReadyResult = Extract<RulebookEditorResult, { status: 'ready' }>;
type EditorialPage = Extract<RulebookPageDraft, { layoutId: 'chapter-opener' | 'rules-page' | 'visual-reference' }>;
type EditorialBlock = Extract<RulebookBlockDraft, { kind: 'rule-group' | 'worked-example' | 'asset-figure' }>;
type PageLayoutId = EditorialPage['layoutId'];
type BlockKind = EditorialBlock['kind'];
type SlotFieldDefinition = {
  id: string;
  label: string;
  defaultValue: string;
  multiline?: boolean;
};
type BlockSlotDefinition = {
  id: string;
  label: string;
  mode: 'blocks';
  acceptedBlockKinds: readonly BlockKind[];
  cardinality: { minimum: number; maximum: number | null };
};
type FieldSlotDefinition = {
  id: string;
  label: string;
  mode: 'fields';
  fields: readonly SlotFieldDefinition[];
};
type EditorialSlotDefinition = BlockSlotDefinition | FieldSlotDefinition;
type ControlTarget = { kind: 'page' } | { kind: 'slot'; slotId: string } | { kind: 'block'; blockId: string };
type DirectSlotValues = Record<string, Record<string, Record<string, string>>>;
type FormattedBlock = FormattedTextParseResult['blocks'][number];
type FormattedInline = Extract<FormattedBlock, { kind: 'paragraph' }>['children'][number];

const pageLayoutNames: Record<PageLayoutId, string> = {
  'chapter-opener': 'Chapter opener',
  'rules-page': 'Rules page',
  'visual-reference': 'Visual reference',
};

const blockKindNames: Record<BlockKind, string> = {
  'rule-group': 'Rule group',
  'worked-example': 'Worked example',
  'asset-figure': 'Asset figure',
};

const pageLayoutIds = ['chapter-opener', 'rules-page', 'visual-reference'] as const;
const editorialSlotCatalogue: Record<PageLayoutId, readonly EditorialSlotDefinition[]> = {
  'chapter-opener': [
    {
      id: 'title-band',
      label: 'Title band',
      mode: 'fields',
      fields: [
        { id: 'eyebrow', label: 'Eyebrow', defaultValue: 'Chapter opener' },
        { id: 'subtitle', label: 'Subtitle', defaultValue: 'A first look at the world of Dune', multiline: true },
      ],
    },
    {
      id: 'hero',
      label: 'Hero',
      mode: 'blocks',
      acceptedBlockKinds: ['asset-figure'],
      cardinality: { minimum: 1, maximum: 1 },
    },
    {
      id: 'introduction',
      label: 'Introduction',
      mode: 'blocks',
      acceptedBlockKinds: ['rule-group'],
      cardinality: { minimum: 0, maximum: 1 },
    },
  ],
  'rules-page': [
    {
      id: 'running-header',
      label: 'Running header',
      mode: 'fields',
      fields: [
        { id: 'label', label: 'Section label', defaultValue: 'Core rules' },
        { id: 'intro', label: 'Page introduction', defaultValue: 'Resolve these rules in order.', multiline: true },
      ],
    },
    {
      id: 'main-rules',
      label: 'Main rules',
      mode: 'blocks',
      acceptedBlockKinds: ['rule-group', 'worked-example'],
      cardinality: { minimum: 1, maximum: 4 },
    },
    {
      id: 'figure',
      label: 'Figure',
      mode: 'blocks',
      acceptedBlockKinds: ['asset-figure'],
      cardinality: { minimum: 0, maximum: 1 },
    },
  ],
  'visual-reference': [
    {
      id: 'legend',
      label: 'Legend',
      mode: 'fields',
      fields: [
        { id: 'label', label: 'Legend title', defaultValue: 'Marker guide' },
        {
          id: 'note',
          label: 'Legend note',
          defaultValue: 'Use the printed shapes to identify each marker.',
          multiline: true,
        },
      ],
    },
    {
      id: 'figures',
      label: 'Figures',
      mode: 'blocks',
      acceptedBlockKinds: ['asset-figure'],
      cardinality: { minimum: 1, maximum: 3 },
    },
    {
      id: 'notes',
      label: 'Notes',
      mode: 'blocks',
      acceptedBlockKinds: ['worked-example'],
      cardinality: { minimum: 0, maximum: 2 },
    },
  ],
};
const drilldownDepthClassNames: Record<DrilldownDepth, string> = {
  pages: styles.drilldownSidebarPages,
  page: styles.drilldownSidebarPage,
  blocks: styles.drilldownSidebarBlocks,
  controls: styles.drilldownSidebarControls,
};

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit')({
  component: RulebookEditorPage,
});

function renderInline(nodes: readonly FormattedInline[]): ReactNode {
  return nodes.map((node, index) => {
    if (node.kind === 'text') {
      return <Fragment key={index}>{node.value}</Fragment>;
    }
    if (node.kind === 'line-break') {
      return <br key={index} />;
    }
    const children = renderInline(node.children);
    if (node.mark === 'bold') {
      return <strong key={index}>{children}</strong>;
    }
    if (node.mark === 'italic') {
      return <em key={index}>{children}</em>;
    }
    return (
      <span key={index} className={styles.underline}>
        {children}
      </span>
    );
  });
}

function FormattedTextPreview({ value }: { value: string }) {
  const parsed = parseFormattedText(value);
  if (!parsed.valid) {
    return <p className={styles.literalText}>{value}</p>;
  }
  if (parsed.blocks.length === 0) {
    return <p className={styles.emptyText}>Empty text</p>;
  }
  return parsed.blocks.map((block, index) =>
    block.kind === 'paragraph' ? (
      <p key={index}>{renderInline(block.children)}</p>
    ) : (
      <ul key={index}>
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInline(item.children)}</li>
        ))}
      </ul>
    )
  );
}

function PageLayoutIcon({ layoutId, size = 18 }: Readonly<{ layoutId: PageLayoutId; size?: number }>) {
  if (layoutId === 'chapter-opener') {
    return <BookOpenText size={size} aria-hidden />;
  }
  if (layoutId === 'visual-reference') {
    return <FileImage size={size} aria-hidden />;
  }
  return <ListTree size={size} aria-hidden />;
}

function BlockKindIcon({ kind, size = 18 }: Readonly<{ kind: BlockKind; size?: number }>) {
  if (kind === 'rule-group') {
    return <ListTree size={size} aria-hidden />;
  }
  if (kind === 'worked-example') {
    return <MessageSquareQuote size={size} aria-hidden />;
  }
  return <FileImage size={size} aria-hidden />;
}

function SlotIcon({ slot, size = 18 }: Readonly<{ slot: EditorialSlotDefinition; size?: number }>) {
  if (slot.mode === 'fields') {
    return <TextCursorInput size={size} aria-hidden />;
  }
  return <PanelsTopLeft size={size} aria-hidden />;
}

function slotsForPage(page: EditorialPage): readonly EditorialSlotDefinition[] {
  return editorialSlotCatalogue[page.layoutId];
}

function blocksForSlot(
  page: EditorialPage,
  slot: BlockSlotDefinition,
  blocksById: ReadyResult['draft']['blocksById']
): readonly EditorialBlock[] {
  return page.slots.body.flatMap((id) => {
    const block = blocksById[id];
    return block &&
      block.kind !== 'text' &&
      block.kind !== 'repeated-text' &&
      slot.acceptedBlockKinds.includes(block.kind)
      ? [block]
      : [];
  });
}

function slotCardinality(slot: BlockSlotDefinition, count: number): string {
  const maximum = slot.cardinality.maximum;
  if (maximum === null) {
    return `${count} blocks`;
  }
  return `${count} of ${maximum}`;
}

function slotFieldValues(
  pageId: string,
  slot: FieldSlotDefinition,
  directValues: DirectSlotValues
): Record<string, string> {
  return Object.fromEntries(
    slot.fields.map((field) => [field.id, directValues[pageId]?.[slot.id]?.[field.id] ?? field.defaultValue])
  );
}

function AssetImagePlaceholder({ label }: Readonly<{ label: string }>) {
  return (
    <div className={styles.assetImagePlaceholder}>
      <FileImage aria-hidden />
      <span>{label}</span>
    </div>
  );
}

function RulebookPagePreview({
  page,
  blocksById,
  pageNumber,
  target,
  directValues,
}: Readonly<{
  page: EditorialPage;
  blocksById: ReadyResult['draft']['blocksById'];
  pageNumber: number;
  target: ControlTarget;
  directValues: DirectSlotValues;
}>) {
  const pageSelected = target.kind === 'page';
  return (
    <article className={styles.documentPage} aria-label="Rulebook page preview" data-page-selected={pageSelected}>
      <div className={styles.previewPageDetails}>
        <div className={styles.documentFolio}>
          {pageLayoutNames[page.layoutId]} / {String(pageNumber).padStart(2, '0')}
        </div>
        <h1>{page.title}</h1>
      </div>
      <div className={styles.previewSlots}>
        {slotsForPage(page).map((slot) => {
          if (slot.mode === 'fields') {
            const values = slotFieldValues(page.id, slot, directValues);
            return (
              <section
                className={styles.previewDirectSlot}
                data-selected={target.kind === 'slot' && target.slotId === slot.id}
                key={slot.id}
              >
                <span>{values[slot.fields[0]!.id]}</span>
                <FormattedTextPreview value={values[slot.fields[1]!.id] ?? ''} />
              </section>
            );
          }
          return (
            <div className={styles.previewBlockSlot} data-slot={slot.id} key={slot.id}>
              {blocksForSlot(page, slot, blocksById).map((block) => {
                const selected = target.kind === 'block' && target.blockId === block.id;
                if (block.kind === 'asset-figure') {
                  return (
                    <section className={styles.previewAssetBlock} data-selected={selected} key={block.id}>
                      <AssetImagePlaceholder label={block.title} />
                      <FormattedTextPreview value={block.text} />
                    </section>
                  );
                }
                if (block.kind === 'worked-example') {
                  return (
                    <aside className={styles.previewCallout} data-selected={selected} key={block.id}>
                      <strong>{block.title}</strong>
                      <FormattedTextPreview value={block.text} />
                    </aside>
                  );
                }
                return (
                  <section className={styles.previewRuleGroup} data-selected={selected} key={block.id}>
                    <span>{blockKindNames[block.kind]}</span>
                    <h2>{block.title}</h2>
                    <FormattedTextPreview value={block.text} />
                  </section>
                );
              })}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function DrilldownTooltip({
  title,
  details,
  children,
}: Readonly<{
  title: string;
  details: readonly string[];
  children: ReactElement;
}>) {
  return (
    <Tooltip
      label={
        <Stack gap={1}>
          <Text size="xs" fw={700}>
            {title}
          </Text>
          {details.map((detail) => (
            <Text size="xs" key={detail}>
              {detail}
            </Text>
          ))}
        </Stack>
      }
      position="right"
      openDelay={250}
      withArrow
      multiline
      maw={260}
    >
      {children}
    </Tooltip>
  );
}

function DrilldownLevelChoice({
  title,
  metadata,
  active,
  tabIndex,
  onClick,
}: Readonly<{
  title: string;
  metadata: string;
  active: boolean;
  tabIndex: number;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      className={styles.levelChoice}
      aria-current={active ? 'true' : undefined}
      tabIndex={tabIndex}
      onClick={onClick}
    >
      <strong>{title}</strong>
      <Badge color="gray" variant="outline" size="sm">
        {metadata}
      </Badge>
    </button>
  );
}

function AddMenu<T extends string>({
  label,
  menuLabel,
  choices,
  collapsed,
  onPick,
}: Readonly<{
  label: string;
  menuLabel: string;
  choices: readonly { value: T; label: string; icon: ReactNode }[];
  collapsed: boolean;
  onPick: (value: T) => void;
}>) {
  return (
    <Menu position={collapsed ? 'right-end' : 'bottom-start'} withArrow>
      <Menu.Target>
        {collapsed ? (
          <ActionIcon className={styles.collapsedAdd} aria-label={label} color="confirm" variant="light" size="sm">
            <Plus size={15} aria-hidden />
          </ActionIcon>
        ) : (
          <Button
            className={styles.expandedAdd}
            color="confirm"
            size="sm"
            leftSection={<Plus size={15} aria-hidden />}
            rightSection={<ChevronDown size={14} aria-hidden />}
            fullWidth
          >
            {label}
          </Button>
        )}
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{menuLabel}</Menu.Label>
        {choices.map((choice) => (
          <Menu.Item key={choice.value} leftSection={choice.icon} onClick={() => onPick(choice.value)}>
            {choice.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

function createPage(layoutId: PageLayoutId, id: string, anchor: string): EditorialPage {
  let title = 'New rules page';
  if (layoutId === 'chapter-opener') {
    title = 'New chapter';
  } else if (layoutId === 'visual-reference') {
    title = 'New reference';
  }
  return { id, anchor, title, layoutId, slots: { body: [] } } as EditorialPage;
}

function createBlock(kind: BlockKind, id: string): EditorialBlock {
  if (kind === 'rule-group') {
    return { id, kind, title: 'Untitled rule group', text: 'Replace this starter content with the rule text.' };
  }
  if (kind === 'worked-example') {
    return { id, kind, title: 'Worked example', text: 'Explain one example step by step.' };
  }
  return { id, kind, title: 'Selected Asset', text: 'Add a short caption for this figure.' };
}

function defaultBlockKind(layoutId: PageLayoutId): BlockKind {
  const firstBlockSlot = editorialSlotCatalogue[layoutId].find(
    (slot): slot is BlockSlotDefinition => slot.mode === 'blocks'
  );
  return firstBlockSlot?.acceptedBlockKinds[0] ?? 'rule-group';
}

function destinationForIndex(ids: readonly string[], index: number) {
  return { afterId: ids[index - 1] ?? null, beforeId: ids[index + 1] ?? null };
}

function BlockControls({
  block,
  dispatch,
}: Readonly<{
  block?: EditorialBlock;
  dispatch: RulebookEditorStateManager['dispatch'];
}>) {
  if (!block) {
    return (
      <Text size="sm" c="dimmed">
        Select a block to edit it.
      </Text>
    );
  }
  const target = { kind: 'block' as const, blockId: block.id };
  return (
    <Stack gap="md" className={styles.editorControls}>
      <TextInput
        label="Title"
        value={block.title}
        onChange={(event) => dispatch({ kind: 'set', target, field: 'title', value: event.currentTarget.value })}
      />
      <FormattedTextInput
        label="Content"
        value={block.text}
        autosize
        minRows={6}
        onChange={(value) => dispatch({ kind: 'set', target, field: 'text', value })}
      />
    </Stack>
  );
}

function PageControls({
  page,
  dispatch,
}: Readonly<{
  page: EditorialPage;
  dispatch: RulebookEditorStateManager['dispatch'];
}>) {
  const target = { kind: 'page' as const, pageId: page.id };
  return (
    <Stack gap="md" className={styles.editorControls}>
      <TextInput
        label="Page title"
        value={page.title}
        onChange={(event) => dispatch({ kind: 'set', target, field: 'title', value: event.currentTarget.value })}
      />
      <TextInput
        label="Page anchor"
        description="Used after # in links. Reordering this page does not change it."
        leftSection="#"
        value={page.anchor}
        onChange={(event) => dispatch({ kind: 'set', target, field: 'anchor', value: event.currentTarget.value })}
      />
      <TextInput label="Layout" value={pageLayoutNames[page.layoutId]} readOnly />
      <Text size="xs" c="dimmed">
        The layout is fixed after page creation because it defines this page's slots.
      </Text>
    </Stack>
  );
}

function DirectSlotControls({
  page,
  slot,
  directValues,
  onChange,
}: Readonly<{
  page: EditorialPage;
  slot: FieldSlotDefinition;
  directValues: DirectSlotValues;
  onChange: (pageId: string, slotId: string, fieldId: string, value: string) => void;
}>) {
  const values = slotFieldValues(page.id, slot, directValues);
  return (
    <Stack gap="md" className={styles.editorControls}>
      <Badge variant="light" color="gray" w="fit-content">
        Direct slot fields
      </Badge>
      {slot.fields.map((field) =>
        field.multiline ? (
          <FormattedTextInput
            key={field.id}
            label={field.label}
            value={values[field.id] ?? ''}
            autosize
            minRows={4}
            onChange={(value) => onChange(page.id, slot.id, field.id, value)}
          />
        ) : (
          <TextInput
            key={field.id}
            label={field.label}
            value={values[field.id] ?? ''}
            onChange={(event) => onChange(page.id, slot.id, field.id, event.currentTarget.value)}
          />
        )
      )}
      <Text size="xs" c="dimmed">
        This slot has no block list because its layout owns these fixed fields.
      </Text>
    </Stack>
  );
}

function RulebookWorkspace({
  result,
  dispatch,
  fit,
  directValues,
  onDirectValueChange,
}: Readonly<{
  result: ReadyResult;
  dispatch: RulebookEditorStateManager['dispatch'];
  fit: PreviewFit;
  directValues: DirectSlotValues;
  onDirectValueChange: (pageId: string, slotId: string, fieldId: string, value: string) => void;
}>) {
  const [depth, setDepth] = useState<DrilldownDepth>('controls');
  const [activePageId, setActivePageId] = useState(result.draft.pageOrder[1] ?? result.draft.pageOrder[0]);
  const activePage = result.draft.pagesById[activePageId ?? ''] as EditorialPage | undefined;
  const initialSlot = activePage
    ? slotsForPage(activePage).find((slot): slot is BlockSlotDefinition => slot.mode === 'blocks')
    : undefined;
  const initialBlock =
    activePage && initialSlot ? blocksForSlot(activePage, initialSlot, result.draft.blocksById)[0] : undefined;
  const [activeSlotId, setActiveSlotId] = useState(initialSlot?.id ?? '');
  const [target, setTarget] = useState<ControlTarget>(
    initialBlock ? { kind: 'block', blockId: initialBlock.id } : { kind: 'page' }
  );
  const activeSlot = activePage ? slotsForPage(activePage).find((slot) => slot.id === activeSlotId) : undefined;
  const blockSlot = activeSlot?.mode === 'blocks' ? activeSlot : undefined;
  const slotBlocks = activePage && blockSlot ? blocksForSlot(activePage, blockSlot, result.draft.blocksById) : [];
  const slotBlockIds = slotBlocks.map((block) => block.id);
  const selectedBlock = target.kind === 'block' ? slotBlocks.find((block) => block.id === target.blockId) : undefined;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (!activePage) {
    return <Alert color="yellow">The editor has no page to display.</Alert>;
  }

  const pageNumber = result.draft.pageOrder.indexOf(activePage.id) + 1;
  const selectDefaultSlot = (page: EditorialPage) => {
    const slots = slotsForPage(page);
    const slot = slots.find((candidate): candidate is BlockSlotDefinition => candidate.mode === 'blocks') ?? slots[0];
    setActiveSlotId(slot?.id ?? '');
    return slot;
  };
  const selectPageInstantly = (pageId: string) => {
    const page = result.draft.pagesById[pageId] as EditorialPage | undefined;
    if (!page) {
      return;
    }
    setActivePageId(pageId);
    selectDefaultSlot(page);
    setTarget({ kind: 'page' });
    setDepth('controls');
  };
  const openPage = (pageId: string) => {
    const page = result.draft.pagesById[pageId] as EditorialPage | undefined;
    if (!page) {
      return;
    }
    setActivePageId(pageId);
    selectDefaultSlot(page);
    setTarget({ kind: 'page' });
    setDepth('page');
  };
  const openPageDetails = () => {
    setTarget({ kind: 'page' });
    setDepth('controls');
  };
  const openSlot = (slot: EditorialSlotDefinition) => {
    setActiveSlotId(slot.id);
    if (slot.mode === 'fields') {
      setTarget({ kind: 'slot', slotId: slot.id });
      setDepth('controls');
      return;
    }
    const firstBlock = blocksForSlot(activePage, slot, result.draft.blocksById)[0];
    setTarget(firstBlock ? { kind: 'block', blockId: firstBlock.id } : { kind: 'slot', slotId: slot.id });
    setDepth('blocks');
  };
  const openBlock = (blockId: string) => {
    setTarget({ kind: 'block', blockId });
    setDepth('controls');
  };
  const addPage = (layoutId: PageLayoutId) => {
    const suffix = globalThis.crypto.randomUUID();
    const pageId = `page-${suffix}`;
    const blockId = `block-${globalThis.crypto.randomUUID()}`;
    const page = createPage(layoutId, pageId, `new-${layoutId}-${suffix.slice(0, 8)}`);
    const block = createBlock(defaultBlockKind(layoutId), blockId);
    dispatch({
      kind: 'create',
      entity: { kind: 'page', page },
      placement: {
        container: { kind: 'page-order' },
        afterId: result.draft.pageOrder.at(-1) ?? null,
        beforeId: null,
      },
    });
    dispatch({
      kind: 'create',
      entity: { kind: 'block', block },
      placement: { container: { kind: 'page-slot', pageId, slotId: 'body' }, afterId: null, beforeId: null },
    });
    setActivePageId(pageId);
    const slot = selectDefaultSlot(page);
    setActiveSlotId(slot?.id ?? '');
    setTarget({ kind: 'page' });
    setDepth('controls');
  };
  const addBlock = (kind: BlockKind) => {
    if (!blockSlot) {
      return;
    }
    const blockId = `block-${globalThis.crypto.randomUUID()}`;
    dispatch({
      kind: 'create',
      entity: { kind: 'block', block: createBlock(kind, blockId) },
      placement: {
        container: { kind: 'page-slot', pageId: activePage.id, slotId: 'body' },
        afterId: activePage.slots.body.at(-1) ?? null,
        beforeId: null,
      },
    });
    setTarget({ kind: 'block', blockId });
    setDepth('controls');
  };
  const onPageDragEnd = ({ active, over }: DragEndEvent) => {
    const sourceIndex = result.draft.pageOrder.indexOf(String(active.id));
    const targetIndex = over ? result.draft.pageOrder.indexOf(String(over.id)) : -1;
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return;
    }
    const order = arrayMove(result.draft.pageOrder, sourceIndex, targetIndex);
    const index = order.indexOf(String(active.id));
    dispatch({
      kind: 'place',
      target: { kind: 'page', pageId: String(active.id) },
      destination: { container: { kind: 'page-order' }, ...destinationForIndex(order, index) },
    });
  };
  const onBlockDragEnd = ({ active, over }: DragEndEvent) => {
    const sourceIndex = slotBlockIds.indexOf(String(active.id));
    const targetIndex = over ? slotBlockIds.indexOf(String(over.id)) : -1;
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return;
    }
    const order = arrayMove(slotBlockIds, sourceIndex, targetIndex);
    const index = order.indexOf(String(active.id));
    dispatch({
      kind: 'place',
      target: { kind: 'block', blockId: String(active.id) },
      destination: {
        container: { kind: 'page-slot', pageId: activePage.id, slotId: 'body' },
        ...destinationForIndex(order, index),
      },
    });
  };
  const slotIsFull =
    blockSlot?.cardinality.maximum !== null && slotBlocks.length >= (blockSlot?.cardinality.maximum ?? Infinity);
  const controlsHeading = (() => {
    if (target.kind === 'page') {
      return { icon: <Link size={20} aria-hidden />, label: 'Page details' };
    }
    if (target.kind === 'slot') {
      const slot = slotsForPage(activePage).find((candidate) => candidate.id === target.slotId);
      return { icon: slot ? <SlotIcon slot={slot} size={20} /> : null, label: slot?.label ?? 'Slot' };
    }
    return {
      icon: selectedBlock ? <BlockKindIcon kind={selectedBlock.kind} size={20} /> : null,
      label: selectedBlock?.title ?? 'Select a block',
    };
  })();
  const selectedDirectSlot =
    target.kind === 'slot'
      ? slotsForPage(activePage).find(
          (slot): slot is FieldSlotDefinition => slot.id === target.slotId && slot.mode === 'fields'
        )
      : undefined;

  return (
    <Box
      className={styles.workspaceViewport}
      data-fit={fit}
      role="region"
      aria-label="Rulebook editor and preview"
      tabIndex={0}
    >
      <div className={styles.stickyFrame}>
        <Surface
          padding="none"
          as="aside"
          aria-label="Rulebook outline and controls"
          className={`${styles.drilldownSidebar} ${drilldownDepthClassNames[depth]} ${blockSlot ? '' : styles.drilldownSidebarWithoutBlocks}`}
        >
          <section
            className={`${styles.drilldownLevel} ${styles.pagesLevel} ${depth === 'pages' ? '' : styles.levelCollapsed}`}
            aria-label="Pages panel"
          >
            <div className={styles.levelHeading}>
              <Text fw={700}>Pages</Text>
              <IconAction
                label="About page ordering"
                tooltip="Drag a page icon to reorder pages. Choose a page to open its details and slots."
                icon={<CircleHelp size={15} aria-hidden />}
                size="sm"
                variant="subtle"
              />
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onPageDragEnd}>
              <SortableContext items={result.draft.pageOrder} strategy={verticalListSortingStrategy}>
                <div className={styles.levelList}>
                  {result.draft.pageOrder.map((pageId, index) => {
                    const page = result.draft.pagesById[pageId] as EditorialPage | undefined;
                    if (!page) {
                      return null;
                    }
                    return (
                      <SortableItem className={styles.levelItem} id={page.id} key={page.id}>
                        {({ setActivatorNodeRef, attributes, listeners }) => (
                          <>
                            <DrilldownTooltip
                              title={page.title}
                              details={[
                                `Page ${index + 1} · ${pageLayoutNames[page.layoutId]}`,
                                `${slotsForPage(page).length} slots · #${page.anchor}`,
                              ]}
                            >
                              <button
                                type="button"
                                ref={setActivatorNodeRef}
                                className={styles.levelIcon}
                                aria-current={page.id === activePage.id ? 'page' : undefined}
                                aria-label={`${page.title}. Page ${index + 1}. Drag to reorder or click to select.`}
                                onClick={() => (depth === 'pages' ? openPage(page.id) : selectPageInstantly(page.id))}
                                {...attributes}
                                {...listeners}
                              >
                                <PageLayoutIcon layoutId={page.layoutId} />
                                <span>{index + 1}</span>
                              </button>
                            </DrilldownTooltip>
                            <DrilldownLevelChoice
                              title={page.title}
                              metadata={pageLayoutNames[page.layoutId]}
                              active={page.id === activePage.id}
                              tabIndex={depth === 'pages' ? 0 : -1}
                              onClick={() => openPage(page.id)}
                            />
                          </>
                        )}
                      </SortableItem>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
            <div className={styles.levelFooter}>
              <button
                type="button"
                className={styles.levelLabel}
                aria-label="Open pages"
                tabIndex={depth === 'pages' ? -1 : 0}
                onClick={() => setDepth('pages')}
              >
                <span>Pages</span>
              </button>
              <div className={styles.addSlot}>
                <AddMenu
                  label="Add page"
                  menuLabel="Choose a page layout"
                  choices={pageLayoutIds.map((layoutId) => ({
                    value: layoutId,
                    label: pageLayoutNames[layoutId],
                    icon: <PageLayoutIcon layoutId={layoutId} />,
                  }))}
                  collapsed={depth !== 'pages'}
                  onPick={addPage}
                />
              </div>
            </div>
          </section>
          <section
            className={`${styles.drilldownLevel} ${styles.structureLevel} ${depth === 'blocks' || depth === 'controls' ? styles.levelCollapsed : ''} ${depth === 'pages' ? styles.levelHidden : ''}`}
            aria-label="Page structure panel"
            aria-hidden={depth === 'pages'}
            inert={depth === 'pages'}
          >
            <div className={styles.levelHeading}>
              <Text fw={700} truncate>
                {activePage.title}
              </Text>
              <IconAction
                label="About page structure"
                tooltip="Page details belong to the page. Each named slot decides whether it contains blocks or fixed fields."
                icon={<CircleHelp size={15} aria-hidden />}
                size="sm"
                variant="subtle"
              />
            </div>
            <div className={styles.levelList}>
              <div className={styles.levelItem}>
                <button
                  type="button"
                  className={styles.levelIcon}
                  aria-current={target.kind === 'page' ? 'true' : undefined}
                  aria-label="Open page details"
                  onClick={openPageDetails}
                >
                  <Link size={18} aria-hidden />
                </button>
                <DrilldownLevelChoice
                  title="Page details"
                  metadata="Title + URL"
                  active={target.kind === 'page'}
                  tabIndex={depth === 'page' ? 0 : -1}
                  onClick={openPageDetails}
                />
              </div>
              <Text className={styles.slotListLabel} size="xs" fw={700} c="dimmed">
                Slots in {pageLayoutNames[activePage.layoutId]}
              </Text>
              {slotsForPage(activePage).map((slot) => {
                const slotBlocks =
                  slot.mode === 'blocks' ? blocksForSlot(activePage, slot, result.draft.blocksById) : [];
                const metadata =
                  slot.mode === 'fields'
                    ? 'Direct fields'
                    : `${slotCardinality(slot, slotBlocks.length)} · ${slot.acceptedBlockKinds.length === 1 ? blockKindNames[slot.acceptedBlockKinds[0]!] : `${slot.acceptedBlockKinds.length} types`}`;
                const active =
                  activeSlotId === slot.id && (target.kind === 'slot' || target.kind === 'block' || depth === 'blocks');
                return (
                  <div className={styles.levelItem} key={slot.id}>
                    <DrilldownTooltip
                      title={slot.label}
                      details={
                        slot.mode === 'fields'
                          ? ['Fixed fields defined by this layout', 'No blocks or block ordering']
                          : [
                              `Accepts: ${slot.acceptedBlockKinds.map((kind) => blockKindNames[kind]).join(', ')}`,
                              `Cardinality: ${slot.cardinality.minimum} to ${slot.cardinality.maximum ?? 'unlimited'}`,
                            ]
                      }
                    >
                      <button
                        type="button"
                        className={styles.levelIcon}
                        aria-current={active ? 'true' : undefined}
                        aria-label={`Open ${slot.label} slot`}
                        onClick={() => openSlot(slot)}
                      >
                        <SlotIcon slot={slot} />
                      </button>
                    </DrilldownTooltip>
                    <DrilldownLevelChoice
                      title={slot.label}
                      metadata={metadata}
                      active={active}
                      tabIndex={depth === 'page' ? 0 : -1}
                      onClick={() => openSlot(slot)}
                    />
                  </div>
                );
              })}
            </div>
            <div className={styles.levelFooter} data-empty={depth === 'page'}>
              <button
                type="button"
                className={styles.levelLabel}
                aria-label="Open page structure"
                tabIndex={depth === 'blocks' || depth === 'controls' ? 0 : -1}
                onClick={() => setDepth('page')}
              >
                <span>Page</span>
              </button>
            </div>
          </section>
          <section
            className={`${styles.drilldownLevel} ${styles.blocksLevel} ${depth === 'controls' ? styles.levelCollapsed : ''} ${depth === 'pages' || depth === 'page' || !blockSlot ? styles.levelHidden : ''}`}
            aria-label="Blocks panel"
            aria-hidden={depth === 'pages' || depth === 'page' || !blockSlot}
            inert={depth === 'pages' || depth === 'page' || !blockSlot}
          >
            <div className={styles.levelHeading}>
              <Text fw={700} truncate>
                {blockSlot?.label ?? 'Blocks'}
              </Text>
              <Group gap={4} wrap="nowrap">
                {depth === 'blocks' && blockSlot && !slotIsFull ? (
                  <AddMenu
                    label="Add block"
                    menuLabel={`Add to ${blockSlot.label}`}
                    choices={blockSlot.acceptedBlockKinds.map((kind) => ({
                      value: kind,
                      label: blockKindNames[kind],
                      icon: <BlockKindIcon kind={kind} />,
                    }))}
                    collapsed
                    onPick={addBlock}
                  />
                ) : null}
                <IconAction
                  label="About this slot"
                  tooltip={
                    blockSlot
                      ? `${blockSlot.label} accepts ${blockSlot.acceptedBlockKinds.map((kind) => blockKindNames[kind]).join(' or ')} blocks. Drag to reorder within this slot.`
                      : ''
                  }
                  icon={<CircleHelp size={15} aria-hidden />}
                  size="sm"
                  variant="subtle"
                />
              </Group>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onBlockDragEnd}>
              <SortableContext items={slotBlockIds} strategy={verticalListSortingStrategy}>
                <div className={styles.levelList}>
                  {slotBlocks.map((block) => (
                    <SortableItem className={styles.levelItem} id={block.id} key={block.id}>
                      {({ setActivatorNodeRef, attributes, listeners }) => (
                        <>
                          <DrilldownTooltip
                            title={block.title}
                            details={[blockKindNames[block.kind], activePage.title]}
                          >
                            <button
                              type="button"
                              ref={setActivatorNodeRef}
                              className={styles.levelIcon}
                              aria-current={target.kind === 'block' && block.id === target.blockId ? 'true' : undefined}
                              aria-label={`${block.title}. ${blockKindNames[block.kind]}. Drag to reorder or click to select.`}
                              onClick={() => openBlock(block.id)}
                              {...attributes}
                              {...listeners}
                            >
                              <BlockKindIcon kind={block.kind} />
                            </button>
                          </DrilldownTooltip>
                          <DrilldownLevelChoice
                            title={block.title}
                            metadata={blockKindNames[block.kind]}
                            active={target.kind === 'block' && block.id === target.blockId}
                            tabIndex={depth === 'blocks' ? 0 : -1}
                            onClick={() => openBlock(block.id)}
                          />
                        </>
                      )}
                    </SortableItem>
                  ))}
                  {slotBlocks.length === 0 ? (
                    <Text size="sm" c="dimmed" py="sm">
                      This slot is empty.
                    </Text>
                  ) : null}
                </div>
              </SortableContext>
            </DndContext>
            <div className={styles.levelFooter} data-empty={depth === 'blocks'}>
              <button
                type="button"
                className={styles.levelLabel}
                aria-label="Open blocks"
                tabIndex={depth === 'controls' ? 0 : -1}
                onClick={() => setDepth('blocks')}
              >
                <span>Blocks</span>
              </button>
              {depth === 'controls' && blockSlot && !slotIsFull ? (
                <div className={styles.addSlot}>
                  <AddMenu
                    label="Add block"
                    menuLabel={`Add to ${blockSlot.label}`}
                    choices={blockSlot.acceptedBlockKinds.map((kind) => ({
                      value: kind,
                      label: blockKindNames[kind],
                      icon: <BlockKindIcon kind={kind} />,
                    }))}
                    collapsed
                    onPick={addBlock}
                  />
                </div>
              ) : null}
            </div>
          </section>
          <section
            className={`${styles.controlsPanel} ${depth === 'controls' ? '' : styles.controlsHidden}`}
            aria-label="Controls panel"
            aria-hidden={depth !== 'controls'}
            inert={depth !== 'controls'}
          >
            <div className={styles.controlsHeading}>
              {controlsHeading.icon}
              <Text fw={700}>{controlsHeading.label}</Text>
            </div>
            {target.kind === 'page' ? <PageControls page={activePage} dispatch={dispatch} /> : null}
            {selectedDirectSlot ? (
              <DirectSlotControls
                page={activePage}
                slot={selectedDirectSlot}
                directValues={directValues}
                onChange={onDirectValueChange}
              />
            ) : null}
            {target.kind === 'block' ? <BlockControls block={selectedBlock} dispatch={dispatch} /> : null}
          </section>
        </Surface>
        <RulebookPagePreview
          page={activePage}
          blocksById={result.draft.blocksById}
          pageNumber={pageNumber}
          target={target}
          directValues={directValues}
        />
      </div>
      <div className={styles.stickyRunway} aria-hidden />
    </Box>
  );
}

function RulebookEditorPage() {
  const [manager] = useState(() => createRulebookEditorStateManager(createEditorialRulebookEditorInput()));
  const [result, setResult] = useState<RulebookEditorResult>(() => manager.result);
  const [fit, setFit] = useState<PreviewFit>('height');
  const [saveLabel, setSaveLabel] = useState('Save');
  const [directValues, setDirectValues] = useState<DirectSlotValues>({});
  const [directValuesDirty, setDirectValuesDirty] = useState(false);
  const dispatch: RulebookEditorStateManager['dispatch'] = (action) => {
    const next = manager.dispatch(action);
    setResult(next);
    setSaveLabel('Save');
    return next;
  };
  const updateDirectValue = (pageId: string, slotId: string, fieldId: string, value: string) => {
    setDirectValues((current) => ({
      ...current,
      [pageId]: {
        ...current[pageId],
        [slotId]: {
          ...current[pageId]?.[slotId],
          [fieldId]: value,
        },
      },
    }));
    setDirectValuesDirty(true);
    setSaveLabel('Save');
  };

  if (result.status !== 'ready') {
    return (
      <PageLayout>
        <PageLayout.Content>
          <Alert color="red" role="alert" title="This Rulebook could not open">
            {result.message}
          </Alert>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  const managerHasLocalChanges =
    result.rebasedPatch.creates.length > 0 ||
    result.rebasedPatch.deletes.length > 0 ||
    result.rebasedPatch.sets.length > 0 ||
    result.rebasedPatch.placements.length > 0 ||
    result.rebasedPatch.restorations.length > 0;
  const hasLocalChanges = managerHasLocalChanges || directValuesDirty;
  const save = () => {
    if (!managerHasLocalChanges && directValuesDirty) {
      setDirectValuesDirty(false);
      setSaveLabel('Saved');
      return;
    }
    const saving = manager.dispatch({ kind: 'begin-save' });
    if (saving.status !== 'ready' || !saving.saveRequest) {
      setResult(saving);
      return;
    }
    const saved = manager.dispatch({
      kind: 'save-succeeded',
      saved: { revision: `local-${Date.now()}`, contents: saving.saveRequest.contents },
    });
    setResult(saved);
    setDirectValuesDirty(false);
    setSaveLabel('Saved');
  };

  return (
    <PageLayout>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Badge variant="light" color={hasLocalChanges ? 'yellow' : 'gray'}>
              {hasLocalChanges ? 'Local changes' : 'Saved draft'}
            </Badge>
          </Toolbar.Left>
          <Toolbar.Right>
            <Group gap="xs" wrap="nowrap">
              <Button
                size="xs"
                variant="default"
                onClick={() => setFit((value) => (value === 'height' ? 'width' : 'height'))}
              >
                Fit {fit === 'height' ? 'width' : 'height'}
              </Button>
              <Button size="xs" color="confirm" disabled={!result.canSave && !directValuesDirty} onClick={save}>
                {saveLabel}
              </Button>
            </Group>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <section className={styles.editorRoot} aria-label="Rulebook editing workspace">
          <RulebookWorkspace
            result={result}
            dispatch={dispatch}
            fit={fit}
            directValues={directValues}
            onDirectValueChange={updateDirectValue}
          />
        </section>
      </PageLayout.Content>
    </PageLayout>
  );
}
