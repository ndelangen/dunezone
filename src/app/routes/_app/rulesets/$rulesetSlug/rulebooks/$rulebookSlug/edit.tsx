import { Accordion, Alert, Badge, Box, Button, Group, SimpleGrid, Stack, Text } from '@mantine/core';
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
import {
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  FileImage,
  Heading,
  List,
  MessageSquareQuote,
  Minus,
  PanelTop,
  Rows3,
  ScrollText,
  Type,
} from 'lucide-react';
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

/* Three catalogue models on the existing editor route, switchable through `?variant=`. */
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

type CatalogueBlockCardProps = {
  icon: ReactNode;
  name: string;
  description: string;
  detail?: string;
};

function CatalogueBlockCard({ icon, name, description, detail }: CatalogueBlockCardProps) {
  return (
    <div className={styles.catalogueBlockCard}>
      <div className={styles.catalogueBlockIcon}>{icon}</div>
      <div>
        <Text fw={700} size="sm">
          {name}
        </Text>
        <Text size="xs" c="dimmed">
          {description}
        </Text>
        {detail ? (
          <Text size="xs" className={styles.catalogueBlockDetail}>
            {detail}
          </Text>
        ) : null}
      </div>
    </div>
  );
}

function MockField({ label, value, rows = 1 }: { label: string; value: string; rows?: number }) {
  return (
    <div className={styles.mockField}>
      <Text component="span" size="xs" fw={700}>
        {label}
      </Text>
      <div className={styles.mockFieldValue} data-rows={rows}>
        {value}
      </div>
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

function ComposableBlocksVariant() {
  return (
    <div className={styles.catalogueWorkspace} data-variant="blocks">
      <Surface className={styles.catalogueControls} padding="lg" as="section" aria-label="Composable block catalogue">
        <Stack gap="lg">
          <div>
            <Badge variant="light">A</Badge>
            <Text fw={700} size="lg" mt="xs">
              Composable blocks
            </Text>
            <Text size="sm" c="dimmed">
              Choose a layout, then stack generic blocks in any compatible slot.
            </Text>
          </div>
          <div>
            <Text size="xs" fw={700} tt="uppercase" className={styles.sectionLabel}>
              Available blocks
            </Text>
            <Stack gap="xs" mt="xs">
              <CatalogueBlockCard icon={<Heading size={18} />} name="Heading" description="Level and formatted text" />
              <CatalogueBlockCard icon={<Type size={18} />} name="Formatted text" description="Paragraphs and lists" />
              <CatalogueBlockCard icon={<List size={18} />} name="Rule list" description="Ordered titled entries" />
              <CatalogueBlockCard
                icon={<FileImage size={18} />}
                name="Asset image"
                description="One referenced Asset"
              />
              <CatalogueBlockCard
                icon={<MessageSquareQuote size={18} />}
                name="Callout"
                description="Short emphasized text"
              />
            </Stack>
          </div>
        </Stack>
      </Surface>
      <Surface className={styles.catalogueComposition} padding="lg" as="section" aria-label="Page block composition">
        <Stack gap="md">
          <Group justify="space-between">
            <div>
              <Text fw={700}>Page 3</Text>
              <Text size="xs" c="dimmed">
                Two columns
              </Text>
            </div>
            <Badge color="gray" variant="outline">
              6 blocks
            </Badge>
          </Group>
          <div className={styles.compositionSlot}>
            <Text size="xs" fw={700} c="dimmed">
              LEFT SLOT
            </Text>
            <CatalogueBlockCard icon={<Heading size={18} />} name="Heading" description="Movement" detail="H2" />
            <CatalogueBlockCard icon={<Type size={18} />} name="Formatted text" description="Three paragraphs" />
            <CatalogueBlockCard icon={<List size={18} />} name="Rule list" description="Four items" />
          </div>
          <div className={styles.compositionSlot}>
            <Text size="xs" fw={700} c="dimmed">
              RIGHT SLOT
            </Text>
            <CatalogueBlockCard icon={<FileImage size={18} />} name="Asset image" description="Storm marker" />
            <CatalogueBlockCard icon={<MessageSquareQuote size={18} />} name="Callout" description="Remember" />
          </div>
        </Stack>
      </Surface>
      <section className={styles.cataloguePreview} aria-label="Composable blocks page preview">
        <article className={styles.documentPage} data-document="blocks">
          <div className={styles.documentFolio}>Dune rules / 03</div>
          <h2>Movement</h2>
          <div className={styles.documentColumns}>
            <div>
              <p>Move each force into an adjacent territory. A storm sector blocks movement across its boundary.</p>
              <ol className={styles.documentRuleList}>
                <li>
                  <strong>Choose a force.</strong> It must be able to move.
                </li>
                <li>
                  <strong>Choose a destination.</strong> Apply terrain limits.
                </li>
                <li>
                  <strong>Commit the move.</strong> Resolve any conflict.
                </li>
              </ol>
            </div>
            <div>
              <AssetImagePlaceholder label="Storm marker Asset" />
              <aside className={styles.documentCallout}>
                <strong>Remember</strong>
                <span>The storm changes which territories count as adjacent.</span>
              </aside>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}

function SemanticSectionsVariant() {
  return (
    <div className={styles.catalogueWorkspace} data-variant="sections">
      <Surface className={styles.catalogueControls} padding="lg" as="section" aria-label="Semantic section catalogue">
        <Stack gap="lg">
          <div>
            <Badge variant="light">B</Badge>
            <Text fw={700} size="lg" mt="xs">
              Semantic sections
            </Text>
            <Text size="sm" c="dimmed">
              Add sections that describe their editorial purpose. Each one owns a small set of fields.
            </Text>
          </div>
          <div className={styles.sectionSequence}>
            <div className={styles.sectionSequenceItem} data-active="true">
              <span>01</span>
              <div>
                <Text fw={700} size="sm">
                  Rule group
                </Text>
                <Text size="xs" c="dimmed">
                  Heading, introduction, ordered rules
                </Text>
              </div>
            </div>
            <div className={styles.sectionSequenceItem}>
              <span>02</span>
              <div>
                <Text fw={700} size="sm">
                  Worked example
                </Text>
                <Text size="xs" c="dimmed">
                  Situation, steps, outcome
                </Text>
              </div>
            </div>
            <div className={styles.sectionSequenceItem}>
              <span>03</span>
              <div>
                <Text fw={700} size="sm">
                  Asset figure
                </Text>
                <Text size="xs" c="dimmed">
                  Asset reference and caption
                </Text>
              </div>
            </div>
          </div>
          <Stack gap="sm">
            <MockField label="Section heading" value="Movement" />
            <MockField label="Introduction" value="A force may move once during the movement step." rows={2} />
            <MockField label="Rules" value="3 ordered rules" />
          </Stack>
        </Stack>
      </Surface>
      <section className={styles.cataloguePreview} aria-label="Semantic sections page preview">
        <article className={styles.documentPage} data-document="sections">
          <div className={styles.documentFolio}>Movement / 03</div>
          <header className={styles.semanticHeader}>
            <span>Core sequence</span>
            <h2>Movement</h2>
            <p>A force may move once during the movement step.</p>
          </header>
          <section className={styles.ruleGroup}>
            <div className={styles.ruleNumber}>1</div>
            <div>
              <h3>Choose a force</h3>
              <p>Select a force that has not moved this round.</p>
            </div>
            <div className={styles.ruleNumber}>2</div>
            <div>
              <h3>Choose a destination</h3>
              <p>Follow adjacency, terrain, and storm restrictions.</p>
            </div>
            <div className={styles.ruleNumber}>3</div>
            <div>
              <h3>Resolve the move</h3>
              <p>Place the force and resolve any conflict in the destination.</p>
            </div>
          </section>
          <section className={styles.workedExample}>
            <div>
              <span>Worked example</span>
              <p>A force in Hagga Basin moves toward the Shield Wall while the storm crosses sector four.</p>
            </div>
            <AssetImagePlaceholder label="Board position Asset" />
          </section>
        </article>
      </section>
    </div>
  );
}

type RecipeId = 'chapter' | 'rules' | 'reference';

const recipeNames: Record<RecipeId, string> = {
  chapter: 'Chapter opener',
  rules: 'Rules page',
  reference: 'Visual reference',
};

function PageRecipesVariant() {
  const [recipe, setRecipe] = useState<RecipeId>('rules');
  return (
    <div className={styles.catalogueWorkspace} data-variant="recipes">
      <Surface className={styles.recipeChooser} padding="lg" as="section" aria-label="Page recipe catalogue">
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Group gap="xs">
              <Badge variant="light">C</Badge>
              <Text fw={700} size="lg">
                Page recipes
              </Text>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>
              Pick an opinionated page type. The application supplies its regions and presentation.
            </Text>
          </div>
          <Badge color="gray" variant="outline">
            {recipeNames[recipe]}
          </Badge>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <button
            className={styles.recipeChoice}
            data-selected={recipe === 'chapter'}
            onClick={() => setRecipe('chapter')}
          >
            <PanelTop size={20} aria-hidden />
            <span>Chapter opener</span>
            <small>Title, summary, hero Asset</small>
          </button>
          <button className={styles.recipeChoice} data-selected={recipe === 'rules'} onClick={() => setRecipe('rules')}>
            <ScrollText size={20} aria-hidden />
            <span>Rules page</span>
            <small>Rule groups and examples</small>
          </button>
          <button
            className={styles.recipeChoice}
            data-selected={recipe === 'reference'}
            onClick={() => setRecipe('reference')}
          >
            <Rows3 size={20} aria-hidden />
            <span>Visual reference</span>
            <small>Asset grid and short labels</small>
          </button>
        </SimpleGrid>
      </Surface>
      <Surface
        className={styles.catalogueControls}
        padding="lg"
        as="section"
        aria-label={`${recipeNames[recipe]} fields`}
      >
        <Stack gap="md">
          <Text fw={700}>{recipeNames[recipe]} fields</Text>
          {recipe === 'chapter' ? (
            <>
              <MockField label="Chapter number" value="03" />
              <MockField label="Title" value="Movement" />
              <MockField label="Summary" value="How forces cross the board and meet the storm." rows={2} />
              <CatalogueBlockCard
                icon={<FileImage size={18} />}
                name="Hero Asset"
                description="Choose one published Asset"
              />
            </>
          ) : recipe === 'rules' ? (
            <>
              <MockField label="Page heading" value="Movement" />
              <MockField label="Rule groups" value="Movement sequence, storm restrictions" />
              <MockField label="Examples" value="1 worked example" />
              <MockField label="Footer note" value="Optional" />
            </>
          ) : (
            <>
              <MockField label="Page heading" value="Markers and tokens" />
              <MockField label="Asset entries" value="6 selected Assets" />
              <MockField label="Entry text" value="Name and one formatted sentence" rows={2} />
            </>
          )}
        </Stack>
      </Surface>
      <section className={styles.cataloguePreview} aria-label={`${recipeNames[recipe]} preview`}>
        <article className={styles.documentPage} data-document="recipes" data-recipe={recipe}>
          {recipe === 'chapter' ? (
            <>
              <div className={styles.chapterNumber}>03</div>
              <AssetImagePlaceholder label="Hero Asset" />
              <div className={styles.chapterTitle}>
                <span>Chapter three</span>
                <h2>Movement</h2>
                <p>How forces cross the board and meet the storm.</p>
              </div>
            </>
          ) : recipe === 'rules' ? (
            <>
              <div className={styles.documentFolio}>Chapter 3 / 03</div>
              <h2>Movement</h2>
              <div className={styles.recipeRuleGroup}>
                <span>Movement sequence</span>
                <h3>Move one force at a time</h3>
                <p>Choose a force, choose an adjacent destination, then resolve the move before choosing another.</p>
              </div>
              <div className={styles.recipeRuleGroup}>
                <span>Storm restrictions</span>
                <h3>The storm closes its boundary</h3>
                <p>No force may cross the storm boundary unless another rule says it can.</p>
              </div>
              <aside className={styles.documentCallout}>
                <strong>Example</strong>
                <span>
                  A force may leave sector three before the storm enters it, but cannot cross into sector four
                  afterward.
                </span>
              </aside>
            </>
          ) : (
            <>
              <div className={styles.documentFolio}>Reference / 03</div>
              <h2>Markers and tokens</h2>
              <div className={styles.referenceGrid}>
                {['Storm marker', 'First player', 'Alliance', 'Spice blow', 'Battle', 'Turn'].map((name) => (
                  <div key={name}>
                    <AssetImagePlaceholder label={name} />
                    <strong>{name}</strong>
                    <p>One short explanation of when this marker is used.</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </article>
      </section>
    </div>
  );
}

const variantLabels: Record<CatalogueVariant, string> = {
  blocks: 'A  Composable blocks',
  sections: 'B  Semantic sections',
  recipes: 'C  Page recipes',
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
    <div className={styles.prototypeSwitcher} role="group" aria-label="Catalogue prototype variant">
      <button
        aria-label="Previous catalogue variant"
        onClick={() =>
          select(catalogueVariants[(currentIndex - 1 + catalogueVariants.length) % catalogueVariants.length])
        }
      >
        <ChevronLeft size={18} aria-hidden />
      </button>
      <span>{variantLabels[variant]}</span>
      <button
        aria-label="Next catalogue variant"
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
            <PageTitle title="Rulebook catalogue prototype" />
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
                Compare three ways to define the production editorial catalogue.
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
        <section className={styles.cataloguePrototype} aria-label="Rulebook editorial catalogue prototype">
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
