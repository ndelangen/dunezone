import { Alert, Box, Button, Checkbox, Group, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { IconAction } from '@ui/control/IconAction';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { NestedTabs, Surface } from '@ui/surface';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  FileText,
  Image,
  Layers3,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useReducer } from 'react';

import styles from './assetExplainerPrototype.module.css';
import {
  createBoardEntries,
  createLeaderEntries,
  getTargets,
  resolveTarget,
  sources,
} from './assetExplainerPrototypeData';
import type { Entry, Revision, Source } from './assetExplainerPrototypeData';
import { AssetExplainerIllustration, AssetExplainerPrint } from './assetExplainerPrototypeVisual';

type Scenario = 'board' | 'leader';
type Variant = 'A' | 'B';
type Draft = {
  sourceId: string;
  entries: Entry[];
  heading: string;
  introduction: string;
  caption: string;
  showLegend: boolean;
  selectedId: string | null;
  revision: Revision;
};
type State = {
  variant: Variant;
  scenario: Scenario;
  format: 'a4' | 'tall';
  drafts: Record<Scenario, Draft>;
  picking: boolean;
  placing: boolean;
  factionId: string | null;
  notice: string;
};
type Action =
  | { type: 'view'; value: Partial<Omit<State, 'drafts'>> }
  | { type: 'draft'; value: Partial<Draft> }
  | { type: 'entry'; id: string; value: Partial<Entry> }
  | { type: 'add'; entry: Entry }
  | { type: 'move'; id: string; direction: -1 | 1 }
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
    drafts: {
      board: {
        sourceId: sources.find((source) => source.kind === 'board')!.id,
        entries: board,
        heading: 'Strongholds',
        introduction:
          'Strongholds offer shelter and count towards victory. Match each number on the board to its explanation.',
        caption: 'The surrounding territories stay visible for context.',
        showLegend: true,
        selectedId: board[0]?.id ?? null,
        revision: 'current',
      },
      leader: {
        sourceId: sources.find((source) => source.kind === 'leader')!.id,
        entries: leader,
        heading: 'Reading a Leader token',
        introduction:
          'Choose a Leader for your battle plan. These details identify the Leader and their contribution to battle.',
        caption: '',
        showLegend: true,
        selectedId: leader[0]?.id ?? null,
        revision: 'current',
      },
    },
    picking: false,
    placing: false,
    factionId: sources.find((source) => source.kind === 'leader')?.factionId ?? null,
    notice: '',
  };
}

function reducer(state: State, action: Action): State {
  const draft = state.drafts[state.scenario];
  const replace = (next: Draft, notice = state.notice): State => ({
    ...state,
    notice,
    drafts: { ...state.drafts, [state.scenario]: next },
  });
  switch (action.type) {
    case 'view':
      return { ...state, ...action.value };
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
                ? (draft.entries.find((entry) => entry.id !== action.id)?.id ?? null)
                : draft.selectedId,
          },
          'Explanation removed.'
        ),
        placing: false,
      };
    case 'move': {
      const entries = [...draft.entries];
      const from = entries.findIndex((entry) => entry.id === action.id);
      const to = from + action.direction;
      if (from < 0 || to < 0 || to >= entries.length) {
        return state;
      }
      [entries[from], entries[to]] = [entries[to]!, entries[from]!];
      return replace({ ...draft, entries }, `Explanation moved to position ${to + 1}. Its marker label is unchanged.`);
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
  const draft = state.drafts[state.scenario];
  const source = sources.find((candidate) => candidate.id === draft.sourceId)!;
  const targets = getTargets(source, draft.revision);
  const selected = draft.entries.find((entry) => entry.id === draft.selectedId);
  const unresolved = draft.entries.filter((entry) => !resolveTarget(source, draft.revision, entry.target));
  const view = (value: Partial<Omit<State, 'drafts'>>) => dispatch({ type: 'view', value });
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
    dispatch({ type: 'add', entry: { id: crypto.randomUUID(), label: String(nextLabel), text: '', target } });
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
            <Select
              label="Faction"
              data={factionOptions}
              value={state.factionId}
              onChange={(value) => view({ factionId: value })}
              allowDeselect={false}
            />
          )}
          <Text size="sm" c="dimmed">
            {source.kind === 'leader' ? 'Choose a Leader from this faction.' : 'Choose the board this Block explains.'}
          </Text>
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
    <Stack gap="xs" role="list" aria-label="Explanations">
      {draft.entries.map((entry, index) => (
        <Group key={entry.id} gap="xs" wrap="nowrap" role="listitem">
          <Button
            variant={selected?.id === entry.id ? 'light' : 'subtle'}
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
            label={`Move explanation ${entry.label} up`}
            icon={<ArrowUp size={14} />}
            emphasis="quiet"
            size="sm"
            disabled={index === 0}
            onClick={() => dispatch({ type: 'move', id: entry.id, direction: -1 })}
          />
          <IconAction
            label={`Move explanation ${entry.label} down`}
            icon={<ArrowDown size={14} />}
            emphasis="quiet"
            size="sm"
            disabled={index === draft.entries.length - 1}
            onClick={() => dispatch({ type: 'move', id: entry.id, direction: 1 })}
          />
        </Group>
      ))}
      <Button variant="subtle" leftSection={<Plus size={15} />} justify="start" onClick={() => add()}>
        Add explanation
      </Button>
    </Stack>
  );

  const selectedEditor = selected ? (
    <Stack gap="sm" className={styles.selectedEditor}>
      <Group justify="space-between">
        <Text fw={700}>Edit explanation {selected.label}</Text>
        <IconAction
          label="Delete selected explanation"
          icon={<Trash2 size={16} />}
          emphasis="quiet"
          intent="negative"
          onClick={() => dispatch({ type: 'remove', id: selected.id })}
        />
      </Group>
      <Group grow align="start">
        <TextInput
          label="Marker label"
          description="Number, letter or symbol"
          value={selected.label}
          onChange={(event) => updateEntry({ label: event.currentTarget.value })}
        />
        <Select
          label="Target type"
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
      </Group>
      {selected.target.kind === 'named' ? (
        <Select
          label={source.kind === 'board' ? 'Territory or region' : 'Part of the Leader token'}
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
      ) : (
        <Stack gap="xs">
          <Button
            variant="subtle"
            leftSection={<MapPin size={16} />}
            onClick={() => view({ placing: !state.placing })}
            disabled={draft.revision === 'unavailable'}
          >
            {state.placing ? 'Cancel placement' : 'Place on illustration'}
          </Button>
          <Group grow>
            <NumberInput
              label="Horizontal position (%)"
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
            <NumberInput
              label="Vertical position (%)"
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
          </Group>
          <Text size="xs" c="dimmed">
            The marker scales with the image. It will not follow a feature that moves within it.
          </Text>
        </Stack>
      )}
      {state.placing && (
        <>
          <Text size="sm">Click the illustration to place this marker, or enter its position above.</Text>
          {state.variant === 'A' && (
            <Box className={styles.authoringIllustration}>
              <AssetExplainerIllustration
                source={source}
                revision={draft.revision}
                entries={draft.entries}
                selectedId={selected.id}
                onPlace={place}
              />
            </Box>
          )}
        </>
      )}
      <FormattedTextInput
        label="Explanation"
        placeholder="Explain what this part means to the player"
        minRows={3}
        autosize
        value={selected.text}
        onChange={(text) => updateEntry({ text })}
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
            <Select
              label="Preview size"
              description="Separate specimen books"
              data={[
                { value: 'a4', label: 'A4 · 210 × 297 mm' },
                { value: 'tall', label: 'Tall · 105 × 297 mm' },
              ]}
              value={state.format}
              onChange={(format) => view({ format: format as State['format'] })}
              allowDeselect={false}
            />
          </Group>
          <Text size="sm" c="dimmed">
            Illustrated design · Single column
          </Text>
        </Group>
        <DocumentEditorLayout ratio={(state.format === 'tall' ? 105 : 210) / 297} fit="height">
          <DocumentEditorLayout.Sidebar>
            <NestedTabs activePath={['page', 'explainer']} ariaLabel="Rulebook structure">
              <NestedTabs.Level label="Pages">
                <NestedTabs.Item
                  as="button"
                  type="button"
                  path={['page']}
                  label={draft.heading || 'Untitled Page'}
                  icon={<FileText />}
                />
              </NestedTabs.Level>
              <NestedTabs.Level label="Page">
                <NestedTabs.Group label="Content" icon={<Layers3 />}>
                  <NestedTabs.Item
                    as="button"
                    type="button"
                    path={['page', 'explainer']}
                    label="AssetExplainer"
                    icon={<Image />}
                  />
                </NestedTabs.Group>
              </NestedTabs.Level>
              <NestedTabs.ContentPanel aria-label="AssetExplainer editor">
                <Stack gap="lg">
                  {sourceControl}
                  <details>
                    <summary>Heading, introduction and caption</summary>
                    <Stack gap="sm" pt="sm">
                      <TextInput
                        label="Heading"
                        value={draft.heading}
                        onChange={(event) => edit({ heading: event.currentTarget.value })}
                      />
                      <FormattedTextInput
                        label="Introduction"
                        value={draft.introduction}
                        onChange={(introduction) => edit({ introduction })}
                      />
                      <TextInput
                        label="Caption"
                        value={draft.caption}
                        onChange={(event) => edit({ caption: event.currentTarget.value })}
                      />
                    </Stack>
                  </details>
                  <Checkbox
                    label="Show legend below illustration"
                    description="Explanations remain when the legend is hidden."
                    checked={draft.showLegend}
                    onChange={(event) => edit({ showLegend: event.currentTarget.checked })}
                  />
                  {state.variant === 'A' ? (
                    <Section
                      title="Explanations"
                      description="Add an entry, choose its part, then write the explanation."
                    >
                      {explanationList}
                      {selectedEditor}
                    </Section>
                  ) : (
                    <Section
                      title="Select a part"
                      description="Choose a named part on the illustration to add or edit its explanation."
                    >
                      <Box className={styles.authoringIllustration}>
                        <AssetExplainerIllustration
                          source={source}
                          revision={draft.revision}
                          entries={draft.entries}
                          selectedId={draft.selectedId ?? undefined}
                          onPickTarget={state.placing ? undefined : pickTarget}
                          onPlace={state.placing ? place : undefined}
                        />
                      </Box>
                      {selectedEditor}
                      <details open>
                        <summary>Explanation order · {draft.entries.length} entries</summary>
                        <Box pt="sm">{explanationList}</Box>
                      </details>
                    </Section>
                  )}
                  <Text role="status" size="xs" c="dimmed">
                    {state.notice}
                  </Text>
                </Stack>
              </NestedTabs.ContentPanel>
            </NestedTabs>
          </DocumentEditorLayout.Sidebar>
          <DocumentEditorLayout.Preview>
            <AssetExplainerPrint
              source={source}
              revision={draft.revision}
              entries={draft.entries}
              heading={draft.heading}
              introduction={draft.introduction}
              caption={draft.caption}
              showLegend={draft.showLegend}
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
                    source,
                    ...draft,
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
