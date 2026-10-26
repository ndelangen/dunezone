import { Alert, Anchor, Button, FileInput, Group, Select, Stack, Table, Tabs, Text } from '@mantine/core';
import { changes } from '@shared/jsonDiff';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { CodeExample } from '@ui/content/CodeExample';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { lazy, Suspense, useReducer, useState } from 'react';

import { pageHead } from '@app/routes/pageTitle';

import { comparableSnapshots, MAX_REPORT_BYTES, parseReport, renderSnapshot } from './report';
import type { Report } from './report';

const ReportTable = lazy(() => import('./ReportTable'));

export const Route = createFileRoute('/_app/admin/game-debugger')({
  head: () => pageHead('Game debugger'),
  component: GameDebugger,
});

type State = { report: Report | null; name: string; error: string | null; section: string; loading: boolean };
type Event =
  | { kind: 'loading'; name: string }
  | { kind: 'loaded'; report: Report }
  | { kind: 'failed'; message: string }
  | { kind: 'section'; section: string }
  | { kind: 'clear' };
const initial: State = { report: null, name: '', error: null, section: 'server.state', loading: false };
function reduce(state: State, event: Event): State {
  switch (event.kind) {
    case 'loading':
      return { ...initial, name: event.name, loading: true };
    case 'loaded':
      return { ...state, report: event.report, loading: false };
    case 'failed':
      return { ...initial, error: event.message };
    case 'section':
      return { ...state, section: event.section };
    case 'clear':
      return initial;
  }
}

function GameDebugger() {
  const [state, dispatch] = useReducer(reduce, initial);
  const { report } = state;
  const load = async (file: File | null) => {
    if (!file) {
      return;
    }
    dispatch({ kind: 'loading', name: file.name });
    if (file.size > MAX_REPORT_BYTES) {
      dispatch({ kind: 'failed', message: 'Choose a report smaller than 20 MB.' });
      return;
    }
    try {
      dispatch({ kind: 'loaded', report: parseReport(await file.text()) });
    } catch (error) {
      dispatch({
        kind: 'failed',
        message:
          error instanceof SyntaxError
            ? 'This file is not valid JSON.'
            : error instanceof Error
              ? error.message
              : 'The report could not be opened.',
      });
    }
  };
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle title="Game debugger" subtitle="Inspect a reported game and the browser that reported it." />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Anchor renderRoot={(props) => <Link {...props} to="/admin" />}>All admin tools</Anchor>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="lg">
          <Surface padding="lg">
            <Stack gap="sm">
              <FileInput
                label="Bug report file"
                description="Download state.json from a reported-bug issue. The file stays in this browser tab and is not uploaded or saved."
                accept="application/json,.json"
                placeholder="Choose a report"
                value={null}
                onChange={(file) => void load(file)}
                disabled={state.loading}
              />
              {state.loading && <Text role="status">Opening {state.name}…</Text>}
              {state.error && (
                <Alert color="negative" title="Cannot open report" role="alert">
                  {state.error}
                </Alert>
              )}
              {report && (
                <Group justify="space-between">
                  <Text>{state.name}</Text>
                  <Button variant="default" onClick={() => dispatch({ kind: 'clear' })}>
                    Close report
                  </Button>
                </Group>
              )}
            </Stack>
          </Surface>
          {report ? (
            <ReportContents
              report={report}
              section={state.section}
              onSection={(section) => dispatch({ kind: 'section', section })}
            />
          ) : (
            <Text c="dimmed">Reports contain hidden game information. Chat message text remains redacted.</Text>
          )}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

function ReportContents({
  report,
  section,
  onSection,
}: {
  report: Report;
  section: string;
  onSection: (section: string) => void;
}) {
  const sections: Record<string, unknown> = {
    'server.state': report.server.state,
    'browser.snapshot': report.browser.snapshot,
    'browser.diagnostics': report.browser.diagnostics,
    'server.captures': report.server.captures,
    'server.activity': report.server.activity,
    'server.conversations': report.server.conversations,
    'browser.conversations': report.browser.conversations,
  };
  const compared = comparableSnapshots(report);
  const differences = compared ? changes(compared.server, compared.browser, 100) : [];
  return (
    <>
      <Section title="Captured game" description={`Game ${report.server.gameId}`}>
        <Text>
          Captured {report.server.capturedAt}. Server revision {summary(report.server.state.revision)}.
        </Text>
        <Text size="sm">Code version: {report.server.gitSha || 'unknown'}</Text>
        <Alert color="caution" title="One captured moment">
          This report does not contain replay checkpoints or a complete action history. Events below describe what
          happened, but selecting one cannot reconstruct the table at that time.
        </Alert>
      </Section>
      <Tabs defaultValue="state" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="table">Table</Tabs.Tab>
          <Tabs.Tab value="state">State</Tabs.Tab>
          <Tabs.Tab value="differences">Server / browser</Tabs.Tab>
          <Tabs.Tab value="events">Game and Audit events</Tabs.Tab>
          <Tabs.Tab value="logs">Browser logs</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="table" pt="md">
          <CapturedTable report={report} />
        </Tabs.Panel>
        <Tabs.Panel value="state" pt="md">
          <Stack gap="md">
            <Select
              label="Inspect"
              data={Object.keys(sections)}
              value={section}
              onChange={(value) => value && onSection(value)}
            />
            <JsonFields value={sections[section]} />
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="differences" pt="md">
          <Stack gap="md">
            <Text>
              Compare shared fields in the saved snapshots. Server-only fields are excluded. Different revisions,
              private projections and capture timing can explain differences.
            </Text>
            {!compared ? (
              <Text>No browser snapshot was captured.</Text>
            ) : !differences.length ? (
              <Text>No differences in shared fields.</Text>
            ) : (
              <>
                <Text>
                  {differences.length === 100
                    ? 'Showing the first 100 differences.'
                    : `${differences.length} differences.`}
                </Text>
                <Table.ScrollContainer minWidth={600}>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Field</Table.Th>
                        <Table.Th>Server</Table.Th>
                        <Table.Th>Browser</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {differences.map((difference) => (
                        <Table.Tr key={difference.path}>
                          <Table.Td>{difference.path}</Table.Td>
                          <Table.Td>{summary(difference.before)}</Table.Td>
                          <Table.Td>{summary(difference.after)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </>
            )}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="events" pt="md">
          <Stack gap="lg">
            {(['game', 'audit'] as const).map((kind) => (
              <Section key={kind} title={kind === 'game' ? 'Game events' : 'Audit events'}>
                {report.server.events[kind].more && (
                  <Text c="dimmed">Earlier events were not included in this report.</Text>
                )}
                {report.server.events[kind].entries.length ? (
                  report.server.events[kind].entries.map((entry, index) => (
                    <Text key={index}>
                      {String(entry.sequence)} · {String(entry.context)} · {String(entry.text)}
                    </Text>
                  ))
                ) : (
                  <Text>No events captured.</Text>
                )}
              </Section>
            ))}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="logs" pt="md">
          <Stack gap="sm">
            <Text>
              {report.browser.logs.length} entries retained. {report.browser.droppedLogs} older or clipped entries.
              Times are relative to browser navigation, not the server event clock.
            </Text>
            {report.browser.logs.map((entry, index) => (
              <CodeExample
                key={index}
                label={`${entry.at} · ${entry.level}`}
                language="json"
                code={JSON.stringify(entry.text)}
              />
            ))}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </>
  );
}

function CapturedTable({ report }: { report: Report }) {
  const [source, select] = useReducer((_: 'server' | 'browser', value: 'server' | 'browser') => value, 'browser');
  const snapshot = renderSnapshot(report, source);
  return (
    <Stack gap="md">
      <Select
        label="Table capture"
        value={source}
        data={[
          { value: 'browser', label: 'Reporting browser' },
          { value: 'server', label: 'Server' },
        ]}
        onChange={(value) => value && select(value as 'server' | 'browser')}
      />
      <Text size="sm">
        A static table preview using the current renderer. Artwork loads from Dune Zone. The original game is never
        connected or changed. Inspect hands and hidden fields in State.
      </Text>
      {snapshot ? (
        <Suspense fallback={<Text role="status">Loading the table renderer…</Text>}>
          <ReportTable key={`${report.server.gameId}:${report.server.capturedAt}:${source}`} snapshot={snapshot} />
        </Suspense>
      ) : (
        <Alert color="caution">
          This capture cannot be rendered with the current schema or contains unsupported artwork addresses. Its data
          remains available in State.
        </Alert>
      )}
    </Stack>
  );
}

function summary(value: unknown) {
  const text = value === undefined ? '(not present)' : JSON.stringify(value);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

function JsonFields({ value }: { value: unknown }) {
  const entries: [string, unknown][] = value && typeof value === 'object' ? Object.entries(value) : [['value', value]];
  return (
    <Stack gap="sm">
      {entries.map(([key, entry]) => (
        <JsonField key={key} label={key} value={entry} />
      ))}
    </Stack>
  );
}

function JsonField({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{label}</summary>
      {open && <JsonValue label={label} value={value} />}
    </details>
  );
}

function JsonValue({ label, value }: { label: string; value: unknown }) {
  const text = JSON.stringify(value, null, 2) ?? 'null';
  return (
    <>
      <CodeExample label={label} language="json" code={text.slice(0, 60_000)} />
      {text.length > 60_000 && (
        <Text size="sm">Display clipped at 60,000 characters. The original file retains the full value.</Text>
      )}
    </>
  );
}
