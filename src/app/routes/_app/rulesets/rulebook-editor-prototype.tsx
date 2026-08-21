import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Group,
  Paper,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { PageLayout } from '@ui/layout/PageLayout';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  CopyPlus,
  FilePlus2,
  Image,
  List,
  Plus,
  Save,
  Send,
  Trash2,
  Type,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import styles from './RulebookEditorPrototype.module.css';

type Variant = 'canvas' | 'outline' | 'studio';
type Role = 'member' | 'owner';
type BlockKind = 'asset' | 'heading' | 'list' | 'text';
type LayoutId = 'hero' | 'reference' | 'split';

type RulebookBlock = {
  id: string;
  kind: BlockKind;
  title: string;
  text: string;
  items: Array<{ id: string; text: string }>;
  assetId?: string;
};

type RulebookPage = {
  id: string;
  title: string;
  layoutId: LayoutId;
  slots: Record<string, string[]>;
};

type RulebookDocument = {
  id: string;
  title: string;
  pages: RulebookPage[];
  blocks: Record<string, RulebookBlock>;
};

type SlotDefinition = {
  id: string;
  label: string;
  accepts: BlockKind[];
  maxBlocks: number;
};

type LayoutDefinition = {
  id: LayoutId;
  label: string;
  description: string;
  capacity: number;
  slots: SlotDefinition[];
};

const variants: Array<{ value: Variant; key: string; label: string }> = [
  { value: 'studio', key: 'A', label: 'Studio' },
  { value: 'canvas', key: 'B', label: 'Page focus' },
  { value: 'outline', key: 'C', label: 'Document outline' },
];

const layouts: Record<LayoutId, LayoutDefinition> = {
  hero: {
    id: 'hero',
    label: 'Hero opening',
    description: 'A strong heading above one broad story region.',
    capacity: 850,
    slots: [
      { id: 'banner', label: 'Banner', accepts: ['heading'], maxBlocks: 1 },
      { id: 'body', label: 'Story', accepts: ['text', 'list', 'asset'], maxBlocks: 4 },
    ],
  },
  split: {
    id: 'split',
    label: 'Rules with sidebar',
    description: 'Lead text and rules beside a narrow reference slot.',
    capacity: 1050,
    slots: [
      { id: 'lead', label: 'Lead', accepts: ['heading', 'text'], maxBlocks: 2 },
      { id: 'body', label: 'Main rules', accepts: ['text', 'list'], maxBlocks: 5 },
      { id: 'side', label: 'Reference', accepts: ['asset', 'list', 'text'], maxBlocks: 2 },
    ],
  },
  reference: {
    id: 'reference',
    label: 'Two-column reference',
    description: 'A compact title above two equally weighted columns.',
    capacity: 1200,
    slots: [
      { id: 'title', label: 'Title', accepts: ['heading'], maxBlocks: 1 },
      { id: 'left', label: 'Left column', accepts: ['text', 'list', 'asset'], maxBlocks: 4 },
      { id: 'right', label: 'Right column', accepts: ['text', 'list', 'asset'], maxBlocks: 4 },
    ],
  },
};

const assetOptions = [
  { value: 'storm', label: 'Storm marker', src: '/page/storm.svg' },
  { value: 'map', label: 'Arrakis map', src: '/page/map.svg' },
  { value: 'table', label: 'Turn table', src: '/page/table.svg' },
  { value: 'cover', label: 'Ruleset cover', src: '/page/cover-c.svg' },
];

const initialDocument: RulebookDocument = {
  id: 'rulebook-field-manual',
  title: 'Desert War Field Manual',
  pages: [
    {
      id: 'page-opening',
      title: 'Welcome to Arrakis',
      layoutId: 'hero',
      slots: {
        banner: ['block-opening-heading'],
        body: ['block-opening-copy', 'block-opening-asset'],
      },
    },
    {
      id: 'page-storm',
      title: 'Storm phase',
      layoutId: 'split',
      slots: {
        lead: ['block-storm-heading'],
        body: ['block-storm-copy', 'block-storm-list'],
        side: ['block-storm-asset'],
      },
    },
  ],
  blocks: {
    'block-opening-heading': {
      id: 'block-opening-heading',
      kind: 'heading',
      title: 'Desert War',
      text: '',
      items: [],
    },
    'block-opening-copy': {
      id: 'block-opening-copy',
      kind: 'text',
      title: 'Opening note',
      text: 'Control the spice, read the storm, and remember that every alliance has a price.',
      items: [],
    },
    'block-opening-asset': {
      id: 'block-opening-asset',
      kind: 'asset',
      title: 'Ruleset cover',
      text: '',
      items: [],
      assetId: 'cover',
    },
    'block-storm-heading': {
      id: 'block-storm-heading',
      kind: 'heading',
      title: 'Storm phase',
      text: '',
      items: [],
    },
    'block-storm-copy': {
      id: 'block-storm-copy',
      kind: 'text',
      title: 'Movement',
      text: 'Reveal the storm card, then move the marker counter-clockwise by the shown amount.',
      items: [],
    },
    'block-storm-list': {
      id: 'block-storm-list',
      kind: 'list',
      title: 'Resolve the storm',
      text: '',
      items: [
        { id: 'item-exposed-forces', text: 'Remove exposed forces in sectors crossed by the storm.' },
        { id: 'item-protected-forces', text: 'Leave forces inside strongholds untouched.' },
      ],
    },
    'block-storm-asset': {
      id: 'block-storm-asset',
      kind: 'asset',
      title: 'Storm marker',
      text: '',
      items: [],
      assetId: 'storm',
    },
  },
};

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function newBlock(kind: BlockKind): RulebookBlock {
  const id = createId(`block-${kind}`);
  return {
    id,
    kind,
    title: kind === 'heading' ? 'New heading' : kind === 'list' ? 'New list' : kind === 'asset' ? 'Asset' : 'Text',
    text: kind === 'text' ? 'Write the rule here.' : '',
    items: kind === 'list' ? [{ id: createId('item'), text: 'First item' }] : [],
    assetId: kind === 'asset' ? 'map' : undefined,
  };
}

function blockWeight(block: RulebookBlock): number {
  if (block.kind === 'heading') {
    return 80 + block.title.length * 2;
  }
  if (block.kind === 'asset') {
    return 260;
  }
  if (block.kind === 'list') {
    return 80 + block.items.reduce((total, item) => total + item.text.length + 28, 0);
  }
  return 70 + block.title.length + block.text.length;
}

function pageBlockIds(page: RulebookPage): string[] {
  return Object.values(page.slots).flat();
}

function pageLoad(page: RulebookPage, document: RulebookDocument): number {
  return pageBlockIds(page).reduce((total, blockId) => total + blockWeight(document.blocks[blockId]!), 0);
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) {
    next.splice(to, 0, item);
  }
  return next;
}

export const Route = createFileRoute('/_app/rulesets/rulebook-editor-prototype')({
  validateSearch: (search: Record<string, unknown>): { variant: Variant } => ({
    variant: variants.some((entry) => entry.value === search.variant) ? (search.variant as Variant) : 'studio',
  }),
  component: RulebookEditorPrototypePage,
});

function BlockPreview({ block }: { block: RulebookBlock }) {
  if (block.kind === 'heading') {
    return <h2>{block.title || 'Untitled heading'}</h2>;
  }
  if (block.kind === 'asset') {
    const asset = assetOptions.find((option) => option.value === block.assetId) ?? assetOptions[0]!;
    return (
      <figure className={styles.assetBlock}>
        <img src={asset.src} alt="" />
        <figcaption>{block.title || asset.label}</figcaption>
      </figure>
    );
  }
  if (block.kind === 'list') {
    return (
      <section>
        <h3>{block.title || 'List'}</h3>
        <ul>
          {block.items.map((item) => (
            <li key={item.id}>{item.text || 'Empty item'}</li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section>
      <h3>{block.title || 'Text'}</h3>
      {block.text.split('\n\n').map((paragraph, index) => (
        <p key={`${block.id}-paragraph-${index}`}>{paragraph}</p>
      ))}
    </section>
  );
}

function FixedPage({
  document,
  page,
  selectedBlockId,
  selectedSlotId,
  onSelectBlock,
  onSelectSlot,
}: {
  document: RulebookDocument;
  page: RulebookPage;
  selectedBlockId?: string;
  selectedSlotId: string;
  onSelectBlock: (blockId: string, slotId: string) => void;
  onSelectSlot: (slotId: string) => void;
}) {
  const definition = layouts[page.layoutId];
  const load = pageLoad(page, document);
  const overflowing = load > definition.capacity;
  return (
    <div className={styles.pageFrame}>
      <article className={styles.fixedPage} data-layout={page.layoutId} data-overflow={overflowing || undefined}>
        <div className={styles.pageIdentity}>
          <span>{document.title}</span>
          <span>{page.id}</span>
        </div>
        <div className={styles.pageSlots}>
          {definition.slots.map((slot) => {
            const blockIds = page.slots[slot.id] ?? [];
            return (
              <section
                className={styles.pageSlot}
                data-slot={slot.id}
                data-selected={selectedSlotId === slot.id || undefined}
                key={slot.id}
              >
                <button className={styles.slotLabel} type="button" onClick={() => onSelectSlot(slot.id)}>
                  {slot.label}
                </button>
                {blockIds.length === 0 ? (
                  <button className={styles.emptySlot} type="button" onClick={() => onSelectSlot(slot.id)}>
                    Add {slot.accepts.join(', ')}
                  </button>
                ) : (
                  blockIds.map((blockId) => (
                    <button
                      className={styles.previewBlock}
                      data-selected={selectedBlockId === blockId || undefined}
                      type="button"
                      key={blockId}
                      onClick={() => onSelectBlock(blockId, slot.id)}
                    >
                      <BlockPreview block={document.blocks[blockId]!} />
                    </button>
                  ))
                )}
              </section>
            );
          })}
        </div>
        <div className={styles.pageNumber}>Page {document.pages.findIndex((entry) => entry.id === page.id) + 1}</div>
        {overflowing ? <div className={styles.overflowCurtain}>Content beyond this line is not on the page</div> : null}
      </article>
    </div>
  );
}

function PageStatus({
  document,
  page,
  onStress,
}: {
  document: RulebookDocument;
  page: RulebookPage;
  onStress: () => void;
}) {
  const definition = layouts[page.layoutId];
  const load = pageLoad(page, document);
  const percent = Math.round((load / definition.capacity) * 100);
  const overflowing = percent > 100;
  return (
    <Paper withBorder p="sm" radius="md" className={styles.pageStatus}>
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" fw={700}>
            Page containment
          </Text>
          <Badge color={overflowing ? 'red' : percent > 82 ? 'yellow' : 'confirm'}>{percent}%</Badge>
        </Group>
        <Progress value={Math.min(percent, 100)} color={overflowing ? 'red' : percent > 82 ? 'yellow' : 'confirm'} />
        <Text size="xs" c="dimmed">
          {overflowing
            ? 'This page stays fixed. Shorten, remove, or move a block before saving.'
            : 'Everything fits on the fixed page.'}
        </Text>
        <Button size="compact-xs" variant="subtle" color="gray" onClick={onStress}>
          Test the page limit
        </Button>
      </Stack>
    </Paper>
  );
}

function PageCard({
  document,
  page,
  index,
  selected,
  onSelect,
  onMove,
  onRemove,
}: {
  document: RulebookDocument;
  page: RulebookPage;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const definition = layouts[page.layoutId];
  const load = pageLoad(page, document);
  return (
    <Paper className={styles.pageCard} data-selected={selected || undefined} withBorder p="xs" radius="md">
      <button type="button" className={styles.pageCardMain} onClick={onSelect}>
        <span className={styles.pageCardNumber}>{String(index + 1).padStart(2, '0')}</span>
        <span>
          <strong>{page.title}</strong>
          <small>{definition.label}</small>
        </span>
        {load > definition.capacity ? <Badge color="red">Over</Badge> : null}
      </button>
      <Group gap={2} justify="flex-end">
        <ActionIcon aria-label={`Move ${page.title} earlier`} size="sm" variant="subtle" onClick={() => onMove(-1)}>
          <ArrowUp size={14} />
        </ActionIcon>
        <ActionIcon aria-label={`Move ${page.title} later`} size="sm" variant="subtle" onClick={() => onMove(1)}>
          <ArrowDown size={14} />
        </ActionIcon>
        <ActionIcon aria-label={`Remove ${page.title}`} size="sm" color="red" variant="subtle" onClick={onRemove}>
          <Trash2 size={14} />
        </ActionIcon>
      </Group>
    </Paper>
  );
}

function PageRail({
  document,
  selectedPageId,
  onSelect,
  onAdd,
  onMove,
  onRemove,
}: {
  document: RulebookDocument;
  selectedPageId: string;
  onSelect: (pageId: string) => void;
  onAdd: () => void;
  onMove: (pageId: string, direction: -1 | 1) => void;
  onRemove: (pageId: string) => void;
}) {
  return (
    <Paper withBorder p="sm" radius="md" className={styles.pageRail}>
      <Group justify="space-between">
        <Text fw={700}>Pages</Text>
        <ActionIcon aria-label="Add page" variant="light" onClick={onAdd}>
          <FilePlus2 size={17} />
        </ActionIcon>
      </Group>
      <Stack gap="xs">
        {document.pages.map((page, index) => (
          <PageCard
            key={page.id}
            document={document}
            page={page}
            index={index}
            selected={selectedPageId === page.id}
            onSelect={() => onSelect(page.id)}
            onMove={(direction) => onMove(page.id, direction)}
            onRemove={() => onRemove(page.id)}
          />
        ))}
      </Stack>
    </Paper>
  );
}

function Filmstrip({
  document,
  selectedPageId,
  onSelect,
  onAdd,
}: {
  document: RulebookDocument;
  selectedPageId: string;
  onSelect: (pageId: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className={styles.filmstrip}>
      {document.pages.map((page, index) => (
        <button
          type="button"
          className={styles.filmstripPage}
          data-selected={page.id === selectedPageId || undefined}
          key={page.id}
          onClick={() => onSelect(page.id)}
        >
          <span>{String(index + 1).padStart(2, '0')}</span>
          <strong>{page.title}</strong>
          <small>{layouts[page.layoutId].label}</small>
        </button>
      ))}
      <button type="button" className={styles.filmstripAdd} onClick={onAdd}>
        <Plus size={18} /> Add page
      </button>
    </div>
  );
}

function Inspector({
  document,
  page,
  selectedSlotId,
  selectedBlockId,
  onDocumentChange,
  onLayoutChange,
  onPageTitleChange,
  onSelectSlot,
  onAddBlock,
  onRemoveBlock,
}: {
  document: RulebookDocument;
  page: RulebookPage;
  selectedSlotId: string;
  selectedBlockId?: string;
  onDocumentChange: (updater: (next: RulebookDocument) => void) => void;
  onLayoutChange: (layoutId: LayoutId) => void;
  onPageTitleChange: (title: string) => void;
  onSelectSlot: (slotId: string) => void;
  onAddBlock: (kind: BlockKind) => void;
  onRemoveBlock: (blockId: string) => void;
}) {
  const definition = layouts[page.layoutId];
  const selectedSlot = definition.slots.find((slot) => slot.id === selectedSlotId) ?? definition.slots[0]!;
  const selectedBlock = selectedBlockId ? document.blocks[selectedBlockId] : undefined;
  const [newKind, setNewKind] = useState<BlockKind>(selectedSlot.accepts[0]!);
  const slotBlockIds = page.slots[selectedSlot.id] ?? [];
  const slotFull = slotBlockIds.length >= selectedSlot.maxBlocks;

  useEffect(() => {
    if (!selectedSlot.accepts.includes(newKind)) {
      setNewKind(selectedSlot.accepts[0]!);
    }
  }, [newKind, selectedSlot]);

  const updateBlock = (updater: (block: RulebookBlock) => void) => {
    if (!selectedBlock) {
      return;
    }
    onDocumentChange((next) => updater(next.blocks[selectedBlock.id]!));
  };

  return (
    <Paper withBorder p="md" radius="md" className={styles.inspector}>
      <Stack gap="md">
        <div>
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Page settings
          </Text>
          <Title order={3}>{page.title}</Title>
        </div>
        <TextInput
          label="Page title"
          value={page.title}
          onChange={(event) => onPageTitleChange(event.currentTarget.value)}
        />
        <Select
          label="Layout"
          value={page.layoutId}
          data={Object.values(layouts).map((layout) => ({ value: layout.id, label: layout.label }))}
          allowDeselect={false}
          onChange={(value) => value && onLayoutChange(value as LayoutId)}
        />
        <Text size="xs" c="dimmed">
          {definition.description}
        </Text>
        <Divider />
        <Select
          label="Slot"
          value={selectedSlot.id}
          data={definition.slots.map((slot) => ({
            value: slot.id,
            label: `${slot.label} · ${slot.accepts.join(', ')}`,
          }))}
          allowDeselect={false}
          onChange={(value) => value && onSelectSlot(value)}
        />
        <Group align="end" grow>
          <Select
            label="Add block"
            value={newKind}
            data={selectedSlot.accepts.map((kind) => ({ value: kind, label: kind }))}
            allowDeselect={false}
            onChange={(value) => value && setNewKind(value as BlockKind)}
          />
          <Button
            leftSection={<Plus size={16} />}
            variant="light"
            disabled={slotFull}
            onClick={() => onAddBlock(newKind)}
          >
            Add
          </Button>
        </Group>
        {slotFull ? (
          <Alert color="yellow" title="This slot is full">
            Remove or move a block before adding another one.
          </Alert>
        ) : null}

        {selectedBlock ? (
          <Stack gap="md">
            <Divider label={`Selected ${selectedBlock.kind} block`} labelPosition="left" />
            <Text size="xs" c="dimmed">
              Stable ID: <Code>{selectedBlock.id}</Code>
            </Text>
            <TextInput
              label={selectedBlock.kind === 'heading' ? 'Heading' : 'Block label'}
              value={selectedBlock.title}
              onChange={(event) => {
                const value = event.currentTarget.value;
                updateBlock((block) => void (block.title = value));
              }}
            />
            {selectedBlock.kind === 'text' ? (
              <Textarea
                label="Text"
                description="Supports the accepted small formatted-text language."
                autosize
                minRows={5}
                value={selectedBlock.text}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  updateBlock((block) => void (block.text = value));
                }}
              />
            ) : null}
            {selectedBlock.kind === 'asset' ? (
              <Select
                label="Referenced asset"
                value={selectedBlock.assetId}
                data={assetOptions}
                allowDeselect={false}
                onChange={(value) => updateBlock((block) => void (block.assetId = value ?? undefined))}
              />
            ) : null}
            {selectedBlock.kind === 'list' ? (
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" fw={700}>
                    Ordered items
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="light"
                    leftSection={<Plus size={14} />}
                    onClick={() =>
                      updateBlock((block) => block.items.push({ id: createId('item'), text: 'New list item' }))
                    }
                  >
                    Add item
                  </Button>
                </Group>
                {selectedBlock.items.map((item, index) => (
                  <Paper withBorder p="xs" radius="sm" className={styles.listItemEditor} key={item.id}>
                    <Group align="flex-end" wrap="nowrap">
                      <TextInput
                        className={styles.grow}
                        label={`Item ${index + 1}`}
                        value={item.text}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          updateBlock((block) => void (block.items[index]!.text = value));
                        }}
                      />
                      <ActionIcon
                        aria-label={`Move item ${index + 1} up`}
                        variant="subtle"
                        disabled={index === 0}
                        onClick={() =>
                          updateBlock((block) => void (block.items = moveItem(block.items, index, index - 1)))
                        }
                      >
                        <ChevronUp size={16} />
                      </ActionIcon>
                      <ActionIcon
                        aria-label={`Move item ${index + 1} down`}
                        variant="subtle"
                        disabled={index === selectedBlock.items.length - 1}
                        onClick={() =>
                          updateBlock((block) => void (block.items = moveItem(block.items, index, index + 1)))
                        }
                      >
                        <ChevronDown size={16} />
                      </ActionIcon>
                      <ActionIcon
                        aria-label={`Remove item ${index + 1}`}
                        color="red"
                        variant="subtle"
                        onClick={() => updateBlock((block) => void block.items.splice(index, 1))}
                      >
                        <Trash2 size={16} />
                      </ActionIcon>
                    </Group>
                    <Text size="xs" c="dimmed" mt={4}>
                      {item.id}
                    </Text>
                  </Paper>
                ))}
              </Stack>
            ) : null}
            <Button
              color="red"
              variant="light"
              leftSection={<Trash2 size={16} />}
              onClick={() => onRemoveBlock(selectedBlock.id)}
            >
              Remove block
            </Button>
          </Stack>
        ) : (
          <Alert color="gray" title="Choose a block">
            Select content on the page or add a block to the {selectedSlot.label.toLowerCase()} slot.
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}

function OutlinePanel({
  document,
  selectedPageId,
  selectedBlockId,
  onSelectPage,
  onSelectBlock,
  onAddPage,
}: {
  document: RulebookDocument;
  selectedPageId: string;
  selectedBlockId?: string;
  onSelectPage: (pageId: string) => void;
  onSelectBlock: (pageId: string, blockId: string, slotId: string) => void;
  onAddPage: () => void;
}) {
  const blockIcon = (kind: BlockKind) => {
    if (kind === 'heading') {
      return <Type size={14} />;
    }
    if (kind === 'list') {
      return <List size={14} />;
    }
    if (kind === 'asset') {
      return <Image size={14} />;
    }
    return <BookOpen size={14} />;
  };
  return (
    <Paper withBorder p="md" radius="md" className={styles.outlinePanel}>
      <Group justify="space-between" mb="sm">
        <Text size="xs" c="dimmed">
          Choose a page or block. Stable IDs keep selections intact.
        </Text>
        <ActionIcon aria-label="Add page" variant="light" onClick={onAddPage}>
          <FilePlus2 size={17} />
        </ActionIcon>
      </Group>
      <Stack gap="xs">
        {document.pages.map((page, pageIndex) => (
          <div className={styles.outlinePage} data-selected={page.id === selectedPageId || undefined} key={page.id}>
            <button type="button" onClick={() => onSelectPage(page.id)}>
              <strong>
                {pageIndex + 1}. {page.title}
              </strong>
              <small>{page.id}</small>
            </button>
            {Object.entries(page.slots).map(([slotId, blockIds]) => (
              <div className={styles.outlineSlot} key={slotId}>
                <span>{layouts[page.layoutId].slots.find((slot) => slot.id === slotId)?.label ?? slotId}</span>
                {blockIds.map((blockId) => {
                  const block = document.blocks[blockId]!;
                  return (
                    <button
                      type="button"
                      data-selected={blockId === selectedBlockId || undefined}
                      key={blockId}
                      onClick={() => onSelectBlock(page.id, blockId, slotId)}
                    >
                      {blockIcon(block.kind)}
                      <span>{block.title || block.kind}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </Stack>
    </Paper>
  );
}

function StateSummary({
  document,
  dirty,
  savedRevision,
  publishedRevision,
  role,
}: {
  document: RulebookDocument;
  dirty: boolean;
  savedRevision: number;
  publishedRevision: number;
  role: Role;
}) {
  return (
    <Accordion variant="contained">
      <Accordion.Item value="state">
        <Accordion.Control>Prototype state</Accordion.Control>
        <Accordion.Panel>
          <Code block className={styles.stateCode}>
            {JSON.stringify(
              {
                documentId: document.id,
                role,
                dirty,
                savedRevision,
                publishedRevision,
                pages: document.pages.map((page) => ({
                  id: page.id,
                  layout: page.layoutId,
                  slots: page.slots,
                })),
              },
              null,
              2
            )}
          </Code>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

type VariantProps = {
  document: RulebookDocument;
  page: RulebookPage;
  selectedPageId: string;
  selectedSlotId: string;
  selectedBlockId?: string;
  dirty: boolean;
  savedRevision: number;
  publishedRevision: number;
  role: Role;
  previewFit: 'height' | 'width';
  onSelectPage: (pageId: string) => void;
  onSelectBlock: (blockId: string, slotId: string) => void;
  onSelectBlockFromPage: (pageId: string, blockId: string, slotId: string) => void;
  onSelectSlot: (slotId: string) => void;
  onAddPage: () => void;
  onMovePage: (pageId: string, direction: -1 | 1) => void;
  onRemovePage: (pageId: string) => void;
  onStress: () => void;
  inspector: React.ReactNode;
};

function StudioVariant(props: VariantProps) {
  return (
    <div className={styles.studioVariant}>
      <PageRail
        document={props.document}
        selectedPageId={props.selectedPageId}
        onSelect={props.onSelectPage}
        onAdd={props.onAddPage}
        onMove={props.onMovePage}
        onRemove={props.onRemovePage}
      />
      <Stack gap="sm" className={styles.canvasColumn}>
        <PageStatus document={props.document} page={props.page} onStress={props.onStress} />
        <FixedPage
          document={props.document}
          page={props.page}
          selectedBlockId={props.selectedBlockId}
          selectedSlotId={props.selectedSlotId}
          onSelectBlock={props.onSelectBlock}
          onSelectSlot={props.onSelectSlot}
        />
      </Stack>
      {props.inspector}
    </div>
  );
}

function CanvasVariant(props: VariantProps) {
  return (
    <Stack gap="md" className={styles.canvasVariant}>
      <Filmstrip
        document={props.document}
        selectedPageId={props.selectedPageId}
        onSelect={props.onSelectPage}
        onAdd={props.onAddPage}
      />
      <div className={styles.focusWorkspace}>
        <Stack gap="sm">
          <PageStatus document={props.document} page={props.page} onStress={props.onStress} />
          <FixedPage
            document={props.document}
            page={props.page}
            selectedBlockId={props.selectedBlockId}
            selectedSlotId={props.selectedSlotId}
            onSelectBlock={props.onSelectBlock}
            onSelectSlot={props.onSelectSlot}
          />
        </Stack>
        <div className={styles.focusEditor}>{props.inspector}</div>
      </div>
      <StateSummary
        document={props.document}
        dirty={props.dirty}
        savedRevision={props.savedRevision}
        publishedRevision={props.publishedRevision}
        role={props.role}
      />
    </Stack>
  );
}

function OutlineVariant(props: VariantProps) {
  const [activePanel, setActivePanel] = useState<string | null>('navigate');
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockGeometry, setDockGeometry] = useState<{ left: number; width: number }>();

  useEffect(() => {
    let frame = 0;
    const updateDock = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const dock = dockRef.current;
        if (!dock) {
          return;
        }
        const bounds = dock.getBoundingClientRect();
        const railHeight =
          props.previewFit === 'height' ? Math.min(640, window.innerHeight - 64) : window.innerHeight - 32;
        const shouldDock = bounds.top <= 16 && bounds.bottom >= railHeight + 16;
        setDockGeometry(shouldDock ? { left: bounds.left, width: bounds.width } : undefined);
      });
    };
    updateDock();
    window.addEventListener('resize', updateDock);
    window.addEventListener('scroll', updateDock, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateDock);
      window.removeEventListener('scroll', updateDock);
    };
  }, [props.previewFit]);

  const editPage = (pageId: string) => {
    props.onSelectPage(pageId);
    setActivePanel('edit');
  };

  const editBlock = (pageId: string, blockId: string, slotId: string) => {
    props.onSelectBlockFromPage(pageId, blockId, slotId);
    setActivePanel('edit');
  };

  const editPreviewBlock = (blockId: string, slotId: string) => {
    props.onSelectBlock(blockId, slotId);
    setActivePanel('edit');
  };

  const editSlot = (slotId: string) => {
    props.onSelectSlot(slotId);
    setActivePanel('edit');
  };

  return (
    <div className={styles.outlineDock} data-fit={props.previewFit} ref={dockRef}>
      <div
        className={styles.outlineVariant}
        data-fit={props.previewFit}
        data-docked={dockGeometry ? true : undefined}
        style={dockGeometry ? { left: dockGeometry.left, width: dockGeometry.width } : undefined}
      >
        <Stack gap="md" className={styles.outlineControls} data-fit={props.previewFit}>
          <Accordion
            className={styles.outlineAccordion}
            value={activePanel}
            onChange={setActivePanel}
            variant="separated"
          >
            <Accordion.Item value="navigate">
              <Accordion.Control>Navigate</Accordion.Control>
              <Accordion.Panel>
                <OutlinePanel
                  document={props.document}
                  selectedPageId={props.selectedPageId}
                  selectedBlockId={props.selectedBlockId}
                  onSelectPage={editPage}
                  onSelectBlock={editBlock}
                  onAddPage={() => {
                    props.onAddPage();
                    setActivePanel('edit');
                  }}
                />
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="edit">
              <Accordion.Control>Edit {props.page.title}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="md">
                  {props.inspector}
                  <PageStatus document={props.document} page={props.page} onStress={props.onStress} />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
          <StateSummary
            document={props.document}
            dirty={props.dirty}
            savedRevision={props.savedRevision}
            publishedRevision={props.publishedRevision}
            role={props.role}
          />
        </Stack>
        <div className={styles.outlinePreview} data-fit={props.previewFit}>
          <FixedPage
            document={props.document}
            page={props.page}
            selectedBlockId={props.selectedBlockId}
            selectedSlotId={props.selectedSlotId}
            onSelectBlock={editPreviewBlock}
            onSelectSlot={editSlot}
          />
        </div>
      </div>
    </div>
  );
}

function PrototypeSwitcher({ variant }: { variant: Variant }) {
  const navigate = useNavigate();
  const index = variants.findIndex((entry) => entry.value === variant);
  const move = (direction: -1 | 1) => {
    const next = variants[(index + direction + variants.length) % variants.length]!;
    void navigate({ to: '.', search: { variant: next.value }, replace: true });
  };
  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        move(-1);
      }
      if (event.key === 'ArrowRight') {
        move(1);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
  if (import.meta.env.PROD) {
    return null;
  }
  return (
    <div className={styles.switcher}>
      <ActionIcon aria-label="Previous prototype variant" variant="subtle" color="gray" onClick={() => move(-1)}>
        <ArrowLeft size={18} />
      </ActionIcon>
      <Text size="sm" fw={700}>
        {variants[index]!.key} · {variants[index]!.label}
      </Text>
      <ActionIcon aria-label="Next prototype variant" variant="subtle" color="gray" onClick={() => move(1)}>
        <ArrowRight size={18} />
      </ActionIcon>
    </div>
  );
}

function RulebookEditorPrototypePage() {
  const { variant } = Route.useSearch();
  const [document, setDocument] = useState<RulebookDocument>(() => structuredClone(initialDocument));
  const [selectedPageId, setSelectedPageId] = useState(initialDocument.pages[0]!.id);
  const [selectedSlotId, setSelectedSlotId] = useState('banner');
  const [selectedBlockId, setSelectedBlockId] = useState<string | undefined>('block-opening-heading');
  const [dirty, setDirty] = useState(false);
  const [savedRevision, setSavedRevision] = useState(1);
  const [publishedRevision, setPublishedRevision] = useState(1);
  const [role, setRole] = useState<Role>('owner');
  const [previewFit, setPreviewFit] = useState<'height' | 'width'>('height');
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState('Select a page, slot, or block to start editing.');

  const page = document.pages.find((entry) => entry.id === selectedPageId) ?? document.pages[0]!;
  const definition = layouts[page.layoutId];
  const currentSlot = definition.slots.find((slot) => slot.id === selectedSlotId) ?? definition.slots[0]!;

  const changeDocument = (updater: (next: RulebookDocument) => void) => {
    setDocument((current) => {
      const next = structuredClone(current);
      updater(next);
      return next;
    });
    setDirty(true);
  };

  const selectPage = (pageId: string) => {
    const nextPage = document.pages.find((entry) => entry.id === pageId);
    if (!nextPage) {
      return;
    }
    const firstSlot = layouts[nextPage.layoutId].slots[0]!;
    setSelectedPageId(pageId);
    setSelectedSlotId(firstSlot.id);
    setSelectedBlockId(nextPage.slots[firstSlot.id]?.[0]);
    setNotice(`Editing ${nextPage.title}.`);
  };

  const selectBlock = (blockId: string, slotId: string) => {
    setSelectedSlotId(slotId);
    setSelectedBlockId(blockId);
    setNotice(`Selected ${document.blocks[blockId]?.title || 'block'}.`);
  };

  const selectBlockFromPage = (pageId: string, blockId: string, slotId: string) => {
    setSelectedPageId(pageId);
    selectBlock(blockId, slotId);
  };

  const selectSlot = (slotId: string) => {
    setSelectedSlotId(slotId);
    setSelectedBlockId(page.slots[slotId]?.[0]);
    setNotice(`Selected the ${layouts[page.layoutId].slots.find((slot) => slot.id === slotId)?.label ?? slotId} slot.`);
  };

  const addPage = () => {
    const heading = newBlock('heading');
    const pageId = createId('page');
    const nextPage: RulebookPage = {
      id: pageId,
      title: 'New page',
      layoutId: 'split',
      slots: { lead: [heading.id], body: [], side: [] },
    };
    changeDocument((next) => {
      next.blocks[heading.id] = heading;
      next.pages.push(nextPage);
    });
    setSelectedPageId(pageId);
    setSelectedSlotId('lead');
    setSelectedBlockId(heading.id);
    setNotice('Added a page with a stable identity.');
  };

  const movePage = (pageId: string, direction: -1 | 1) => {
    const index = document.pages.findIndex((entry) => entry.id === pageId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= document.pages.length) {
      return;
    }
    changeDocument((next) => void (next.pages = moveItem(next.pages, index, target)));
    setNotice('Page order changed. Page identities stayed the same.');
  };

  const removePage = (pageId: string) => {
    if (document.pages.length === 1) {
      setNotice('A Rulebook must keep at least one page.');
      return;
    }
    const index = document.pages.findIndex((entry) => entry.id === pageId);
    const fallback = document.pages[index === 0 ? 1 : index - 1]!;
    changeDocument((next) => {
      const removed = next.pages.find((entry) => entry.id === pageId);
      if (removed) {
        pageBlockIds(removed).forEach((blockId) => delete next.blocks[blockId]);
      }
      next.pages = next.pages.filter((entry) => entry.id !== pageId);
    });
    selectPage(fallback.id);
    setNotice('Removed the page and its contained blocks.');
  };

  const changeLayout = (layoutId: LayoutId) => {
    const nextDefinition = layouts[layoutId];
    const blockIds = pageBlockIds(page);
    const nextSlots = Object.fromEntries(nextDefinition.slots.map((slot) => [slot.id, [] as string[]]));
    blockIds.forEach((blockId) => {
      const block = document.blocks[blockId]!;
      const target = nextDefinition.slots.find(
        (slot) => slot.accepts.includes(block.kind) && nextSlots[slot.id]!.length < slot.maxBlocks
      );
      if (target) {
        nextSlots[target.id]!.push(blockId);
      }
    });
    changeDocument((next) => {
      const targetPage = next.pages.find((entry) => entry.id === page.id)!;
      targetPage.layoutId = layoutId;
      targetPage.slots = nextSlots;
    });
    const firstSlot = nextDefinition.slots[0]!;
    setSelectedSlotId(firstSlot.id);
    setSelectedBlockId(nextSlots[firstSlot.id]?.[0]);
    setNotice(`Changed to ${nextDefinition.label}. Compatible blocks moved into its typed slots.`);
  };

  const addBlock = (kind: BlockKind) => {
    const block = newBlock(kind);
    changeDocument((next) => {
      next.blocks[block.id] = block;
      next.pages.find((entry) => entry.id === page.id)!.slots[currentSlot.id]!.push(block.id);
    });
    setSelectedBlockId(block.id);
    setNotice(`Added a ${kind} block to ${currentSlot.label}.`);
  };

  const removeBlock = (blockId: string) => {
    changeDocument((next) => {
      delete next.blocks[blockId];
      const targetPage = next.pages.find((entry) => entry.id === page.id)!;
      Object.values(targetPage.slots).forEach((ids) => {
        const index = ids.indexOf(blockId);
        if (index >= 0) {
          ids.splice(index, 1);
        }
      });
    });
    setSelectedBlockId(undefined);
    setNotice('Removed the selected block.');
  };

  const stressPage = () => {
    const existingTextId = pageBlockIds(page).find((blockId) => document.blocks[blockId]?.kind === 'text');
    if (existingTextId) {
      changeDocument((next) => {
        next.blocks[existingTextId]!.text +=
          `\n\n${'This deliberately long paragraph tests fixed-page containment. '.repeat(16)}`;
      });
      setSelectedBlockId(existingTextId);
    } else {
      const targetSlot = definition.slots.find((slot) => slot.accepts.includes('text'))!;
      const block = newBlock('text');
      block.text = 'This deliberately long paragraph tests fixed-page containment. '.repeat(18);
      changeDocument((next) => {
        next.blocks[block.id] = block;
        next.pages.find((entry) => entry.id === page.id)!.slots[targetSlot.id]!.push(block.id);
      });
      setSelectedSlotId(targetSlot.id);
      setSelectedBlockId(block.id);
    }
    setNotice('Added enough text to exercise overflow recovery.');
  };

  const overflowingPageCount = document.pages.filter(
    (entry) => pageLoad(entry, document) > layouts[entry.layoutId].capacity
  ).length;
  const saveDisabled = !dirty || publishing || overflowingPageCount > 0;
  const unpublishedChanges = savedRevision > publishedRevision;
  const publishDisabled = role !== 'owner' || dirty || publishing || !unpublishedChanges;
  const publishReason =
    role !== 'owner'
      ? 'Ask the Ruleset owner to publish.'
      : dirty
        ? 'Save your changes before publishing.'
        : publishing
          ? 'Publication is still running.'
          : !unpublishedChanges
            ? 'There are no saved changes to publish.'
            : 'Publish the current saved revision.';

  const inspector = (
    <Inspector
      document={document}
      page={page}
      selectedSlotId={selectedSlotId}
      selectedBlockId={selectedBlockId}
      onDocumentChange={changeDocument}
      onLayoutChange={changeLayout}
      onPageTitleChange={(title) =>
        changeDocument((next) => void (next.pages.find((entry) => entry.id === page.id)!.title = title))
      }
      onSelectSlot={selectSlot}
      onAddBlock={addBlock}
      onRemoveBlock={removeBlock}
    />
  );

  const variantProps: VariantProps = {
    document,
    page,
    selectedPageId,
    selectedSlotId,
    selectedBlockId,
    dirty,
    savedRevision,
    publishedRevision,
    role,
    previewFit,
    onSelectPage: selectPage,
    onSelectBlock: selectBlock,
    onSelectBlockFromPage: selectBlockFromPage,
    onSelectSlot: selectSlot,
    onAddPage: addPage,
    onMovePage: movePage,
    onRemovePage: removePage,
    onStress: stressPage,
    inspector,
  };

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Group gap="sm">
          <BookOpen size={28} />
          <div>
            <h1>Rulebook editor prototype</h1>
            <Text size="sm">Fixed pages, typed slots, structured blocks, and browser-memory state.</Text>
          </div>
        </Group>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Group gap="xs">
              <SegmentedControl
                aria-label="Prototype capability"
                value={role}
                data={[
                  { value: 'owner', label: 'Owner' },
                  { value: 'member', label: 'Member' },
                ]}
                onChange={(value) => setRole(value as Role)}
              />
              <Badge color={dirty ? 'yellow' : 'confirm'}>{dirty ? 'Local changes' : `Saved r${savedRevision}`}</Badge>
              <Badge color={publishedRevision === savedRevision ? 'gray' : 'blue'}>
                Published r{publishedRevision}
              </Badge>
            </Group>
          </Toolbar.Left>
          <Toolbar.Right>
            <Group gap="xs">
              {variant === 'outline' ? (
                <Tooltip label={`Switch preview to fill ${previewFit === 'height' ? 'width' : 'height'}.`}>
                  <Button
                    aria-label={`Preview fills ${previewFit}`}
                    aria-pressed={previewFit === 'width'}
                    variant="light"
                    onClick={() => setPreviewFit((current) => (current === 'height' ? 'width' : 'height'))}
                  >
                    Fill {previewFit}
                  </Button>
                </Tooltip>
              ) : null}
              <Tooltip
                label={
                  overflowingPageCount > 0
                    ? `Resolve the overflow on ${overflowingPageCount === 1 ? 'the page' : `${overflowingPageCount} pages`} before saving.`
                    : dirty
                      ? 'Save the current browser changes.'
                      : 'There are no local changes to save.'
                }
              >
                <span>
                  <Button
                    leftSection={<Save size={16} />}
                    variant="light"
                    disabled={saveDisabled}
                    onClick={() => {
                      setSavedRevision((revision) => revision + 1);
                      setDirty(false);
                      setNotice('Saved the current browser changes as a shared draft revision.');
                    }}
                  >
                    Save
                  </Button>
                </span>
              </Tooltip>
              <Tooltip label={publishReason}>
                <span>
                  <Button
                    color="confirm"
                    leftSection={publishing ? <Send size={16} /> : <Check size={16} />}
                    disabled={publishDisabled}
                    loading={publishing}
                    onClick={() => {
                      setPublishing(true);
                      setNotice('Publishing the saved revision. The previous publication remains current.');
                      window.setTimeout(() => {
                        setPublishedRevision(savedRevision);
                        setPublishing(false);
                        setNotice('Publication finished. Web preview and PDF now point at this revision.');
                      }, 1200);
                    }}
                  >
                    Publish
                  </Button>
                </span>
              </Tooltip>
            </Group>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="md" className={styles.prototypeRoot}>
          <Alert color="gray" icon={<CopyPlus size={17} />}>
            {notice}
          </Alert>
          <Box className={styles.workspace} data-variant={variant}>
            {variant === 'studio' ? <StudioVariant {...variantProps} /> : null}
            {variant === 'canvas' ? <CanvasVariant {...variantProps} /> : null}
            {variant === 'outline' ? <OutlineVariant {...variantProps} /> : null}
          </Box>
          {variant === 'studio' ? (
            <StateSummary
              document={document}
              dirty={dirty}
              savedRevision={savedRevision}
              publishedRevision={publishedRevision}
              role={role}
            />
          ) : null}
        </Stack>
        <PrototypeSwitcher variant={variant} />
      </PageLayout.Content>
    </PageLayout>
  );
}
