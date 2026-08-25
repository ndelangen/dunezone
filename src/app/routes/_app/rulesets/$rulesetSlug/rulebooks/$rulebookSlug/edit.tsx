import { Accordion, Alert, Badge, Box, Button, Group, Stack, Text } from '@mantine/core';
import { parseFormattedText } from '@shared/formattedText';
import type { FormattedTextParseResult } from '@shared/formattedText';
import type { RulebookBlockDraft, RulebookContentsDraftV1, RulebookPageDraft } from '@shared/rulebooks/contents';
import { createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { AddAction } from '@ui/control/ListLengthActions';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { BookOpenText, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, FileImage, Minus, Plus } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import styles from './edit.module.css';
import { createRulebookEditorStateManager } from './edit/-rulebookEditorState';
import type { RulebookEditorResult, RulebookEditorStateManager } from './edit/-rulebookEditorState';
import { createCleanRulebookEditorInput } from './edit/-rulebookEditorState.fixtures';

type EditorMode = 'navigate' | 'edit';
type PreviewFit = 'height' | 'width';
type ReadyResult = Extract<RulebookEditorResult, { status: 'ready' }>;
type FormattedBlock = FormattedTextParseResult['blocks'][number];
type FormattedInline = Extract<FormattedBlock, { kind: 'paragraph' }>['children'][number];
const catalogueVariants = ['blocks', 'sections', 'recipes'] as const;
type CatalogueVariant = (typeof catalogueVariants)[number];

/* Three interaction models for the same authoring scenario, switchable through `?variant=`. */
export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit')({
  validateSearch: (search: Record<string, unknown>): { variant?: CatalogueVariant } => ({
    variant: catalogueVariants.includes(search.variant as CatalogueVariant)
      ? (search.variant as CatalogueVariant)
      : undefined,
  }),
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

function PreviewBlock({ block }: { block: RulebookBlockDraft }) {
  if (block.kind === 'text') {
    return (
      <div className={styles.previewBlock}>
        <FormattedTextPreview value={block.text} />
      </div>
    );
  }
  return (
    <ol className={styles.repeatedText}>
      {block.itemOrder.map((itemId) => (
        <li key={itemId}>
          <FormattedTextPreview value={block.itemsById[itemId]?.text ?? ''} />
        </li>
      ))}
    </ol>
  );
}

function PreviewSlot({
  blockIds,
  draft,
  label,
}: {
  blockIds: readonly string[];
  draft: RulebookContentsDraftV1;
  label?: string;
}) {
  return (
    <div className={styles.previewSlot} role={label ? 'group' : undefined} aria-label={label}>
      {blockIds.map((blockId) => {
        const block = draft.blocksById[blockId];
        return block ? <PreviewBlock key={blockId} block={block} /> : null;
      })}
    </div>
  );
}

function RulebookPagePreview({
  page,
  pageNumber,
  draft,
  fit,
}: {
  page: RulebookPageDraft;
  pageNumber: number;
  draft: RulebookContentsDraftV1;
  fit: PreviewFit;
}) {
  return (
    <Box component="figure" className={styles.previewFigure}>
      <div className={styles.previewViewport} data-fit={fit}>
        <article className={styles.pagePreview} aria-label={`Preview of Page ${pageNumber}`}>
          <div className={styles.pageFolio}>Page {pageNumber}</div>
          {page.layoutId === 'single-column' ? (
            <PreviewSlot blockIds={page.slots.body} draft={draft} />
          ) : (
            <div className={styles.previewColumns}>
              <PreviewSlot blockIds={page.slots.left} draft={draft} label="Left page column" />
              <PreviewSlot blockIds={page.slots.right} draft={draft} label="Right page column" />
            </div>
          )}
        </article>
      </div>
      <Text component="figcaption" size="xs" c="dimmed" ta="center">
        A4 preview. Content beyond the page edge is cropped.
      </Text>
    </Box>
  );
}

function createRepeatedTextItemId(): string {
  return `item-${globalThis.crypto.randomUUID()}`;
}

function PageTextEditors({
  page,
  result,
  dispatch,
}: {
  page: RulebookPageDraft;
  result: ReadyResult;
  dispatch: RulebookEditorStateManager['dispatch'];
}) {
  const blockIds = Object.values(page.slots).flat();
  const repeatedBlockIds = blockIds.filter((blockId) => result.draft.blocksById[blockId]?.kind === 'repeated-text');
  return (
    <Stack gap="lg">
      {blockIds.map((blockId) => {
        const block = result.draft.blocksById[blockId];
        if (!block) {
          return null;
        }
        if (block.kind === 'text') {
          const target = { kind: 'block' as const, blockId };
          return (
            <FormattedTextInput
              key={blockId}
              label="Text block"
              value={block.text}
              autosize
              minRows={6}
              onChange={(value) => dispatch({ kind: 'set', target, field: 'text', value })}
            />
          );
        }
        const repeatedBlockNumber = repeatedBlockIds.indexOf(blockId) + 1;
        const repeatedBlockLabel =
          repeatedBlockIds.length === 1 ? 'repeated text block' : `repeated text block ${repeatedBlockNumber}`;
        return (
          <Stack key={blockId} gap="sm">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text fw={700}>Repeated text block</Text>
              <AddAction
                label={`Add item to ${repeatedBlockLabel}`}
                onClick={() => {
                  const itemId = createRepeatedTextItemId();
                  dispatch({
                    kind: 'create',
                    entity: { kind: 'item', blockId, item: { id: itemId, text: '' } },
                    placement: {
                      container: { kind: 'item-order', blockId },
                      afterId: block.itemOrder.at(-1) ?? null,
                      beforeId: null,
                    },
                  });
                }}
              />
            </Group>
            {block.itemOrder.length === 0 ? (
              <Text size="sm" c="dimmed">
                This block has no items.
              </Text>
            ) : (
              block.itemOrder.map((itemId, index) => {
                const item = block.itemsById[itemId];
                if (!item) {
                  return null;
                }
                const target = { kind: 'item' as const, blockId, itemId };
                return (
                  <Group key={itemId} align="flex-start" wrap="nowrap">
                    <FormattedTextInput
                      label={`Item ${index + 1}`}
                      aria-label={`${repeatedBlockLabel}, item ${index + 1}`}
                      value={item.text}
                      autosize
                      minRows={4}
                      style={{ flex: 1 }}
                      onChange={(value) => dispatch({ kind: 'set', target, field: 'text', value })}
                    />
                    <ConfirmDeleteAction
                      label={`Remove item ${index + 1} from ${repeatedBlockLabel}`}
                      verb="remove"
                      pending={false}
                      size="sm"
                      icon={<Minus size={15} aria-hidden />}
                      onConfirm={() => dispatch({ kind: 'delete', root: target })}
                    />
                  </Group>
                );
              })
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

type RulebookWorkspaceProps = {
  page: RulebookPageDraft;
  pageId: string;
  pageNumber: number;
  result: ReadyResult;
  dispatch: RulebookEditorStateManager['dispatch'];
  mode: EditorMode;
  fit: PreviewFit;
  setMode: (mode: EditorMode) => void;
  selectPage: (pageId: string) => void;
};

function PageOutline({ result, pageId, selectPage }: Pick<RulebookWorkspaceProps, 'result' | 'pageId' | 'selectPage'>) {
  return (
    <Stack component="nav" aria-label="Rulebook pages" gap="xs">
      <Text size="xs" fw={700} tt="uppercase" c="dimmed" className={styles.sectionLabel}>
        Contents
      </Text>
      {result.draft.pageOrder.map((candidateId, index) => {
        const candidate = result.draft.pagesById[candidateId];
        return candidate ? (
          <Button
            key={candidateId}
            className={styles.pageChoice}
            variant={candidateId === pageId ? 'light' : 'subtle'}
            color="gray"
            justify="space-between"
            aria-current={candidateId === pageId ? 'page' : undefined}
            onClick={() => selectPage(candidateId)}
          >
            <span className={styles.pageChoiceNumber}>{String(index + 1).padStart(2, '0')}</span>
            <span className={styles.pageChoiceName}>Page {index + 1}</span>
            <Text component="span" size="xs" inherit opacity={0.62}>
              <span className={styles.pageChoiceAnchor}>{candidate.anchor}</span>
            </Text>
          </Button>
        ) : null;
      })}
    </Stack>
  );
}

function PreviewRail({ page, pageNumber, result, fit }: RulebookWorkspaceProps) {
  return (
    <section className={styles.previewRail} aria-label="Rulebook page preview">
      <RulebookPagePreview page={page} pageNumber={pageNumber} draft={result.draft} fit={fit} />
    </section>
  );
}

function RulebookWorkspace(props: RulebookWorkspaceProps) {
  return (
    <div className={styles.workspace} data-fit={props.fit}>
      <Surface className={styles.outlineRail} padding="none" as="section" aria-label="Rulebook controls">
        <div className={styles.outlineContent}>
          <Accordion
            value={props.mode}
            onChange={(value) => value && props.setMode(value as EditorMode)}
            className={styles.outlineAccordion}
          >
            <Accordion.Item value="navigate">
              <Accordion.Control>
                <Text fw={700}>Navigate</Text>
                <Text size="xs" c="dimmed">
                  Page {props.pageNumber} of {props.result.draft.pageOrder.length}
                </Text>
              </Accordion.Control>
              <Accordion.Panel>
                <PageOutline result={props.result} pageId={props.pageId} selectPage={props.selectPage} />
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="edit">
              <Accordion.Control>
                <Text fw={700}>Edit Page {props.pageNumber}</Text>
                <Text size="xs" c="dimmed">
                  Text and repeated text
                </Text>
              </Accordion.Control>
              <Accordion.Panel>
                <PageTextEditors page={props.page} result={props.result} dispatch={props.dispatch} />
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </div>
      </Surface>
      <PreviewRail {...props} />
    </div>
  );
}

function AssetImagePlaceholder({ label = 'Selected Asset image' }: { label?: string }) {
  return (
    <div className={styles.assetImagePlaceholder}>
      <FileImage aria-hidden />
      <span>{label}</span>
    </div>
  );
}

type PrototypeBlockKind = 'rule-group' | 'worked-example' | 'asset-figure';

type PrototypeBlock = {
  id: string;
  kind: PrototypeBlockKind;
  title: string;
  body: string;
};

type PrototypePage = {
  id: string;
  title: string;
  recipe: string;
  blocks: PrototypeBlock[];
};

const blockKindNames: Record<PrototypeBlockKind, string> = {
  'rule-group': 'Rule group',
  'worked-example': 'Worked example',
  'asset-figure': 'Asset figure',
};

function createPrototypePages(): PrototypePage[] {
  return [
    {
      id: 'welcome',
      title: 'Welcome to Arrakis',
      recipe: 'Chapter opener',
      blocks: [
        {
          id: 'welcome-hero',
          kind: 'asset-figure',
          title: 'Arrakis hero image',
          body: 'A selected Asset with a short caption.',
        },
      ],
    },
    {
      id: 'movement',
      title: 'Movement',
      recipe: 'Rules page',
      blocks: [
        {
          id: 'movement-rules',
          kind: 'rule-group',
          title: 'Movement sequence',
          body: 'Choose a force, choose an adjacent destination, then resolve the move.',
        },
        {
          id: 'movement-figure',
          kind: 'asset-figure',
          title: 'Storm marker',
          body: 'The storm closes the boundary between its two sectors.',
        },
      ],
    },
    {
      id: 'reference',
      title: 'Markers and tokens',
      recipe: 'Visual reference',
      blocks: [
        {
          id: 'reference-figures',
          kind: 'asset-figure',
          title: 'Marker reference',
          body: 'Six selected Assets with names and short explanations.',
        },
      ],
    },
  ];
}

function usePrototypeDocument() {
  const [pages, setPages] = useState(createPrototypePages);
  const [activePageId, setActivePageId] = useState('movement');
  const [selectedBlockId, setSelectedBlockId] = useState('movement-rules');
  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];
  const selectedBlock = activePage.blocks.find((block) => block.id === selectedBlockId) ?? activePage.blocks[0];

  const selectPage = (pageId: string) => {
    const page = pages.find((candidate) => candidate.id === pageId);
    if (!page) {
      return;
    }
    setActivePageId(pageId);
    setSelectedBlockId(page.blocks[0]?.id ?? '');
  };
  const addPage = () => {
    const number = pages.length + 1;
    const page: PrototypePage = {
      id: `new-page-${number}`,
      title: 'New rules page',
      recipe: 'Rules page',
      blocks: [
        {
          id: `new-page-${number}-rules`,
          kind: 'rule-group',
          title: 'Untitled rule group',
          body: 'Replace this starter content with the rule text.',
        },
      ],
    };
    setPages((current) => [...current, page]);
    setActivePageId(page.id);
    setSelectedBlockId(page.blocks[0].id);
  };
  const movePage = (pageId: string, offset: number) => {
    setPages((current) => {
      const index = current.findIndex((page) => page.id === pageId);
      const destination = index + offset;
      if (index < 0 || destination < 0 || destination >= current.length) {
        return current;
      }
      const next = [...current];
      const [page] = next.splice(index, 1);
      next.splice(destination, 0, page);
      return next;
    });
  };
  const addBlock = (kind: PrototypeBlockKind = 'worked-example') => {
    const block: PrototypeBlock = {
      id: `${activePage.id}-block-${activePage.blocks.length + 1}`,
      kind,
      title: kind === 'worked-example' ? 'New worked example' : blockKindNames[kind],
      body: 'Replace this dummy content with the finished text.',
    };
    setPages((current) =>
      current.map((page) => (page.id === activePage.id ? { ...page, blocks: [...page.blocks, block] } : page))
    );
    setSelectedBlockId(block.id);
  };
  const moveBlock = (blockId: string, offset: number) => {
    setPages((current) =>
      current.map((page) => {
        if (page.id !== activePage.id) {
          return page;
        }
        const index = page.blocks.findIndex((block) => block.id === blockId);
        const destination = index + offset;
        if (index < 0 || destination < 0 || destination >= page.blocks.length) {
          return page;
        }
        const blocks = [...page.blocks];
        const [block] = blocks.splice(index, 1);
        blocks.splice(destination, 0, block);
        return { ...page, blocks };
      })
    );
  };
  const updateSelectedBlock = (field: 'title' | 'body', value: string) => {
    if (!selectedBlock) {
      return;
    }
    setPages((current) =>
      current.map((page) =>
        page.id === activePage.id
          ? {
              ...page,
              blocks: page.blocks.map((block) =>
                block.id === selectedBlock.id ? { ...block, [field]: value } : block
              ),
            }
          : page
      )
    );
  };
  const reset = () => {
    setPages(createPrototypePages());
    setActivePageId('movement');
    setSelectedBlockId('movement-rules');
  };

  return {
    pages,
    activePage,
    selectedBlock,
    selectedBlockId,
    selectPage,
    setSelectedBlockId,
    addPage,
    movePage,
    addBlock,
    moveBlock,
    updateSelectedBlock,
    reset,
  };
}

type PrototypeDocument = ReturnType<typeof usePrototypeDocument>;

function ScenarioBrief() {
  return (
    <Surface className={styles.scenarioBrief} padding="md" as="section" aria-label="Shared comparison scenario">
      <div>
        <Text size="xs" fw={700} tt="uppercase" className={styles.sectionLabel}>
          Same scenario in every prototype
        </Text>
        <Text size="sm">A starter rulebook already contains three pages and dummy content.</Text>
      </div>
      <Group gap="xs" className={styles.scenarioTasks}>
        <Badge color="gray" variant="light">
          Add a page
        </Badge>
        <Badge color="gray" variant="light">
          Reorder pages
        </Badge>
        <Badge color="gray" variant="light">
          Add a block
        </Badge>
        <Badge color="gray" variant="light">
          Reorder blocks
        </Badge>
        <Badge color="gray" variant="light">
          Edit content
        </Badge>
      </Group>
    </Surface>
  );
}

function MoveActions({
  label,
  index,
  count,
  move,
}: {
  label: string;
  index: number;
  count: number;
  move: (offset: number) => void;
}) {
  return (
    <span className={styles.moveActions}>
      <button disabled={index === 0} aria-label={`Move ${label} up`} onClick={() => move(-1)}>
        <ChevronUp size={14} aria-hidden />
      </button>
      <button disabled={index === count - 1} aria-label={`Move ${label} down`} onClick={() => move(1)}>
        <ChevronDown size={14} aria-hidden />
      </button>
    </span>
  );
}

function PageList({ model }: { model: PrototypeDocument }) {
  return (
    <div className={styles.studyList}>
      {model.pages.map((page, index) => (
        <div className={styles.studyListRow} data-selected={page.id === model.activePage.id} key={page.id}>
          <button className={styles.studyListChoice} onClick={() => model.selectPage(page.id)}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <span>
              <strong>{page.title}</strong>
              <small>{page.recipe}</small>
            </span>
          </button>
          <MoveActions
            label={`page ${page.title}`}
            index={index}
            count={model.pages.length}
            move={(offset) => model.movePage(page.id, offset)}
          />
        </div>
      ))}
      <Button variant="light" leftSection={<Plus size={16} />} onClick={model.addPage}>
        Add rules page
      </Button>
    </div>
  );
}

function BlockList({ model, inline = false }: { model: PrototypeDocument; inline?: boolean }) {
  return (
    <div className={styles.studyList} data-inline={inline}>
      {model.activePage.blocks.map((block, index) => (
        <div className={styles.blockStudyRow} data-selected={block.id === model.selectedBlockId} key={block.id}>
          <button className={styles.blockStudyChoice} onClick={() => model.setSelectedBlockId(block.id)}>
            <span>{blockKindNames[block.kind]}</span>
            <strong>{block.title}</strong>
            <small>{block.body}</small>
          </button>
          <MoveActions
            label={`block ${block.title}`}
            index={index}
            count={model.activePage.blocks.length}
            move={(offset) => model.moveBlock(block.id, offset)}
          />
        </div>
      ))}
      <Button variant="light" leftSection={<Plus size={16} />} onClick={() => model.addBlock()}>
        Add worked example
      </Button>
    </div>
  );
}

function BlockEditor({ model }: { model: PrototypeDocument }) {
  if (!model.selectedBlock) {
    return <Text size="sm">Select or add a block to edit it.</Text>;
  }
  return (
    <div className={styles.blockEditor}>
      <Badge variant="light">{blockKindNames[model.selectedBlock.kind]}</Badge>
      <label>
        <span>Title</span>
        <input
          value={model.selectedBlock.title}
          onChange={(event) => model.updateSelectedBlock('title', event.currentTarget.value)}
        />
      </label>
      <label>
        <span>Content</span>
        <textarea
          value={model.selectedBlock.body}
          onChange={(event) => model.updateSelectedBlock('body', event.currentTarget.value)}
        />
      </label>
    </div>
  );
}

function SharedDocumentPreview({ model }: { model: PrototypeDocument }) {
  const pageNumber = model.pages.findIndex((page) => page.id === model.activePage.id) + 1;
  return (
    <section className={styles.cataloguePreview} aria-label="Shared rulebook page preview">
      <article className={styles.documentPage}>
        <div className={styles.documentFolio}>
          {model.activePage.recipe} / {String(pageNumber).padStart(2, '0')}
        </div>
        <h2>{model.activePage.title}</h2>
        <div className={styles.sharedPreviewBlocks}>
          {model.activePage.blocks.map((block) =>
            block.kind === 'asset-figure' ? (
              <section className={styles.previewAssetBlock} key={block.id}>
                <AssetImagePlaceholder label={block.title} />
                <p>{block.body}</p>
              </section>
            ) : block.kind === 'worked-example' ? (
              <aside className={styles.documentCallout} key={block.id}>
                <strong>{block.title}</strong>
                <span>{block.body}</span>
              </aside>
            ) : (
              <section className={styles.recipeRuleGroup} key={block.id}>
                <span>{blockKindNames[block.kind]}</span>
                <h3>{block.title}</h3>
                <p>{block.body}</p>
              </section>
            )
          )}
        </div>
      </article>
    </section>
  );
}

function PrototypeHeading({
  label,
  title,
  description,
  reset,
}: {
  label: string;
  title: string;
  description: string;
  reset: () => void;
}) {
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap" className={styles.prototypeHeading}>
      <div>
        <Group gap="xs">
          <Badge variant="light">{label}</Badge>
          <Text fw={700} size="lg">
            {title}
          </Text>
        </Group>
        <Text size="sm" c="dimmed" mt={4}>
          {description}
        </Text>
      </div>
      <Button size="xs" variant="subtle" onClick={reset}>
        Reset
      </Button>
    </Group>
  );
}

function ComposableBlocksVariant() {
  const model = usePrototypeDocument();
  return (
    <Stack gap="md">
      <ScenarioBrief />
      <Surface padding="lg" as="section">
        <PrototypeHeading
          label="1"
          title="Three-pane workspace"
          description="Pages, block structure, and the selected block stay visible together."
          reset={model.reset}
        />
        <div className={styles.threePaneWorkspace}>
          <section>
            <Text fw={700} size="sm" mb="xs">
              Pages
            </Text>
            <PageList model={model} />
          </section>
          <section>
            <Text fw={700} size="sm" mb="xs">
              Blocks on {model.activePage.title}
            </Text>
            <BlockList model={model} />
          </section>
          <section className={styles.inspectorPane}>
            <Text fw={700} size="sm" mb="xs">
              Selected block
            </Text>
            <BlockEditor model={model} />
          </section>
        </div>
      </Surface>
      <SharedDocumentPreview model={model} />
    </Stack>
  );
}

function SemanticSectionsVariant() {
  const model = usePrototypeDocument();
  return (
    <Stack gap="md">
      <ScenarioBrief />
      <Surface padding="lg" as="section">
        <PrototypeHeading
          label="2"
          title="Document-first canvas"
          description="Pages sit above the document. Blocks are selected and reordered where they appear."
          reset={model.reset}
        />
        <div className={styles.pageStrip}>
          <PageList model={model} />
        </div>
        <div className={styles.documentFirstWorkspace}>
          <section>
            <Group justify="space-between" mb="xs">
              <Text fw={700} size="sm">
                Page contents
              </Text>
              <Badge color="gray" variant="outline">
                {model.activePage.recipe}
              </Badge>
            </Group>
            <BlockList model={model} inline />
          </section>
          <section className={styles.documentFirstSide}>
            <Surface padding="md" as="section">
              <Text fw={700} size="sm" mb="xs">
                Edit selected block
              </Text>
              <BlockEditor model={model} />
            </Surface>
            <SharedDocumentPreview model={model} />
          </section>
        </div>
      </Surface>
    </Stack>
  );
}

function PageRecipesVariant() {
  const model = usePrototypeDocument();
  const [step, setStep] = useState<'pages' | 'blocks' | 'content'>('blocks');
  return (
    <Stack gap="md">
      <ScenarioBrief />
      <Surface padding="lg" as="section">
        <PrototypeHeading
          label="3"
          title="Focused steps"
          description="Work on pages, block order, or content in a dedicated step. The preview remains beside the task."
          reset={model.reset}
        />
        <div className={styles.stepTabs} role="tablist" aria-label="Authoring step">
          {(['pages', 'blocks', 'content'] as const).map((candidate, index) => (
            <button aria-selected={step === candidate} onClick={() => setStep(candidate)} role="tab" key={candidate}>
              <span>{index + 1}</span>
              {candidate === 'pages' ? 'Pages' : candidate === 'blocks' ? 'Blocks' : 'Content'}
            </button>
          ))}
        </div>
        <div className={styles.focusedWorkspace}>
          <section className={styles.focusedTask}>
            {step === 'pages' ? (
              <>
                <Text fw={700} mb="xs">
                  Choose, add, or reorder a page
                </Text>
                <PageList model={model} />
              </>
            ) : step === 'blocks' ? (
              <>
                <Text fw={700} mb="xs">
                  Arrange blocks on {model.activePage.title}
                </Text>
                <BlockList model={model} />
              </>
            ) : (
              <>
                <Text fw={700} mb="xs">
                  Edit the selected block
                </Text>
                <BlockEditor model={model} />
              </>
            )}
          </section>
          <SharedDocumentPreview model={model} />
        </div>
      </Surface>
    </Stack>
  );
}

const variantLabels: Record<CatalogueVariant, string> = {
  blocks: '1  Three-pane workspace',
  sections: '2  Document-first canvas',
  recipes: '3  Focused steps',
};

function PrototypeSwitcher({
  variant,
  select,
}: {
  variant: CatalogueVariant;
  select: (variant: CatalogueVariant) => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) {
        return;
      }
      const currentIndex = catalogueVariants.indexOf(variant);
      const offset = event.key === 'ArrowLeft' ? -1 : 1;
      const nextIndex = (currentIndex + offset + catalogueVariants.length) % catalogueVariants.length;
      event.preventDefault();
      select(catalogueVariants[nextIndex]);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [select, variant]);

  if (import.meta.env.PROD) {
    return null;
  }
  const currentIndex = catalogueVariants.indexOf(variant);
  return (
    <div className={styles.prototypeSwitcher} role="group" aria-label="Authoring interaction prototype">
      <button
        aria-label="Previous interaction prototype"
        onClick={() =>
          select(catalogueVariants[(currentIndex - 1 + catalogueVariants.length) % catalogueVariants.length])
        }
      >
        <ChevronLeft size={18} aria-hidden />
      </button>
      <span>{variantLabels[variant]}</span>
      <button
        aria-label="Next interaction prototype"
        onClick={() => select(catalogueVariants[(currentIndex + 1) % catalogueVariants.length])}
      >
        <ChevronRight size={18} aria-hidden />
      </button>
    </div>
  );
}

function CataloguePrototypePage({ variant }: { variant: CatalogueVariant }) {
  const { rulesetSlug, rulebookSlug } = Route.useParams();
  const navigate = Route.useNavigate();
  const select = (next: CatalogueVariant) => {
    void navigate({ search: { variant: next }, replace: true });
  };
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Group gap="sm" wrap="nowrap">
          <BookOpenText size={24} aria-hidden />
          <div>
            <PageTitle title="Rulebook authoring comparison" />
            <Text size="xs" c="dimmed">
              {rulesetSlug} / {rulebookSlug}
            </Text>
          </div>
        </Group>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Group gap="xs">
              <Badge variant="light" color="yellow">
                Throwaway prototype
              </Badge>
              <Text size="xs" c="dimmed">
                The starting document, available actions, data, and preview are identical in all three prototypes.
              </Text>
            </Group>
          </Toolbar.Left>
          <Toolbar.Right>
            <Text size="xs" c="dimmed">
              Use the bottom arrows or the left and right keys.
            </Text>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <section className={styles.cataloguePrototype} aria-label="Rulebook authoring interaction comparison">
          {variant === 'blocks' ? (
            <ComposableBlocksVariant />
          ) : variant === 'sections' ? (
            <SemanticSectionsVariant />
          ) : (
            <PageRecipesVariant />
          )}
        </section>
        <PrototypeSwitcher variant={variant} select={select} />
      </PageLayout.Content>
    </PageLayout>
  );
}

function RulebookEditorPage() {
  const { variant } = Route.useSearch();
  return variant ? <CataloguePrototypePage variant={variant} /> : <FixtureRulebookEditorPage />;
}

function FixtureRulebookEditorPage() {
  const { rulesetSlug, rulebookSlug } = Route.useParams();
  const [manager] = useState(() => createRulebookEditorStateManager(createCleanRulebookEditorInput()));
  const [result, setResult] = useState<RulebookEditorResult>(() => manager.result);
  const [activePageId, setActivePageId] = useState(() =>
    manager.result.status === 'ready' ? manager.result.draft.pageOrder[0] : undefined
  );
  const [mode, setMode] = useState<EditorMode>('navigate');
  const [fit, setFit] = useState<PreviewFit>('height');
  if (result.status !== 'ready') {
    return (
      <PageLayout>
        <PageLayout.Header size="compact">
          <PageTitle title="Rulebook editor unavailable" />
        </PageLayout.Header>
        <PageLayout.Content>
          <Alert color="red" role="alert" title="This starter session could not open">
            {result.message}
          </Alert>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  const pageId = activePageId ?? result.draft.pageOrder[0];
  const page = pageId ? result.draft.pagesById[pageId] : undefined;
  const pageNumber = pageId ? result.draft.pageOrder.indexOf(pageId) + 1 : 0;
  const hasLocalChanges =
    result.rebasedPatch.creates.length > 0 ||
    result.rebasedPatch.deletes.length > 0 ||
    result.rebasedPatch.sets.length > 0 ||
    result.rebasedPatch.placements.length > 0 ||
    result.rebasedPatch.restorations.length > 0;
  const dispatch: RulebookEditorStateManager['dispatch'] = (action) => {
    const next = manager.dispatch(action);
    setResult(next);
    return next;
  };

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Group gap="sm" wrap="nowrap">
          <BookOpenText size={24} aria-hidden />
          <div>
            <PageTitle title="Rulebook workspace" />
            <Text size="xs" c="dimmed">
              {rulesetSlug} / {rulebookSlug}
            </Text>
          </div>
        </Group>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Group gap="xs" wrap="nowrap">
              <Badge variant="light" color={hasLocalChanges ? 'yellow' : 'gray'}>
                {hasLocalChanges ? 'Local changes' : 'Starter state'}
              </Badge>
              <Text className={styles.desktopStatus} size="xs" c="dimmed">
                Browser-only starter state. Nothing is loaded from or saved to the database.
              </Text>
              <Text className={styles.mobileStatus} size="xs" c="dimmed">
                Local only.
              </Text>
            </Group>
          </Toolbar.Left>
          <Toolbar.Right>
            <Button
              size="xs"
              variant="default"
              aria-label={`Switch preview to fit ${fit === 'height' ? 'width' : 'height'}`}
              onClick={() => setFit((current) => (current === 'height' ? 'width' : 'height'))}
            >
              Fit {fit === 'height' ? 'width' : 'height'}
            </Button>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        {page ? (
          <section className={styles.prototypeRoot} aria-label="Rulebook editing workspace">
            <div className={styles.workspaceSticky} data-fit={fit} data-mode={mode}>
              <Box
                className={styles.workspaceViewport}
                role="region"
                aria-label="Rulebook editor and preview"
                tabIndex={0}
              >
                <RulebookWorkspace
                  page={page}
                  pageId={pageId}
                  pageNumber={pageNumber}
                  result={result}
                  dispatch={dispatch}
                  mode={mode}
                  fit={fit}
                  setMode={setMode}
                  selectPage={(candidateId) => {
                    setActivePageId(candidateId);
                    setMode('edit');
                  }}
                />
              </Box>
            </div>
            <div className={styles.stickyRunway} aria-hidden="true" />
          </section>
        ) : (
          <Alert color="yellow" role="status" title="No page selected">
            The local starter session has no Page to edit.
          </Alert>
        )}
      </PageLayout.Content>
    </PageLayout>
  );
}
