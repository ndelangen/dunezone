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
import { rulebookLayoutCatalogue } from '@shared/rulebooks/contents';
import type { RulebookBlockDraft, RulebookPageDraft } from '@shared/rulebooks/contents';
import { createFileRoute } from '@tanstack/react-router';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { IconAction } from '@ui/control/IconAction';
import { SortableItem } from '@ui/control/SortableItem';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { BookOpenText, ChevronDown, CircleHelp, FileImage, ListTree, MessageSquareQuote, Plus } from 'lucide-react';
import { Fragment, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

import styles from './edit.module.css';
import { createRulebookEditorStateManager } from './edit/-rulebookEditorState';
import type { RulebookEditorResult, RulebookEditorStateManager } from './edit/-rulebookEditorState';
import { createEditorialRulebookEditorInput } from './edit/-rulebookEditorState.fixtures';

type PreviewFit = 'height' | 'width';
type DrilldownDepth = 'pages' | 'blocks' | 'controls';
type ReadyResult = Extract<RulebookEditorResult, { status: 'ready' }>;
type EditorialPage = Extract<RulebookPageDraft, { layoutId: 'chapter-opener' | 'rules-page' | 'visual-reference' }>;
type EditorialBlock = Extract<RulebookBlockDraft, { kind: 'rule-group' | 'worked-example' | 'asset-figure' }>;
type PageLayoutId = EditorialPage['layoutId'];
type BlockKind = EditorialBlock['kind'];
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
const drilldownDepthClassNames: Record<DrilldownDepth, string> = {
  pages: styles.drilldownSidebarPages,
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
  blocks,
  pageNumber,
  selectedBlockId,
}: Readonly<{
  page: EditorialPage;
  blocks: readonly EditorialBlock[];
  pageNumber: number;
  selectedBlockId?: string;
}>) {
  return (
    <article className={styles.documentPage} aria-label="Rulebook page preview">
      <div className={styles.documentFolio}>
        {pageLayoutNames[page.layoutId]} / {String(pageNumber).padStart(2, '0')}
      </div>
      <h1>{page.title}</h1>
      <div className={styles.previewBlocks}>
        {blocks.map((block) => {
          const selected = block.id === selectedBlockId;
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
  return layoutId === 'rules-page' ? 'rule-group' : 'asset-figure';
}

function acceptedBlockKinds(layoutId: PageLayoutId): readonly BlockKind[] {
  const layout = rulebookLayoutCatalogue.find((candidate) => candidate.id === layoutId);
  return (layout?.slots[0]?.acceptedBlockKinds ?? []) as readonly BlockKind[];
}

function destinationForIndex(ids: readonly string[], index: number) {
  return { afterId: ids[index - 1] ?? null, beforeId: ids[index + 1] ?? null };
}

function EditorControls({
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

function RulebookWorkspace({
  result,
  dispatch,
  fit,
}: Readonly<{
  result: ReadyResult;
  dispatch: RulebookEditorStateManager['dispatch'];
  fit: PreviewFit;
}>) {
  const [depth, setDepth] = useState<DrilldownDepth>('controls');
  const [activePageId, setActivePageId] = useState(result.draft.pageOrder[1] ?? result.draft.pageOrder[0]);
  const activePage = result.draft.pagesById[activePageId ?? ''] as EditorialPage | undefined;
  const blockIds = activePage?.slots.body ?? [];
  const blocks = blockIds.flatMap((id) => {
    const block = result.draft.blocksById[id];
    return block && block.kind !== 'text' && block.kind !== 'repeated-text' ? [block] : [];
  });
  const [selectedBlockId, setSelectedBlockId] = useState<string | undefined>(blocks[0]?.id);
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? blocks[0];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (!activePage) {
    return <Alert color="yellow">The editor has no page to display.</Alert>;
  }

  const pageNumber = result.draft.pageOrder.indexOf(activePage.id) + 1;
  const selectPageInstantly = (pageId: string) => {
    const page = result.draft.pagesById[pageId] as EditorialPage | undefined;
    setActivePageId(pageId);
    setSelectedBlockId(page?.slots.body[0]);
  };
  const openPage = (pageId: string) => {
    selectPageInstantly(pageId);
    setDepth('blocks');
  };
  const openBlock = (blockId: string) => {
    setSelectedBlockId(blockId);
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
    setSelectedBlockId(blockId);
    setDepth('controls');
  };
  const addBlock = (kind: BlockKind) => {
    const blockId = `block-${globalThis.crypto.randomUUID()}`;
    dispatch({
      kind: 'create',
      entity: { kind: 'block', block: createBlock(kind, blockId) },
      placement: {
        container: { kind: 'page-slot', pageId: activePage.id, slotId: 'body' },
        afterId: blockIds.at(-1) ?? null,
        beforeId: null,
      },
    });
    setSelectedBlockId(blockId);
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
    const sourceIndex = blockIds.indexOf(String(active.id));
    const targetIndex = over ? blockIds.indexOf(String(over.id)) : -1;
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return;
    }
    const order = arrayMove(blockIds, sourceIndex, targetIndex);
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
          className={`${styles.drilldownSidebar} ${drilldownDepthClassNames[depth]}`}
        >
          <section
            className={`${styles.drilldownLevel} ${styles.pagesLevel} ${depth === 'pages' ? '' : styles.levelCollapsed}`}
            aria-label="Pages panel"
          >
            <div className={styles.levelHeading}>
              <Text fw={700}>Pages</Text>
              <IconAction
                label="About page ordering"
                tooltip="Drag a page icon to reorder pages. Choose a page to open its blocks."
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
                                `${page.slots.body.length} ${page.slots.body.length === 1 ? 'block' : 'blocks'}`,
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
            className={`${styles.drilldownLevel} ${styles.blocksLevel} ${depth === 'controls' ? styles.levelCollapsed : ''} ${depth === 'pages' ? styles.levelHidden : ''}`}
            aria-label="Blocks panel"
            aria-hidden={depth === 'pages'}
            inert={depth === 'pages'}
          >
            <div className={styles.levelHeading}>
              <Text fw={700} truncate>
                {activePage.title}
              </Text>
              <Group gap={4} wrap="nowrap">
                {depth === 'blocks' ? (
                  <AddMenu
                    label="Add block"
                    menuLabel="Choose a block type"
                    choices={acceptedBlockKinds(activePage.layoutId).map((kind) => ({
                      value: kind,
                      label: blockKindNames[kind],
                      icon: <BlockKindIcon kind={kind} />,
                    }))}
                    collapsed
                    onPick={addBlock}
                  />
                ) : null}
                <IconAction
                  label="About block ordering"
                  tooltip="Drag a block icon to reorder blocks. Choose a block to edit it."
                  icon={<CircleHelp size={15} aria-hidden />}
                  size="sm"
                  variant="subtle"
                />
              </Group>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onBlockDragEnd}>
              <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
                <div className={styles.levelList}>
                  {blocks.map((block) => (
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
                              aria-current={block.id === selectedBlock?.id ? 'true' : undefined}
                              aria-label={`${block.title}. ${blockKindNames[block.kind]}. Drag to reorder or click to select.`}
                              onClick={() => (depth === 'blocks' ? openBlock(block.id) : setSelectedBlockId(block.id))}
                              {...attributes}
                              {...listeners}
                            >
                              <BlockKindIcon kind={block.kind} />
                            </button>
                          </DrilldownTooltip>
                          <DrilldownLevelChoice
                            title={block.title}
                            metadata={blockKindNames[block.kind]}
                            active={block.id === selectedBlock?.id}
                            tabIndex={depth === 'blocks' ? 0 : -1}
                            onClick={() => openBlock(block.id)}
                          />
                        </>
                      )}
                    </SortableItem>
                  ))}
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
              {depth === 'controls' ? (
                <div className={styles.addSlot}>
                  <AddMenu
                    label="Add block"
                    menuLabel="Choose a block type"
                    choices={acceptedBlockKinds(activePage.layoutId).map((kind) => ({
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
              {selectedBlock ? <BlockKindIcon kind={selectedBlock.kind} size={20} /> : null}
              <Text fw={700}>{selectedBlock?.title ?? 'Select a block'}</Text>
            </div>
            <EditorControls block={selectedBlock} dispatch={dispatch} />
          </section>
        </Surface>
        <RulebookPagePreview
          page={activePage}
          blocks={blocks}
          pageNumber={pageNumber}
          selectedBlockId={selectedBlock?.id}
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
  const dispatch: RulebookEditorStateManager['dispatch'] = (action) => {
    const next = manager.dispatch(action);
    setResult(next);
    setSaveLabel('Save');
    return next;
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

  const hasLocalChanges =
    result.rebasedPatch.creates.length > 0 ||
    result.rebasedPatch.deletes.length > 0 ||
    result.rebasedPatch.sets.length > 0 ||
    result.rebasedPatch.placements.length > 0 ||
    result.rebasedPatch.restorations.length > 0;
  const save = () => {
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
              <Button size="xs" color="confirm" disabled={!result.canSave} onClick={save}>
                {saveLabel}
              </Button>
            </Group>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <section className={styles.editorRoot} aria-label="Rulebook editing workspace">
          <RulebookWorkspace result={result} dispatch={dispatch} fit={fit} />
        </section>
      </PageLayout.Content>
    </PageLayout>
  );
}
