import {
  Accordion,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { parseFormattedText } from '@shared/formattedText';
import type { FormattedTextParseResult } from '@shared/formattedText';
import type { RulebookBlockDraft, RulebookContentsDraftV1, RulebookPageDraft } from '@shared/rulebooks/contents';
import { createFileRoute } from '@tanstack/react-router';
import { IconAction } from '@ui/control/IconAction';
import { AddAction } from '@ui/control/ListLengthActions';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { BookOpenText, Minus } from 'lucide-react';
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
type VisualVariant = 'outline' | 'canvas' | 'manuscript';

const visualVariants: readonly { value: VisualVariant; key: string; label: string }[] = [
  { value: 'outline', key: 'A', label: 'Outline dock' },
  { value: 'canvas', key: 'B', label: 'Canvas first' },
  { value: 'manuscript', key: 'C', label: 'Manuscript rail' },
];

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

function sameTextTarget(
  target: ReadyResult['diagnostics'][number]['target'],
  expected: { kind: 'block'; blockId: string } | { kind: 'item'; blockId: string; itemId: string }
) {
  return (
    target?.kind === expected.kind &&
    target.blockId === expected.blockId &&
    (target.kind !== 'item' || (expected.kind === 'item' && target.itemId === expected.itemId))
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
          const error = result.diagnostics.find(
            (diagnostic) => diagnostic.field === 'text' && sameTextTarget(diagnostic.target, target)
          )?.message;
          return (
            <Textarea
              key={blockId}
              label="Text block"
              value={block.text}
              error={error}
              autosize
              minRows={6}
              onChange={(event) => dispatch({ kind: 'set', target, field: 'text', value: event.currentTarget.value })}
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
                const error = result.diagnostics.find(
                  (diagnostic) => diagnostic.field === 'text' && sameTextTarget(diagnostic.target, target)
                )?.message;
                return (
                  <Group key={itemId} align="flex-start" wrap="nowrap">
                    <Textarea
                      label={`Item ${index + 1}`}
                      aria-label={`${repeatedBlockLabel}, item ${index + 1}`}
                      value={item.text}
                      error={error}
                      autosize
                      minRows={4}
                      style={{ flex: 1 }}
                      onChange={(event) =>
                        dispatch({ kind: 'set', target, field: 'text', value: event.currentTarget.value })
                      }
                    />
                    <IconAction
                      label={`Remove item ${index + 1} from ${repeatedBlockLabel}`}
                      variant="light"
                      color="red"
                      size="sm"
                      icon={<Minus size={15} aria-hidden />}
                      onClick={() => dispatch({ kind: 'delete', root: target })}
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

type ConceptProps = {
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

function PageOutline({
  result,
  pageId,
  selectPage,
}: Pick<ConceptProps, 'result' | 'pageId' | 'selectPage'>) {
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
              <span className={styles.pageChoiceAnchor}>
                {candidate.anchor}
              </span>
            </Text>
          </Button>
        ) : null;
      })}
    </Stack>
  );
}

function ControlContents(props: ConceptProps) {
  return props.mode === 'navigate' ? (
    <PageOutline result={props.result} pageId={props.pageId} selectPage={props.selectPage} />
  ) : (
    <PageTextEditors page={props.page} result={props.result} dispatch={props.dispatch} />
  );
}

function PreviewRail({ page, pageNumber, result, fit }: ConceptProps) {
  return (
    <section className={styles.previewRail} aria-label="Rulebook page preview">
      <RulebookPagePreview page={page} pageNumber={pageNumber} draft={result.draft} fit={fit} />
    </section>
  );
}

function OutlineConcept(props: ConceptProps) {
  return (
    <div className={styles.workspace} data-concept="outline" data-fit={props.fit}>
      <Surface className={styles.outlineRail} padding="lg" as="section" aria-label="Rulebook controls">
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
      </Surface>
      <PreviewRail {...props} />
    </div>
  );
}

function CanvasConcept(props: ConceptProps) {
  return (
    <div className={styles.workspace} data-concept="canvas" data-fit={props.fit}>
      <PreviewRail {...props} />
      <section className={styles.canvasRail} aria-label="Rulebook controls">
        <Stack gap="lg">
          <Group justify="space-between" align="center" wrap="wrap">
            <div>
              <Text fw={700}>{props.mode === 'navigate' ? 'Choose a page' : `Edit Page ${props.pageNumber}`}</Text>
              <Text size="xs" c="dimmed">
                The Page stays in view while you work.
              </Text>
            </div>
            <SegmentedControl
              size="xs"
              aria-label="Editor mode"
              value={props.mode}
              onChange={(value) => props.setMode(value as EditorMode)}
              data={[
                { value: 'navigate', label: 'Navigate' },
                { value: 'edit', label: 'Edit' },
              ]}
            />
          </Group>
          <ControlContents {...props} />
        </Stack>
      </section>
    </div>
  );
}

function ManuscriptConcept(props: ConceptProps) {
  return (
    <div className={styles.workspace} data-concept="manuscript" data-fit={props.fit}>
      <Tabs
        className={styles.manuscriptTabs}
        orientation="vertical"
        value={props.mode}
        onChange={(value) => value && props.setMode(value as EditorMode)}
      >
        <Tabs.List className={styles.modeSpine} aria-label="Editor mode">
          <Tabs.Tab value="navigate">Pages</Tabs.Tab>
          <Tabs.Tab value="edit">Edit</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel
          value="navigate"
          className={styles.manuscriptRail}
          role="region"
          aria-label="Rulebook page navigation"
        >
          <Stack gap="lg">
            <div>
              <Text fw={700}>Rulebook outline</Text>
              <Text size="xs" c="dimmed">
                Choose a Page to begin editing it.
              </Text>
            </div>
            <PageOutline result={props.result} pageId={props.pageId} selectPage={props.selectPage} />
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel
          value="edit"
          className={styles.manuscriptRail}
          role="region"
          aria-label={`Edit Page ${props.pageNumber}`}
        >
          <Stack gap="lg">
            <div>
              <Text fw={700}>Page {props.pageNumber}</Text>
              <Text size="xs" c="dimmed">
                Changes appear on the Page immediately.
              </Text>
            </div>
            <PageTextEditors page={props.page} result={props.result} dispatch={props.dispatch} />
          </Stack>
        </Tabs.Panel>
      </Tabs>
      <PreviewRail {...props} />
    </div>
  );
}

function PrototypeSwitcher({ variant, setVariant }: { variant: VisualVariant; setVariant: (value: VisualVariant) => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable) ||
        (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      ) {
        return;
      }
      const current = visualVariants.findIndex((candidate) => candidate.value === variant);
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const next = visualVariants[(current + direction + visualVariants.length) % visualVariants.length];
      if (next) {
        setVariant(next.value);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [variant, setVariant]);

  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <div className={styles.switcher}>
      <Surface padding="sm">
        <Group gap="xs" wrap="wrap" justify="center">
          <Text size="xs" fw={700} c="dimmed">
            Visual direction
          </Text>
          <SegmentedControl
            size="xs"
            aria-label="Visual direction"
            value={variant}
            onChange={(value) => setVariant(value as VisualVariant)}
            data={visualVariants.map((candidate) => ({
              value: candidate.value,
              label: `${candidate.key} · ${candidate.label}`,
            }))}
          />
        </Group>
      </Surface>
    </div>
  );
}

function RulebookEditorPage() {
  const { rulesetSlug, rulebookSlug } = Route.useParams();
  const [manager] = useState(() => createRulebookEditorStateManager(createCleanRulebookEditorInput()));
  const [result, setResult] = useState<RulebookEditorResult>(() => manager.result);
  const [activePageId, setActivePageId] = useState(() =>
    manager.result.status === 'ready' ? manager.result.draft.pageOrder[0] : undefined
  );
  const [mode, setMode] = useState<EditorMode>('navigate');
  const [fit, setFit] = useState<PreviewFit>('height');
  const [variant, setVariantState] = useState<VisualVariant>(() => {
    if (typeof window === 'undefined') {
      return 'outline';
    }
    const requested = new URLSearchParams(window.location.search).get('variant');
    return visualVariants.some((candidate) => candidate.value === requested) ? (requested as VisualVariant) : 'outline';
  });

  const setVariant = (value: VisualVariant) => {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', value);
    window.history.replaceState(window.history.state, '', url);
    setVariantState(value);
  };

  if (result.status !== 'ready') {
    return (
      <PageLayout>
        <PageLayout.Header size="compact">
          <Title order={1} size="h3">
            Rulebook editor unavailable
          </Title>
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
            <Title order={1} size="h3">
              Rulebook workspace
            </Title>
            <Text size="xs" c="dimmed">
              {rulesetSlug} / {rulebookSlug}
            </Text>
          </div>
        </Group>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Group className={styles.toolbarContents} gap="sm" justify="space-between" wrap="wrap">
              <Group gap="xs" wrap="nowrap">
                <Badge variant="light" color={hasLocalChanges ? 'yellow' : 'gray'}>
                  {hasLocalChanges ? 'Local changes' : 'Starter state'}
                </Badge>
                <Text className={styles.desktopStatus} size="xs" c="dimmed">
                  Browser-only starter state. Nothing is loaded from or saved to the database.
                </Text>
                <Text className={styles.mobileStatus} size="xs" c="dimmed">
                  Local session, no database.
                </Text>
              </Group>
              <SegmentedControl
                size="xs"
                aria-label="Preview fit"
                value={fit}
                onChange={(value) => setFit(value as PreviewFit)}
                data={[
                  { value: 'height', label: 'Fit height' },
                  { value: 'width', label: 'Fit width' },
                ]}
              />
            </Group>
          </Toolbar.Left>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        {page ? (
          <section className={styles.prototypeRoot} aria-label="Rulebook editing workspace">
            <div className={styles.workspaceSticky} data-fit={fit}>
              <Box
                className={styles.workspaceViewport}
                role="region"
                aria-label="Rulebook editor and preview"
                tabIndex={0}
              >
                {(() => {
                  const conceptProps: ConceptProps = {
                    page,
                    pageId,
                    pageNumber,
                    result,
                    dispatch,
                    mode,
                    fit,
                    setMode,
                    selectPage: (candidateId) => {
                      setActivePageId(candidateId);
                      setMode('edit');
                    },
                  };
                  if (variant === 'canvas') {
                    return <CanvasConcept {...conceptProps} />;
                  }
                  if (variant === 'manuscript') {
                    return <ManuscriptConcept {...conceptProps} />;
                  }
                  return <OutlineConcept {...conceptProps} />;
                })()}
              </Box>
            </div>
            <PrototypeSwitcher variant={variant} setVariant={setVariant} />
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
