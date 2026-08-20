import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  SegmentedControl,
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
  Check,
  CircleAlert,
  Cloud,
  FileText,
  PanelRight,
  RotateCcw,
  Save,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useEffect, useReducer, useState } from 'react';

import {
  editorCanvas,
  initialPrototypeState,
  reducePrototype,
} from './$rulesetSlug/-rulebook-conflicts-prototype/model';
import type {
  EditorId,
  EditorState,
  MergeConflict,
  PrototypeAction,
  RulebookBlock,
  RulebookPage,
} from './$rulesetSlug/-rulebook-conflicts-prototype/model';
import styles from './RulebookConflictsPrototype.module.css';

type Variant = 'compare' | 'focus' | 'inspector';

const variants: Array<{ value: Variant; label: string; shortLabel: string }> = [
  { value: 'inspector', label: 'Inspector', shortLabel: 'A' },
  { value: 'focus', label: 'Focus', shortLabel: 'B' },
  { value: 'compare', label: 'Compare', shortLabel: 'C' },
];

export const Route = createFileRoute('/_app/rulesets/rulebook-conflicts-prototype')({
  validateSearch: (search: Record<string, unknown>): { variant: Variant } => ({
    variant: variants.some((entry) => entry.value === search.variant) ? (search.variant as Variant) : 'inspector',
  }),
  component: RulebookConflictsPrototypePage,
});

function dispatchMany(dispatch: (action: PrototypeAction) => void, actions: PrototypeAction[]) {
  for (const action of actions) {
    dispatch(action);
  }
}

function loadScenario(
  kind: 'page-delete' | 'remote-delete' | 'same-field',
  dispatch: (action: PrototypeAction) => void
) {
  const actions: PrototypeAction[] = [{ type: 'reset' }];
  if (kind === 'same-field') {
    actions.push(
      { type: 'edit-block', blockId: 'intro', field: 'title', value: 'Prepare for the storm' },
      { type: 'switch-editor', editorId: 'bob' },
      { type: 'edit-block', blockId: 'intro', field: 'title', value: 'Before the first round' },
      { type: 'save' },
      { type: 'switch-editor', editorId: 'alice' }
    );
  } else if (kind === 'remote-delete') {
    actions.push(
      { type: 'edit-block', blockId: 'storm', field: 'body', value: 'Place the storm marker on sector one.' },
      { type: 'switch-editor', editorId: 'bob' },
      { type: 'delete-block', blockId: 'storm' },
      { type: 'save' },
      { type: 'switch-editor', editorId: 'alice' }
    );
  } else {
    actions.push(
      { type: 'delete-page', pageId: 'page-001' },
      { type: 'switch-editor', editorId: 'bob' },
      { type: 'edit-block', blockId: 'spice', field: 'body', value: 'Seed two spice blows before play.' },
      { type: 'save' },
      { type: 'switch-editor', editorId: 'alice' }
    );
  }
  dispatchMany(dispatch, actions);
}

function PageRail({
  pages,
  selectedPageId,
  onSelect,
}: {
  pages: RulebookPage[];
  selectedPageId: string;
  onSelect: (pageId: string) => void;
}) {
  return (
    <nav className={styles.pageRail} aria-label="Rulebook pages">
      <Text size="xs" fw={700} tt="uppercase" c="dimmed">
        Pages
      </Text>
      {pages.map((page, index) => (
        <button
          className={styles.pageThumb}
          data-selected={page.id === selectedPageId || undefined}
          key={page.id}
          type="button"
          onClick={() => onSelect(page.id)}
        >
          <span className={styles.thumbSheet}>
            <span>{index + 1}</span>
          </span>
          <span>{page.title}</span>
        </button>
      ))}
    </nav>
  );
}

function PageStrip({
  pages,
  selectedPageId,
  onSelect,
}: {
  pages: RulebookPage[];
  selectedPageId: string;
  onSelect: (pageId: string) => void;
}) {
  return (
    <Group gap="xs" wrap="nowrap" className={styles.pageStrip}>
      {pages.map((page, index) => (
        <Button
          key={page.id}
          variant={page.id === selectedPageId ? 'filled' : 'light'}
          color={page.id === selectedPageId ? 'dune' : 'gray'}
          onClick={() => onSelect(page.id)}
        >
          {index + 1}. {page.title}
        </Button>
      ))}
    </Group>
  );
}

function RulebookPagePreview({
  page,
  selectedBlockId,
  onSelectBlock,
  label,
}: {
  page: RulebookPage;
  selectedBlockId?: string;
  onSelectBlock?: (blockId: string) => void;
  label?: string;
}) {
  return (
    <section className={styles.previewFrame} aria-label={label ?? `Preview of ${page.title}`}>
      <div className={styles.paperPage}>
        <header className={styles.paperHeader}>
          <span>Arrakis field rules</span>
          <span>{page.id}</span>
        </header>
        <div className={styles.paperBody}>
          <p className={styles.paperKicker}>Section {page.id.slice(-3)}</p>
          <h2>{page.title}</h2>
          <div className={styles.paperRule} />
          {page.blocks.map((block) => (
            <button
              className={styles.previewBlock}
              data-selected={block.id === selectedBlockId || undefined}
              key={block.id}
              type="button"
              onClick={onSelectBlock ? () => onSelectBlock(block.id) : undefined}
              tabIndex={onSelectBlock ? 0 : -1}
            >
              <strong>{block.title}</strong>
              <span>{block.body}</span>
            </button>
          ))}
        </div>
        <footer className={styles.paperFooter}>
          <span>Dune Zone prototype</span>
          <span>{Number(page.id.slice(-3))}</span>
        </footer>
      </div>
    </section>
  );
}

function MissingPagePreview({ message }: { message: string }) {
  return (
    <section className={styles.previewFrame} aria-label={message}>
      <div className={styles.missingPage}>
        <Trash2 size={32} aria-hidden />
        <Title order={3}>Page not present</Title>
        <Text size="sm" c="dimmed">
          {message}
        </Text>
      </div>
    </section>
  );
}

function ConflictPanel({
  conflicts,
  onResolve,
}: {
  conflicts: MergeConflict[];
  onResolve: (operationId: string, choice: 'mine' | 'saved') => void;
}) {
  if (conflicts.length === 0) {
    return null;
  }
  return (
    <Alert
      color="red"
      icon={<CircleAlert size={18} />}
      title={`${conflicts.length} change${conflicts.length === 1 ? '' : 's'} need your choice`}
    >
      <Stack gap="md">
        {conflicts.map((conflict) => (
          <div key={conflict.operationId} className={styles.conflict}>
            <Text size="sm">{conflict.message}</Text>
            <div className={styles.conflictValues}>
              <div>
                <Text size="xs" fw={700} c="dimmed">
                  Saved by collaborator
                </Text>
                <Text size="sm">{conflict.saved}</Text>
              </div>
              <div>
                <Text size="xs" fw={700} c="dimmed">
                  Your local change
                </Text>
                <Text size="sm">{conflict.local}</Text>
              </div>
            </div>
            <Group gap="xs">
              <Button size="xs" variant="light" color="gray" onClick={() => onResolve(conflict.operationId, 'saved')}>
                Use saved
              </Button>
              <Button
                size="xs"
                variant="filled"
                color="confirm"
                onClick={() => onResolve(conflict.operationId, 'mine')}
              >
                Keep mine
              </Button>
            </Group>
          </div>
        ))}
      </Stack>
    </Alert>
  );
}

function BlockInspector({
  editor,
  page,
  block,
  dispatch,
}: {
  editor: EditorState;
  page: RulebookPage;
  block: RulebookBlock | undefined;
  dispatch: (action: PrototypeAction) => void;
}) {
  const blockIndex = block ? page.blocks.findIndex((entry) => entry.id === block.id) : -1;
  return (
    <aside className={styles.inspector}>
      <Group justify="space-between" align="center">
        <div>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            Block controls
          </Text>
          <Title order={3}>{block?.title ?? 'Select a block'}</Title>
        </div>
        <PanelRight size={20} aria-hidden />
      </Group>

      {block ? (
        <Stack gap="md">
          <TextInput
            label="Heading"
            value={block.title}
            onChange={(event) =>
              dispatch({ type: 'edit-block', blockId: block.id, field: 'title', value: event.currentTarget.value })
            }
          />
          <Textarea
            label="Body"
            description="Formatting controls belong here. This ticket only checks conflict behavior."
            minRows={6}
            autosize
            value={block.body}
            onChange={(event) =>
              dispatch({ type: 'edit-block', blockId: block.id, field: 'body', value: event.currentTarget.value })
            }
          />
          <Group gap="xs">
            <Tooltip label="Move block up">
              <ActionIcon
                aria-label="Move block up"
                variant="light"
                color="gray"
                disabled={blockIndex <= 0}
                onClick={() =>
                  dispatch({ type: 'move-block', blockId: block.id, beforeBlockId: page.blocks[blockIndex - 1]!.id })
                }
              >
                <ArrowUp size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Move block down">
              <ActionIcon
                aria-label="Move block down"
                variant="light"
                color="gray"
                disabled={blockIndex < 0 || blockIndex === page.blocks.length - 1}
                onClick={() =>
                  dispatch({
                    type: 'move-block',
                    blockId: block.id,
                    beforeBlockId: page.blocks[blockIndex + 2]?.id ?? null,
                  })
                }
              >
                <ArrowDown size={16} />
              </ActionIcon>
            </Tooltip>
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<Trash2 size={15} />}
              onClick={() => dispatch({ type: 'delete-block', blockId: block.id })}
            >
              Delete block
            </Button>
          </Group>
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          Pick a block on the page to edit its fields.
        </Text>
      )}

      <ConflictPanel
        conflicts={editor.conflicts}
        onResolve={(operationId, choice) => dispatch({ type: 'resolve', operationId, choice })}
      />
    </aside>
  );
}

function DifferenceWorkspace({
  editor,
  selectedPageId,
  setSelectedPageId,
  dispatch,
}: {
  editor: EditorState;
  selectedPageId: string;
  setSelectedPageId: (id: string) => void;
  dispatch: (action: PrototypeAction) => void;
}) {
  const localDraft = editorCanvas(editor);
  const pageIds = new Set([
    ...editor.baselineDraft.pages.map((page) => page.id),
    ...editor.savedDraft.pages.map((page) => page.id),
  ]);
  const pages = [...pageIds].map(
    (pageId) =>
      editor.savedDraft.pages.find((page) => page.id === pageId) ??
      editor.baselineDraft.pages.find((page) => page.id === pageId)!
  );
  const pageId = pageIds.has(selectedPageId) ? selectedPageId : pages[0]!.id;
  const localPage = localDraft.pages.find((page) => page.id === pageId);
  const savedPage = editor.savedDraft.pages.find((page) => page.id === pageId);

  return (
    <div className={styles.compareVariant}>
      <PageRail pages={pages} selectedPageId={pageId} onSelect={setSelectedPageId} />
      <div className={styles.compareCanvas}>
        <div>
          <Group justify="space-between" mb="xs">
            <Text fw={700}>Your draft</Text>
            <Badge color="dune">from revision {editor.baselineRevision}</Badge>
          </Group>
          {localPage ? (
            <RulebookPagePreview page={localPage} label="Your local draft" />
          ) : (
            <MissingPagePreview message="You deleted this page in your draft." />
          )}
        </div>
        <div>
          <Group justify="space-between" mb="xs">
            <Text fw={700}>Latest saved version</Text>
            <Badge color="gray">revision {editor.savedRevision}</Badge>
          </Group>
          {savedPage ? (
            <RulebookPagePreview page={savedPage} label="Latest saved version" />
          ) : (
            <MissingPagePreview message="A collaborator deleted this page." />
          )}
        </div>
      </div>
      <aside className={styles.inspector}>
        <div>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed">
            Review differences
          </Text>
          <Title order={3}>Choose what to keep</Title>
          <Text size="sm" c="dimmed" mt="xs">
            Your changes remain local until every difference has a choice and you save.
          </Text>
        </div>
        <ConflictPanel
          conflicts={editor.conflicts}
          onResolve={(operationId, choice) => dispatch({ type: 'resolve', operationId, choice })}
        />
      </aside>
    </div>
  );
}

function EditorWorkspace({
  variant,
  editor,
  reviewingDifferences,
  selectedPageId,
  selectedBlockId,
  setSelectedPageId,
  setSelectedBlockId,
  dispatch,
}: {
  variant: Variant;
  editor: EditorState;
  reviewingDifferences: boolean;
  selectedPageId: string;
  selectedBlockId: string;
  setSelectedPageId: (id: string) => void;
  setSelectedBlockId: (id: string) => void;
  dispatch: (action: PrototypeAction) => void;
}) {
  if (reviewingDifferences) {
    return (
      <DifferenceWorkspace
        editor={editor}
        selectedPageId={selectedPageId}
        setSelectedPageId={setSelectedPageId}
        dispatch={dispatch}
      />
    );
  }

  const draft = editorCanvas(editor);
  const page = draft.pages.find((entry) => entry.id === selectedPageId) ?? draft.pages[0]!;
  const block = page.blocks.find((entry) => entry.id === selectedBlockId) ?? page.blocks[0];

  if (variant === 'focus') {
    return (
      <div className={styles.focusVariant}>
        <PageStrip pages={draft.pages} selectedPageId={page.id} onSelect={setSelectedPageId} />
        <div className={styles.focusBody}>
          <RulebookPagePreview page={page} selectedBlockId={block?.id} onSelectBlock={setSelectedBlockId} />
          <BlockInspector editor={editor} page={page} block={block} dispatch={dispatch} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.inspectorVariant}>
      <PageRail pages={draft.pages} selectedPageId={page.id} onSelect={setSelectedPageId} />
      <RulebookPagePreview page={page} selectedBlockId={block?.id} onSelectBlock={setSelectedBlockId} />
      <BlockInspector editor={editor} page={page} block={block} dispatch={dispatch} />
    </div>
  );
}

function PrototypeSwitcher({ variant }: { variant: Variant }) {
  const navigate = useNavigate({ from: Route.fullPath });
  const currentIndex = variants.findIndex((entry) => entry.value === variant);
  const move = (offset: number) => {
    const next = variants[(currentIndex + offset + variants.length) % variants.length]!;
    navigate({ search: { variant: next.value }, replace: true });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        move(-1);
      } else if (event.key === 'ArrowRight') {
        move(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
        {variants[currentIndex]!.shortLabel} · {variants[currentIndex]!.label}
      </Text>
      <ActionIcon aria-label="Next prototype variant" variant="subtle" color="gray" onClick={() => move(1)}>
        <ArrowRight size={18} />
      </ActionIcon>
    </div>
  );
}

function RulebookConflictsPrototypePage() {
  const { variant } = Route.useSearch();
  const [state, dispatch] = useReducer(reducePrototype, undefined, initialPrototypeState);
  const [selectedPageId, setSelectedPageId] = useState('page-001');
  const [selectedBlockId, setSelectedBlockId] = useState('intro');
  const [reviewingDifferences, setReviewingDifferences] = useState(false);
  const editor = state.editors[state.activeEditorId];
  const needsReview = editor.conflicts.length > 0;

  useEffect(() => {
    if (!needsReview) {
      setReviewingDifferences(false);
    }
  }, [needsReview]);

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Group gap="sm">
          <FileText size={28} aria-hidden />
          <div>
            <h1>Rulebook editor prototype</h1>
            <Text size="sm">Concurrent save review only. In-memory data, no database.</Text>
          </div>
        </Group>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Group gap="sm">
              <SegmentedControl
                aria-label="Active editor"
                value={state.activeEditorId}
                onChange={(value) => dispatch({ type: 'switch-editor', editorId: value as EditorId })}
                data={[
                  { value: 'alice', label: 'Alice' },
                  { value: 'bob', label: 'Bob' },
                ]}
              />
              <Badge leftSection={<Cloud size={13} />} color="gray" variant="light">
                Saved revision {state.sharedRevision}
              </Badge>
              {editor.patch.length > 0 ? <Badge color="dune">{editor.patch.length} pending</Badge> : null}
              {needsReview ? <Badge color="red">Needs review</Badge> : null}
            </Group>
          </Toolbar.Left>
          <Toolbar.Right>
            <Group gap="xs">
              {needsReview ? (
                <Button
                  color="dune"
                  leftSection={<PanelRight size={16} />}
                  onClick={() => setReviewingDifferences(true)}
                >
                  Review differences
                </Button>
              ) : (
                <Tooltip label="Save local changes">
                  <Button
                    color="confirm"
                    leftSection={<Save size={16} />}
                    disabled={editor.patch.length === 0}
                    onClick={() => dispatch({ type: 'save' })}
                  >
                    Save
                  </Button>
                </Tooltip>
              )}
              <ActionIcon
                aria-label="Reset prototype"
                variant="light"
                color="gray"
                onClick={() => dispatch({ type: 'reset' })}
              >
                <RotateCcw size={17} />
              </ActionIcon>
            </Group>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="md">
          <Paper withBorder radius="md" p="sm">
            <Group justify="space-between" gap="md" wrap="wrap">
              <Group gap="xs">
                <UsersRound size={18} aria-hidden />
                <Text size="sm" fw={700}>
                  Try simultaneous changes
                </Text>
                <Button
                  size="xs"
                  variant="light"
                  color="gray"
                  onClick={() => {
                    setReviewingDifferences(false);
                    loadScenario('same-field', dispatch);
                  }}
                >
                  Same field
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="gray"
                  onClick={() => {
                    setReviewingDifferences(false);
                    loadScenario('remote-delete', dispatch);
                  }}
                >
                  Remote deletion
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  color="gray"
                  onClick={() => {
                    setReviewingDifferences(false);
                    loadScenario('page-delete', dispatch);
                  }}
                >
                  Page deletion
                </Button>
              </Group>
              <Group gap="xs">
                <UserRound size={16} aria-hidden />
                <Text size="sm">Editing as {state.activeEditorId === 'alice' ? 'Alice' : 'Bob'}</Text>
              </Group>
            </Group>
          </Paper>

          <Alert
            color={needsReview ? 'red' : 'gray'}
            icon={needsReview ? <CircleAlert size={18} /> : <Check size={18} />}
          >
            {state.notice}
          </Alert>

          <Box className={styles.workspaceShell} data-variant={variant}>
            <EditorWorkspace
              variant={variant}
              editor={editor}
              reviewingDifferences={reviewingDifferences}
              selectedPageId={selectedPageId}
              selectedBlockId={selectedBlockId}
              setSelectedPageId={setSelectedPageId}
              setSelectedBlockId={setSelectedBlockId}
              dispatch={dispatch}
            />
          </Box>
        </Stack>
        <PrototypeSwitcher variant={variant} />
      </PageLayout.Content>
    </PageLayout>
  );
}
