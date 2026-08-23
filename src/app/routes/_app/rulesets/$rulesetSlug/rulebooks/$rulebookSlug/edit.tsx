import { Alert, Badge, Box, Button, Group, SegmentedControl, Stack, Text, Textarea, Title } from '@mantine/core';
import { parseFormattedText } from '@shared/formattedText';
import type { FormattedTextParseResult } from '@shared/formattedText';
import type { RulebookBlockDraft, RulebookContentsDraftV1, RulebookPageDraft } from '@shared/rulebooks/contents';
import { createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { Surface } from '@ui/surface';
import { BookOpenText } from 'lucide-react';
import { Fragment, useState } from 'react';
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
        return (
          <Stack key={blockId} gap="sm">
            <Text fw={700}>Repeated text block</Text>
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
                  <Textarea
                    key={itemId}
                    label={`Item ${index + 1}`}
                    value={item.text}
                    error={error}
                    autosize
                    minRows={4}
                    onChange={(event) =>
                      dispatch({ kind: 'set', target, field: 'text', value: event.currentTarget.value })
                    }
                  />
                );
              })
            )}
          </Stack>
        );
      })}
    </Stack>
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

  if (result.status !== 'ready') {
    return (
      <PageLayout>
        <PageLayout.Header>
          <PageTitle eyebrow="Local Rulebook session" title="Rulebook editor unavailable" />
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
      <PageLayout.Header>
        <PageTitle eyebrow={`${rulesetSlug} / ${rulebookSlug}`} title={`Edit ${rulebookSlug}`} />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Surface padding="sm">
          <Group justify="space-between" align="center" wrap="wrap">
            <Group gap="xs">
              <Badge variant="light" color={hasLocalChanges ? 'yellow' : 'gray'}>
                {hasLocalChanges ? 'Local changes' : 'Starter state'}
              </Badge>
              <Text size="sm" c="dimmed">
                Preview scale
              </Text>
            </Group>
            <SegmentedControl
              aria-label="Preview scale"
              value={fit}
              onChange={(value) => setFit(value as PreviewFit)}
              data={[
                { value: 'height', label: 'Fit height' },
                { value: 'width', label: 'Fit width' },
              ]}
            />
          </Group>
        </Surface>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <Alert
            icon={<BookOpenText size={18} aria-hidden />}
            color="blue"
            variant="light"
            title="Local editing session"
          >
            This page uses the starter Rulebook in this browser tab. It does not load from or save to the database.
          </Alert>
          {page ? (
            <section className={styles.workspaceSticky} data-fit={fit} aria-label="Rulebook editing workspace">
              <div className={styles.workspaceScroller} role="group" aria-label="Editor and preview">
                <div className={styles.workspace}>
                  <div className={styles.controlsScroll}>
                    <Surface padding="lg" as="section" aria-labelledby="rulebook-editor-controls-title">
                      <Stack gap="lg">
                        <Group justify="space-between" align="flex-start" wrap="wrap">
                          <Stack gap={2}>
                            <Title id="rulebook-editor-controls-title" order={2} size="h4">
                              {mode === 'navigate' ? 'Choose a page' : `Edit Page ${pageNumber}`}
                            </Title>
                            <Text size="sm" c="dimmed">
                              Page navigation and text editing use separate modes.
                            </Text>
                          </Stack>
                          <SegmentedControl
                            aria-label="Editor mode"
                            value={mode}
                            onChange={(value) => setMode(value as EditorMode)}
                            data={[
                              { value: 'navigate', label: 'Choose page' },
                              { value: 'edit', label: 'Edit page' },
                            ]}
                          />
                        </Group>

                        {mode === 'navigate' ? (
                          <Stack component="nav" aria-label="Rulebook pages" gap="xs">
                            {result.draft.pageOrder.map((candidateId, index) => {
                              const candidate = result.draft.pagesById[candidateId];
                              return candidate ? (
                                <Button
                                  key={candidateId}
                                  variant={candidateId === pageId ? 'filled' : 'light'}
                                  color={candidateId === pageId ? 'confirm' : 'gray'}
                                  justify="space-between"
                                  aria-current={candidateId === pageId ? 'page' : undefined}
                                  onClick={() => {
                                    setActivePageId(candidateId);
                                    setMode('edit');
                                  }}
                                >
                                  <span>Page {index + 1}</span>
                                  <Text component="span" size="xs" inherit opacity={0.7}>
                                    {candidate.anchor}
                                  </Text>
                                </Button>
                              ) : null;
                            })}
                          </Stack>
                        ) : (
                          <PageTextEditors page={page} result={result} dispatch={dispatch} />
                        )}
                      </Stack>
                    </Surface>
                  </div>
                  <section className={styles.previewRail} aria-label="Rulebook page preview">
                    <RulebookPagePreview page={page} pageNumber={pageNumber} draft={result.draft} fit={fit} />
                  </section>
                </div>
              </div>
            </section>
          ) : (
            <Alert color="yellow" role="status" title="No page selected">
              The local starter session has no Page to edit.
            </Alert>
          )}
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
