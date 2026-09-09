import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  Alert,
  Box,
  Button,
  ColorInput,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { Section } from '@ui/block/Section';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { IconAction } from '@ui/control/IconAction';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { SortableItem } from '@ui/control/SortableItem';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { NestedTabs, Surface } from '@ui/surface';
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  GripVertical,
  Image,
  Layers3,
  MapPin,
  Heading,
  AlignLeft,
} from 'lucide-react';
import { useEffect, useReducer } from 'react';

import styles from './assetExplainerPrototype.module.css';
import {
  createBoardEntries,
  createLeaderEntries,
  entryColors,
  getTargets,
  resolveTarget,
  sources,
} from './assetExplainerPrototypeData';
import type { DisplayEntry, Entry, Revision, Source } from './assetExplainerPrototypeData';
import { AssetExplainerIllustration, AssetExplainerPagePreview } from './assetExplainerPrototypeVisual';

type Scenario = 'board' | 'leader';
type Variant = 'A' | 'B';
type Draft = {
  sourceId: string;
  entries: Entry[];
  numbering: 'automatic' | 'custom';
  colorMode: 'automatic' | 'manual';
  caption: string;
  selectedId: string | null;
  revision: Revision;
};
type PageDraft = {
  title: string;
  heading: { id: string; kind: 'section-heading'; title: string };
  introduction: { id: string; kind: 'text'; text: string };
  explainer: Draft;
};
type State = {
  variant: Variant;
  scenario: Scenario;
  format: 'a4' | 'tall';
  pages: Record<Scenario, PageDraft>;
  activeBlock: 'heading' | 'introduction' | 'explainer';
  picking: boolean;
  placing: boolean;
  factionId: string | null;
  notice: string;
};
type Action =
  | { type: 'view'; value: Partial<Omit<State, 'pages'>> }
  | { type: 'heading'; title: string }
  | { type: 'introduction'; text: string }
  | { type: 'draft'; value: Partial<Draft> }
  | { type: 'entry'; id: string; value: Partial<Entry> }
  | { type: 'add'; entry: Entry }
  | { type: 'move'; id: string; overId: string }
  | { type: 'remove'; id: string }
  | { type: 'source'; sourceId: string }
  | { type: 'reset' };

function initialState(): State {
  const query = new URLSearchParams(window.location.search);
  const board = createBoardEntries();
  const leader = createLeaderEntries();
  return {
    variant: query.get('variant') === 'B' ? 'B' : 'A',
    scenario: query.get('specimen') === 'leader' ? 'leader' : 'board',
    format: query.get('format') === 'tall' ? 'tall' : 'a4',
    pages: {
      board: {
        title: 'Strongholds',
        heading: { id: 'board-heading', kind: 'section-heading', title: 'Strongholds' },
        introduction: {
          id: 'board-introduction',
          kind: 'text',
          text: 'Strongholds offer shelter and count towards victory. Match each marker on the board to its explanation.',
        },
        explainer: {
          sourceId: sources.find((source) => source.kind === 'board')!.id,
          entries: board,
          numbering: 'automatic',
          colorMode: 'automatic',
          caption: 'The surrounding territories stay visible for context.',
          selectedId: board[0]?.id ?? null,
          revision: 'current',
        },
      },
      leader: {
        title: 'Reading a Leader token',
        heading: { id: 'leader-heading', kind: 'section-heading', title: 'Reading a Leader token' },
        introduction: {
          id: 'leader-introduction',
          kind: 'text',
          text: 'Choose a Leader for your battle plan. These details identify the Leader and their contribution to battle.',
        },
        explainer: {
          sourceId: sources.find((source) => source.kind === 'leader')!.id,
          entries: leader,
          numbering: 'automatic',
          colorMode: 'automatic',
          caption: '',
          selectedId: leader[0]?.id ?? null,
          revision: 'current',
        },
      },
    },
    activeBlock: 'explainer',
    picking: false,
    placing: false,
    factionId: sources.find((source) => source.kind === 'leader')?.factionId ?? null,
    notice: '',
  };
}

function reducer(state: State, action: Action): State {
  const page = state.pages[state.scenario];
  const draft = page.explainer;
  const replace = (next: Draft, notice = state.notice): State => ({
    ...state,
    notice,
    pages: { ...state.pages, [state.scenario]: { ...page, explainer: next } },
  });
  switch (action.type) {
    case 'view':
      return { ...state, ...action.value };
    case 'heading':
      return {
        ...state,
        pages: { ...state.pages, [state.scenario]: { ...page, heading: { ...page.heading, title: action.title } } },
      };
    case 'introduction':
      return {
        ...state,
        pages: {
          ...state.pages,
          [state.scenario]: { ...page, introduction: { ...page.introduction, text: action.text } },
        },
      };
    case 'draft':
      return { ...replace({ ...draft, ...action.value }), placing: action.value.revision ? false : state.placing };
    case 'entry':
      return {
        ...replace({
          ...draft,
          entries: draft.entries.map((entry) => (entry.id === action.id ? { ...entry, ...action.value } : entry)),
        }),
        placing: action.value.target ? false : state.placing,
      };
    case 'add':
      return {
        ...replace(
          { ...draft, entries: [...draft.entries, action.entry], selectedId: action.entry.id },
          'Explanation added.'
        ),
        placing: false,
      };
    case 'remove':
      return {
        ...replace(
          {
            ...draft,
            entries: draft.entries.filter((entry) => entry.id !== action.id),
            selectedId:
              draft.selectedId === action.id
                ? (draft.entries.filter((entry) => entry.id !== action.id).at(-1)?.id ?? null)
                : draft.selectedId,
          },
          'Explanation removed.'
        ),
        placing: false,
      };
    case 'move': {
      const from = draft.entries.findIndex((entry) => entry.id === action.id);
      const to = draft.entries.findIndex((entry) => entry.id === action.overId);
      if (from < 0 || to < 0 || from === to) {
        return state;
      }
      const entries = arrayMove(draft.entries, from, to);
      return replace(
        { ...draft, entries },
        `Explanation moved to position ${to + 1}. ${draft.numbering === 'automatic' ? 'Numbers follow the new order.' : 'Its custom label is unchanged.'}`
      );
    }
    case 'source':
      return {
        ...replace(
          { ...draft, sourceId: action.sourceId, revision: 'current' },
          'Source changed. Your explanations and target choices are retained.'
        ),
        picking: false,
        placing: false,
      };
    case 'reset':
      return initialState();
  }
}

function targetName(source: Source, revision: Revision, entry: Entry): string {
  const target = resolveTarget(source, revision, entry.target);
  if (target) {
    return entry.target.kind === 'position' ? 'Placed marker' : target.label;
  }
  return entry.target.kind === 'named' ? entry.target.key || 'Choose a part' : 'Placed marker on previous source';
}

export function AssetExplainerPrototype() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const page = state.pages[state.scenario];
  const draft = page.explainer;
  const displayEntries: DisplayEntry[] = draft.entries.map((entry, index) => ({
    ...entry,
    label: draft.numbering === 'automatic' ? String(index + 1) : entry.label,
    color:
      draft.colorMode === 'manual' && entry.color && /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(entry.color)
        ? entry.color
        : entryColors[index % entryColors.length]!,
  }));
  const source = sources.find((candidate) => candidate.id === draft.sourceId)!;
  const targets = getTargets(source, draft.revision);
  const selected = draft.entries.find((entry) => entry.id === draft.selectedId);
  const selectedLabel = displayEntries.find((entry) => entry.id === draft.selectedId)?.label;
  const unresolved = draft.entries.filter((entry) => !resolveTarget(source, draft.revision, entry.target));
  const view = (value: Partial<Omit<State, 'pages'>>) => dispatch({ type: 'view', value });
  const edit = (value: Partial<Draft>) => dispatch({ type: 'draft', value });
  const updateEntry = (value: Partial<Entry>) => {
    if (selected) {
      dispatch({ type: 'entry', id: selected.id, value });
    }
  };

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', state.variant);
    url.searchParams.set('specimen', state.scenario);
    url.searchParams.set('format', state.format);
    window.history.replaceState(null, '', url);
  }, [state.variant, state.scenario, state.format]);

  useEffect(() => {
    const cycle = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest('input,textarea,select,button,[contenteditable],[role="combobox"],[role="slider"]')
      ) {
        return;
      }
      event.preventDefault();
      dispatch({ type: 'view', value: { variant: state.variant === 'A' ? 'B' : 'A' } });
    };
    window.addEventListener('keydown', cycle);
    return () => window.removeEventListener('keydown', cycle);
  }, [state.variant]);

  const add = (target: Entry['target'] = { kind: 'named', key: '' }) => {
    let nextLabel = 1;
    while (draft.entries.some((entry) => entry.label === String(nextLabel))) {
      nextLabel += 1;
    }
    dispatch({
      type: 'add',
      entry: {
        id: crypto.randomUUID(),
        label: String(nextLabel),
        color: draft.colorMode === 'manual' ? entryColors[draft.entries.length % entryColors.length] : undefined,
        text: '',
        target,
      },
    });
  };
  const pickTarget = (key: string) => {
    const existing = draft.entries.find((entry) => entry.target.kind === 'named' && entry.target.key === key);
    if (existing) {
      edit({ selectedId: existing.id });
    } else {
      add({ kind: 'named', key });
    }
  };
  const place = (x: number, y: number) => {
    const target: Entry['target'] = { kind: 'position', x, y, sourceId: source.id };
    if (selected) {
      updateEntry({ target });
    } else {
      add(target);
    }
    view({ placing: false, notice: 'Marker placed. You can fine-tune its position below.' });
  };
  const factionOptions = [
    ...new Set(sources.filter((candidate) => candidate.kind === 'leader').map((candidate) => candidate.factionId!)),
  ].map((id) => ({
    value: id,
    label: id
      .replace(/^fixture-/, '')
      .replace(/^faction-/, '')
      .replace(/^./, (letter) => letter.toUpperCase()),
  }));

  const sourceControl = (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={2}>
          <Text size="xs" c="dimmed">
            {source.kind === 'board' ? 'Board reference' : 'Leader reference'}
          </Text>
          <Text fw={700}>{source.name}</Text>
        </Stack>
        <Button variant="subtle" size="compact-sm" onClick={() => view({ picking: !state.picking })}>
          {state.picking ? 'Close picker' : 'Change source'}
        </Button>
      </Group>
      {state.picking && (
        <Stack gap="sm" role="group" aria-label="Choose source">
          {source.kind === 'leader' && (
            <ControlBlock
              title="Faction"
              input={
                <Select
                  aria-label="Faction"
                  data={factionOptions}
                  value={state.factionId}
                  onChange={(value) => view({ factionId: value })}
                  allowDeselect={false}
                />
              }
            />
          )}
          {sources
            .filter(
              (candidate) =>
                candidate.kind === source.kind &&
                (candidate.kind === 'board' || candidate.factionId === state.factionId)
            )
            .map((candidate) => (
              <Button
                key={candidate.id}
                variant="subtle"
                color="selected"
                justify="start"
                onClick={() => dispatch({ type: 'source', sourceId: candidate.id })}
              >
                {candidate.name}
              </Button>
            ))}
        </Stack>
      )}
      {unresolved.length > 0 && (
        <Alert
          color="yellow"
          title={`${unresolved.length} ${unresolved.length === 1 ? 'target needs' : 'targets need'} attention`}
        >
          <Text size="sm">
            Your explanations are retained. Choose a new part or place a marker for each unavailable target.
          </Text>
        </Alert>
      )}
    </Stack>
  );

  const explanationList = (
    <ControlBlock
      title="Explanations"
      description="Choose an entry to edit it. Drag its handle to reorder. The minus button removes the last entry."
      tool={
        <ListLengthActions
          addLabel="Add explanation"
          removeLabel="Remove last explanation"
          removeDisabled={draft.entries.length === 0}
          onAdd={() => add()}
          onRemove={() => {
            const last = draft.entries.at(-1);
            if (last) {
              dispatch({ type: 'remove', id: last.id });
            }
          }}
        />
      }
      input={
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={({ active, over }: DragEndEvent) => {
            if (over) {
              dispatch({ type: 'move', id: String(active.id), overId: String(over.id) });
            }
          }}
        >
          <SortableContext items={draft.entries.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
            <Stack component="ul" gap="xs" className={styles.entryList} aria-label="Explanations">
              {displayEntries.map((entry) => (
                <SortableItem as="li" key={entry.id} id={entry.id}>
                  {(handle) => (
                    <Box className={styles.entryRow}>
                      <Button
                        variant={selected?.id === entry.id ? 'light' : 'subtle'}
                        color="selected"
                        className={styles.entryButton}
                        justify="start"
                        onClick={() => {
                          edit({ selectedId: entry.id });
                          view({ placing: false });
                        }}
                        aria-pressed={selected?.id === entry.id}
                      >
                        {entry.label || '·'}. {targetName(source, draft.revision, entry)}
                        {!resolveTarget(source, draft.revision, entry.target) ? ' (unavailable)' : ''}
                      </Button>
                      <IconAction
                        label={`Reorder explanation ${entry.label}`}
                        ref={handle.setActivatorNodeRef}
                        {...handle.attributes}
                        {...handle.listeners}
                        className={styles.entryHandle}
                        emphasis="silent"
                        intent="neutral"
                        size="md"
                        icon={<GripVertical size={16} aria-hidden />}
                      />
                    </Box>
                  )}
                </SortableItem>
              ))}
            </Stack>
            {draft.entries.length === 0 ? (
              <Text size="sm" c="dimmed">
                No explanations yet.
              </Text>
            ) : null}
          </SortableContext>
        </DndContext>
      }
    />
  );

  const selectedEditor = selected ? (
    <Stack gap="sm" className={styles.selectedEditor}>
      <Text fw={700}>Edit explanation {selectedLabel}</Text>
      <Group grow align="start">
        {draft.numbering === 'custom' ? (
          <ControlBlock
            title="Marker label"
            description="Use a number, letter or symbol. The label stays with this entry when reordered."
            input={
              <TextInput
                aria-label="Marker label"
                value={selected.label}
                onChange={(event) => updateEntry({ label: event.currentTarget.value })}
              />
            }
          />
        ) : (
          <ControlBlock
            title="Marker number"
            description="Follows this entry's position in the list. Reorder entries to change their numbers."
            input={<TextInput aria-label="Marker number" value={selectedLabel} readOnly />}
          />
        )}
        <ControlBlock
          title="Target type"
          description="A named part follows that part when the asset changes. A placed marker uses a position on the image."
          input={
            <Select
              aria-label="Target type"
              value={selected.target.kind}
              allowDeselect={false}
              data={[
                { value: 'named', label: 'Named part' },
                { value: 'position', label: 'Placed marker' },
              ]}
              onChange={(value) =>
                updateEntry({
                  target:
                    value === 'position'
                      ? { kind: 'position', x: 0.5, y: 0.5, sourceId: source.id }
                      : { kind: 'named', key: '' },
                })
              }
            />
          }
        />
      </Group>
      {draft.colorMode === 'manual' ? (
        <ControlBlock
          title="Marker color"
          description="Used for this entry's marker, connector, highlight and explanation."
          input={
            <ColorInput
              aria-label="Marker color"
              format="hex"
              swatches={entryColors}
              value={selected.color ?? ''}
              onChange={(color) => updateEntry({ color })}
              error={
                !/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(selected.color ?? '')
                  ? 'Use a hex color, such as #254978.'
                  : undefined
              }
            />
          }
        />
      ) : null}
      {selected.target.kind === 'named' ? (
        <ControlBlock
          title={source.kind === 'board' ? 'Territory or region' : 'Part of the Leader token'}
          input={
            <Select
              aria-label={source.kind === 'board' ? 'Territory or region' : 'Part of the Leader token'}
              placeholder="Choose a part"
              searchable
              allowDeselect={false}
              data={[
                ...targets.map((target) => ({ value: target.key, label: target.label })),
                ...(selected.target.key &&
                !targets.some((target) => selected.target.kind === 'named' && target.key === selected.target.key)
                  ? [{ value: selected.target.key, label: `${selected.target.key} (unavailable)` }]
                  : []),
              ]}
              value={selected.target.key || null}
              onChange={(key) => updateEntry({ target: { kind: 'named', key: key ?? '' } })}
            />
          }
        />
      ) : (
        <ControlBlock
          title="Marker position"
          description="The marker scales with the image. It will not follow a feature that moves within it."
          input={
            <Stack gap="xs">
              <Button
                variant="subtle"
                leftSection={<MapPin size={16} />}
                onClick={() => view({ placing: !state.placing })}
                disabled={draft.revision === 'unavailable'}
              >
                {state.placing ? 'Cancel placement' : 'Place on illustration'}
              </Button>
              <Group grow align="start">
                <ControlBlock
                  title="Horizontal position (%)"
                  input={
                    <NumberInput
                      aria-label="Horizontal position (%)"
                      min={0}
                      max={100}
                      step={1}
                      decimalScale={1}
                      value={selected.target.x * 100}
                      onChange={(value) => {
                        if (selected.target.kind === 'position') {
                          updateEntry({ target: { ...selected.target, x: Number(value) / 100, sourceId: source.id } });
                        }
                      }}
                    />
                  }
                />
                <ControlBlock
                  title="Vertical position (%)"
                  input={
                    <NumberInput
                      aria-label="Vertical position (%)"
                      min={0}
                      max={100}
                      step={1}
                      decimalScale={1}
                      value={selected.target.y * 100}
                      onChange={(value) => {
                        if (selected.target.kind === 'position') {
                          updateEntry({ target: { ...selected.target, y: Number(value) / 100, sourceId: source.id } });
                        }
                      }}
                    />
                  }
                />
              </Group>
            </Stack>
          }
        />
      )}
      {state.placing && (
        <>
          <Text size="sm">Click the illustration to place this marker, or enter its position above.</Text>
          {state.variant === 'A' && (
            <Box className={styles.authoringIllustration}>
              <AssetExplainerIllustration
                source={source}
                revision={draft.revision}
                entries={displayEntries}
                selectedId={selected.id}
                onPlace={place}
              />
            </Box>
          )}
        </>
      )}
      <ControlBlock
        title="Explanation"
        input={
          <FormattedTextInput
            aria-label="Explanation"
            placeholder="Explain what this part means to the player"
            minRows={3}
            autosize
            value={selected.text}
            onChange={(text) => updateEntry({ text })}
          />
        }
      />
    </Stack>
  ) : (
    <Text size="sm" c="dimmed">
      Add an explanation or select a part of the illustration.
    </Text>
  );

  return (
    <Box className={styles.workspace}>
      <Section
        title="AssetExplainer"
        eyebrow="Rulebook authoring prototype"
        description="Try explaining a board or a Leader token. This draft exists only in this browser tab."
      >
        <Group justify="space-between" align="end" className={styles.toolbar}>
          <Group>
            <Select
              label="Example"
              data={[
                { value: 'board', label: 'Dreamrules strongholds' },
                { value: 'leader', label: 'Leader anatomy' },
              ]}
              value={state.scenario}
              onChange={(scenario) =>
                view({ scenario: scenario as Scenario, picking: false, placing: false, notice: '' })
              }
              allowDeselect={false}
            />
            <ControlBlock
              title="Preview size"
              description="Separate specimen books"
              input={
                <Select
                  aria-label="Preview size"
                  data={[
                    { value: 'a4', label: 'A4 · 210 × 297 mm' },
                    { value: 'tall', label: 'Tall · 105 × 297 mm' },
                  ]}
                  value={state.format}
                  onChange={(format) => view({ format: format as State['format'] })}
                  allowDeselect={false}
                />
              }
            />
          </Group>
          <Text size="sm" c="dimmed">
            Illustrated design · Single column
          </Text>
        </Group>
        <DocumentEditorLayout ratio={(state.format === 'tall' ? 105 : 210) / 297} fit="height">
          <DocumentEditorLayout.Sidebar>
            <NestedTabs activePath={['page', state.activeBlock]} ariaLabel="Rulebook structure">
              <NestedTabs.Level label="Pages">
                <NestedTabs.Item as="button" type="button" path={['page']} label={page.title} icon={<FileText />} />
              </NestedTabs.Level>
              <NestedTabs.Level label="Page">
                <NestedTabs.Group label="Content" icon={<Layers3 />}>
                  <NestedTabs.Item
                    as="button"
                    type="button"
                    path={['page', 'heading']}
                    label="Section heading"
                    icon={<Heading />}
                    onClick={() => view({ activeBlock: 'heading', placing: false })}
                  />
                  <NestedTabs.Item
                    as="button"
                    type="button"
                    path={['page', 'introduction']}
                    label="Introduction"
                    icon={<AlignLeft />}
                    onClick={() => view({ activeBlock: 'introduction', placing: false })}
                  />
                  <NestedTabs.Item
                    as="button"
                    type="button"
                    path={['page', 'explainer']}
                    label="AssetExplainer"
                    icon={<Image />}
                    onClick={() => view({ activeBlock: 'explainer' })}
                  />
                </NestedTabs.Group>
              </NestedTabs.Level>
              <NestedTabs.ContentPanel
                aria-label={
                  state.activeBlock === 'explainer'
                    ? 'AssetExplainer editor'
                    : state.activeBlock === 'heading'
                      ? 'Section heading editor'
                      : 'Introduction editor'
                }
              >
                {state.activeBlock === 'heading' ? (
                  <Section title="Section heading">
                    <TextInput
                      label="Heading"
                      value={page.heading.title}
                      onChange={(event) => dispatch({ type: 'heading', title: event.currentTarget.value })}
                    />
                  </Section>
                ) : state.activeBlock === 'introduction' ? (
                  <Section title="Introduction">
                    <FormattedTextInput
                      label="Introduction"
                      minRows={4}
                      autosize
                      value={page.introduction.text}
                      onChange={(text) => dispatch({ type: 'introduction', text })}
                    />
                  </Section>
                ) : (
                  <Stack gap="lg">
                    {sourceControl}
                    <ControlBlock
                      title="Caption"
                      input={
                        <TextInput
                          aria-label="Caption"
                          value={draft.caption}
                          onChange={(event) => edit({ caption: event.currentTarget.value })}
                        />
                      }
                    />
                    <ControlBlock
                      title="Marker labels"
                      description={
                        draft.numbering === 'automatic'
                          ? 'Numbers follow entry order and update together in the illustration and explanations.'
                          : 'Custom labels stay with their entries when reordered.'
                      }
                      input={
                        <Select
                          aria-label="Marker labels"
                          value={draft.numbering}
                          allowDeselect={false}
                          data={[
                            { value: 'automatic', label: 'Automatic numbers (1, 2, 3)' },
                            { value: 'custom', label: 'Custom labels' },
                          ]}
                          onChange={(numbering) => edit({ numbering: numbering as Draft['numbering'] })}
                        />
                      }
                    />
                    <ControlBlock
                      title="Automatic colors"
                      description="When on, colors follow entry order. Turn off to choose a color for each entry. Your manual choices are kept when you turn this back on."
                      input={
                        <Switch
                          aria-label="Automatic colors"
                          color="selected"
                          checked={draft.colorMode === 'automatic'}
                          onChange={(event) =>
                            edit({
                              colorMode: event.currentTarget.checked ? 'automatic' : 'manual',
                              entries: !event.currentTarget.checked
                                ? draft.entries.map((entry, index) => ({
                                    ...entry,
                                    color: entry.color ?? entryColors[index % entryColors.length],
                                  }))
                                : draft.entries,
                            })
                          }
                        />
                      }
                    />
                    {state.variant === 'A' ? (
                      <Stack gap="md">
                        {explanationList}
                        {selectedEditor}
                      </Stack>
                    ) : (
                      <Stack gap="md">
                        <ControlBlock
                          title="Select a part"
                          description="Choose a named part on the illustration to add or edit its explanation."
                          input={
                            <Box className={styles.authoringIllustration}>
                              <AssetExplainerIllustration
                                source={source}
                                revision={draft.revision}
                                entries={displayEntries}
                                selectedId={draft.selectedId ?? undefined}
                                onPickTarget={state.placing ? undefined : pickTarget}
                                onPlace={state.placing ? place : undefined}
                              />
                            </Box>
                          }
                        />
                        {selectedEditor}
                        {explanationList}
                      </Stack>
                    )}
                    <Text role="status" size="xs" c="dimmed">
                      {state.notice}
                    </Text>
                  </Stack>
                )}
              </NestedTabs.ContentPanel>
            </NestedTabs>
          </DocumentEditorLayout.Sidebar>
          <DocumentEditorLayout.Preview>
            <AssetExplainerPagePreview
              source={source}
              revision={draft.revision}
              entries={displayEntries}
              headingBlock={page.heading}
              introductionBlock={page.introduction}
              caption={draft.caption}
              format={state.format}
            />
          </DocumentEditorLayout.Preview>
        </DocumentEditorLayout>
        <Surface padding="md">
          <details>
            <summary>Prototype scenarios and draft data</summary>
            <Stack gap="md" pt="md">
              <Text size="sm">
                These controls simulate source changes with local fixtures. Persistent Leader IDs and named Leader parts
                still need implementation.
              </Text>
              <Select
                label="Source fixture state"
                value={draft.revision}
                data={[
                  { value: 'current', label: 'Current source' },
                  { value: 'updated', label: 'Updated artwork and details' },
                  { value: 'missing-part', label: 'A named part is unavailable' },
                  { value: 'unavailable', label: 'Source is unavailable' },
                ]}
                onChange={(revision) => edit({ revision: revision as Revision })}
                allowDeselect={false}
              />
              <Button variant="subtle" onClick={() => dispatch({ type: 'reset' })}>
                Reset both examples
              </Button>
              <pre className={styles.state} data-prototype-state>
                {JSON.stringify(
                  {
                    variant: state.variant,
                    scenario: state.scenario,
                    format: state.format,
                    activeBlock: state.activeBlock,
                    page,
                    displayLabels: displayEntries.map(({ id, label }) => ({ id, label })),
                    displayColors: displayEntries.map(({ id, color }) => ({ id, color })),
                    unresolvedEntryIds: unresolved.map((entry) => entry.id),
                  },
                  null,
                  2
                )}
              </pre>
            </Stack>
          </details>
        </Surface>
      </Section>
      {import.meta.env.DEV && (
        <div className={styles.switcher}>
          <Surface padding="sm">
            <Group gap="sm" wrap="nowrap">
              <IconAction
                label="Previous interaction"
                icon={<ArrowLeft size={18} />}
                emphasis="quiet"
                onClick={() => view({ variant: state.variant === 'A' ? 'B' : 'A' })}
              />
              <Text size="sm" fw={700}>
                {state.variant === 'A' ? 'A · Entries first' : 'B · Illustration first'}
              </Text>
              <IconAction
                label="Next interaction"
                icon={<ArrowRight size={18} />}
                emphasis="quiet"
                onClick={() => view({ variant: state.variant === 'A' ? 'B' : 'A' })}
              />
            </Group>
          </Surface>
        </div>
      )}
    </Box>
  );
}
