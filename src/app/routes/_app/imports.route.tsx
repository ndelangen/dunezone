import { Alert, Anchor, Button, Group, Progress, Select, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { ASSET_TYPE_KEYS, ASSET_TYPES } from '@shared/assets/types';
import { contentImportPackageSchema } from '@shared/contentImports/package';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { useReducer } from 'react';
import type { Dispatch } from 'react';

import { applyContentImportItem, exportContentRecord, previewContentImport } from '@db/contentImports';
import type { ContentImportPreview, ContentImportResult } from '@db/contentImports';
import { useSessionViewer } from '@db/profiles';
import { pageHead } from '@app/routes/pageTitle';
import { LoginGate } from '@app/widgets/page-message/LoginGate';

export const Route = createFileRoute('/_app/imports')({
  validateSearch: (search: Record<string, unknown>) => ({
    ruleset: typeof search.ruleset === 'string' ? search.ruleset : '',
    group: typeof search.group === 'string' ? search.group : '',
  }),
  head: () => pageHead('Import and export'),
  component: ImportExportPage,
});

type State = {
  rulesetSlug: string;
  groupSlug: string;
  json: string;
  preview: ContentImportPreview | null;
  busy: 'preview' | 'import' | 'export' | null;
  error: string | null;
  results: { key: string; result: ContentImportResult }[];
  exportKind: 'rulebook' | 'faction' | 'asset';
  exportSlug: string;
  exportType: string;
  warnings: string[];
};
const INITIAL: State = {
  rulesetSlug: '',
  groupSlug: '',
  json: '',
  preview: null,
  busy: null,
  error: null,
  results: [],
  exportKind: 'rulebook',
  exportSlug: '',
  exportType: 'card-custom',
  warnings: [],
};
type Event =
  | { kind: 'edit'; patch: Partial<Pick<State, 'rulesetSlug' | 'groupSlug' | 'json'>> }
  | { kind: 'patch'; patch: Partial<State> }
  | { kind: 'result'; key: string; result: ContentImportResult };

function reducer(state: State, event: Event): State {
  if (event.kind === 'edit') {
    return { ...state, ...event.patch, preview: null, results: [], error: null };
  }
  if (event.kind === 'result') {
    return { ...state, results: [...state.results, { key: event.key, result: event.result }] };
  }
  return { ...state, ...event.patch };
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'The operation could not be completed.';
}

function saveJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function destination(state: State) {
  return { rulesetSlug: state.rulesetSlug.trim(), groupSlug: state.groupSlug.trim() };
}

async function inspect(state: State, dispatch: Dispatch<Event>) {
  const target = destination(state);
  const patch = (update: Partial<State>) => dispatch({ kind: 'patch', patch: update });
  patch({ busy: 'preview', error: null, preview: null, results: [] });
  try {
    const bundle = contentImportPackageSchema.parse(JSON.parse(state.json));
    patch({ preview: await previewContentImport(bundle, target) });
  } catch (error) {
    patch({ error: message(error) });
  } finally {
    patch({ busy: null });
  }
}
async function apply(state: State, dispatch: Dispatch<Event>) {
  const target = destination(state);
  const patch = (update: Partial<State>) => dispatch({ kind: 'patch', patch: update });
  if (!state.preview || state.preview.entries.some((entry) => entry.status === 'conflict')) {
    return;
  }
  patch({ busy: 'import', error: null, results: [] });
  try {
    const bundle = contentImportPackageSchema.parse(JSON.parse(state.json));
    for (const item of bundle.items) {
      const entry = state.preview.entries.find((candidate) => candidate.key === item.key);
      if (!entry) {
        throw new Error(`Preview ${item.key} before importing.`);
      }
      const result = await applyContentImportItem(bundle.packageKey, item, target, entry.expectedHash);
      dispatch({ kind: 'result', key: item.key, result });
    }
    patch({ preview: null });
  } catch (error) {
    patch({ error: message(error) + ' Completed items are retained. Preview again before retrying.', preview: null });
  } finally {
    patch({ busy: null });
  }
}
async function exportRecord(state: State, dispatch: Dispatch<Event>) {
  const target = destination(state);
  const patch = (update: Partial<State>) => dispatch({ kind: 'patch', patch: update });
  patch({ busy: 'export', error: null, warnings: [] });
  try {
    const result = await exportContentRecord(
      target,
      state.exportKind,
      state.exportSlug.trim(),
      state.exportKind === 'asset' ? state.exportType : undefined
    );
    saveJson(result.package, `${state.exportSlug.trim()}.json`);
    patch({ warnings: result.warnings });
  } catch (error) {
    patch({ error: message(error) });
  } finally {
    patch({ busy: null });
  }
}

function ImportExportPage() {
  const viewer = useSessionViewer();
  const search = Route.useSearch();
  const [state, dispatch] = useReducer(reducer, { ...INITIAL, rulesetSlug: search.ruleset, groupSlug: search.group });
  const target = destination(state);
  const disabled = state.busy !== null;
  const patch = (update: Partial<State>) => dispatch({ kind: 'patch', patch: update });
  return (
    <PageLayout>
      <PageLayout.Header>
        <PageTitle
          title="Import and export"
          subtitle="Move authored content as JSON, with a preview before you write."
        />
      </PageLayout.Header>
      <PageLayout.Content>
        {viewer.kind === 'signed-out' ? (
          <LoginGate action="import or export content" />
        ) : viewer.kind === 'pending' ? (
          <Text>Loading your account...</Text>
        ) : (
          <Stack gap="xl">
            <Section
              title="Destination"
              description={`Signed in as ${viewer.profile.username}. Your usual editing and group permissions apply.`}
            >
              <Surface>
                <Group grow align="start">
                  <TextInput
                    label="Ruleset address"
                    description="The last part of its URL, such as gf9."
                    value={state.rulesetSlug}
                    disabled={disabled}
                    onChange={(event) => dispatch({ kind: 'edit', patch: { rulesetSlug: event.currentTarget.value } })}
                  />
                  <TextInput
                    label="Group address"
                    description="Every imported faction and asset is assigned to this group."
                    value={state.groupSlug}
                    disabled={disabled}
                    onChange={(event) => dispatch({ kind: 'edit', patch: { groupSlug: event.currentTarget.value } })}
                  />
                </Group>
              </Surface>
            </Section>
            {state.error && (
              <Alert title="Could not finish" role="alert">
                {state.error}
              </Alert>
            )}
            <Section
              title="Import a package"
              description="Choose a JSON file or paste its contents. Preview checks the format, destination and proposed changes."
            >
              <Surface>
                <Stack gap="md">
                  <input
                    aria-label="JSON package file"
                    type="file"
                    accept="application/json,.json"
                    disabled={disabled}
                    onChange={async (event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) {
                        dispatch({ kind: 'edit', patch: { json: await file.text() } });
                      }
                    }}
                  />
                  <Textarea
                    label="Package JSON"
                    minRows={8}
                    maxRows={18}
                    autosize
                    value={state.json}
                    disabled={disabled}
                    onChange={(event) => dispatch({ kind: 'edit', patch: { json: event.currentTarget.value } })}
                  />
                  <Group>
                    <Button
                      disabled={disabled || !state.json || !target.rulesetSlug || !target.groupSlug}
                      loading={state.busy === 'preview'}
                      onClick={() => void inspect(state, dispatch)}
                    >
                      Preview import
                    </Button>
                    <Anchor
                      href="https://github.com/ndelangen/dunezone/blob/main/docs/content-imports.md"
                      target="_blank"
                      rel="noreferrer"
                    >
                      JSON format and examples
                    </Anchor>
                  </Group>
                </Stack>
              </Surface>
            </Section>
            {state.preview && (
              <Section
                title="Review the import"
                description={`${state.preview.entries.length} items for ${state.preview.rulesetName}, assigned to ${state.preview.groupName}. New records belong to your signed-in account.`}
              >
                <Surface>
                  <Stack gap="md">
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Item</Table.Th>
                          <Table.Th>Kind</Table.Th>
                          <Table.Th>Action</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {state.preview.entries.map((entry) => (
                          <Table.Tr key={entry.key}>
                            <Table.Td>
                              {entry.name}
                              <Text size="sm">{entry.message}</Text>
                            </Table.Td>
                            <Table.Td>{entry.kind}</Table.Td>
                            <Table.Td>{entry.status}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                    <Text>
                      Import writes one item at a time. New records become public and artwork preparation starts as they
                      are created.
                    </Text>
                    <Button
                      disabled={disabled || state.preview.entries.some((entry) => entry.status === 'conflict')}
                      loading={state.busy === 'import'}
                      onClick={() => void apply(state, dispatch)}
                    >
                      Import reviewed content
                    </Button>
                  </Stack>
                </Surface>
              </Section>
            )}
            {state.results.length > 0 && (
              <Section title={state.busy === 'import' ? 'Importing' : 'Import results'}>
                <Progress
                  aria-label="Import progress"
                  value={state.preview ? (state.results.length / state.preview.entries.length) * 100 : 100}
                />
                <Stack gap="xs">
                  {state.results.map(({ key, result }) => (
                    <Text key={key}>
                      {key}: {result.status}, {result.slug}
                    </Text>
                  ))}
                </Stack>
                <Anchor
                  renderRoot={(props) => (
                    <Link {...props} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: target.rulesetSlug }} />
                  )}
                >
                  Open ruleset
                </Anchor>
              </Section>
            )}
            <Section
              title="Export a record"
              description="Export a saved Rulebook draft, faction or asset for review and editing. The download lists any references that need binding before use elsewhere."
            >
              <Surface>
                <Stack gap="md">
                  <Group grow align="start">
                    <Select
                      label="Record kind"
                      data={[
                        { value: 'rulebook', label: 'Rulebook draft' },
                        { value: 'faction', label: 'Faction' },
                        { value: 'asset', label: 'Asset' },
                      ]}
                      value={state.exportKind}
                      disabled={disabled}
                      onChange={(value) => {
                        if (value) {
                          patch({ exportKind: value as State['exportKind'] });
                        }
                      }}
                    />
                    <TextInput
                      label="Record address"
                      value={state.exportSlug}
                      disabled={disabled}
                      onChange={(event) => patch({ exportSlug: event.currentTarget.value })}
                    />
                    {state.exportKind === 'asset' && (
                      <Select
                        label="Asset type"
                        data={ASSET_TYPE_KEYS.map((value) => ({ value, label: ASSET_TYPES[value].label }))}
                        value={state.exportType}
                        disabled={disabled}
                        onChange={(value) => {
                          if (value) {
                            patch({ exportType: value });
                          }
                        }}
                      />
                    )}
                  </Group>
                  <Button
                    variant="default"
                    disabled={disabled || !state.exportSlug.trim() || !target.rulesetSlug || !target.groupSlug}
                    loading={state.busy === 'export'}
                    onClick={() => void exportRecord(state, dispatch)}
                  >
                    Download JSON
                  </Button>
                  {state.warnings.map((warning) => (
                    <Text key={warning}>{warning}</Text>
                  ))}
                </Stack>
              </Surface>
            </Section>
          </Stack>
        )}
      </PageLayout.Content>
    </PageLayout>
  );
}
