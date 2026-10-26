import { Anchor, Button, Checkbox, Stack, Text, Textarea } from '@mantine/core';
import { BUG_REPORT_DISCLOSURE, bugReportDescriptionSchema, bugReportDiagnosticsSchema } from '@shared/play/bugReports';
import type { BugReportBrowser, BugReportProgress, BugReportRequest } from '@shared/play/bugReports';
import { censorKnownMessage, censorReportConversations } from '@shared/play/reportConversations';
import { FormError } from '@ui/block/FormError';
import { ControlBlock } from '@ui/control/ControlBlock';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { ReactNode } from 'react';

import { BugReportRejected, sendPlayBugReport } from '@db/playBugReports';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import type { BrowserDiagnostics } from '../browserDiagnostics';

type Draft = {
  description: string;
  acknowledged: boolean;
  requestId: string | null;
  progress: BugReportProgress | null;
  error: string | null;
  sending: boolean;
};
type Event =
  | { type: 'edit'; value: string }
  | { type: 'acknowledge'; value: boolean }
  | { type: 'sending'; requestId: string }
  | { type: 'progress'; progress: BugReportProgress }
  | { type: 'error'; message: string }
  | { type: 'rejected'; message: string }
  | { type: 'reset' };
const initial: Draft = {
  description: '',
  acknowledged: false,
  requestId: null,
  progress: null,
  error: null,
  sending: false,
};
function reduce(draft: Draft, event: Event): Draft {
  switch (event.type) {
    case 'edit':
      return { ...draft, description: event.value, error: null };
    case 'acknowledge':
      return { ...draft, acknowledged: event.value };
    case 'sending':
      return { ...draft, requestId: event.requestId, sending: true, error: null };
    case 'progress':
      return { ...draft, progress: event.progress, sending: false, error: null };
    case 'error':
      return { ...draft, sending: false, error: event.message };
    case 'rejected':
      return { ...draft, requestId: null, progress: null, sending: false, error: event.message };
    case 'reset':
      return initial;
  }
}
const STAGES = {
  collecting: 'Collecting server state and browser diagnostics...',
  creating: 'Creating the GitHub issue...',
  complete: 'Report sent.',
  failed: 'The report could not be sent.',
  uncertain: 'Waiting for GitHub to confirm the issue...',
} as const;

type Submission = Omit<Extract<BugReportRequest, { operation: 'send' }>, 'pass'>;

function collectReport(
  draft: Draft,
  requestId: string,
  table: TableProjection,
  connection: string,
  diagnostics: BrowserDiagnostics,
  pending: Submission | null,
  client: TableSession
): Submission {
  if (draft.requestId && pending) {
    return pending;
  }
  const conversations = client.getSnapshot().conversations;
  const texts = [
    ...Object.values(conversations.pages).flatMap((page) => page.entries.map((entry) => entry.text)),
    ...conversations.pending.map((entry) => entry.request.text),
  ];
  const captured = diagnostics.snapshot();
  const logs = captured.logs.map((entry) => {
    let text = entry.text;
    for (const message of texts) {
      text = censorKnownMessage(text, message);
    }
    return { ...entry, text: text.length <= 8192 ? text : `-redacted log, original length: ${entry.text.length}-` };
  });
  const browser: BugReportBrowser = {
    snapshot: JSON.parse(
      JSON.stringify({
        snapshot: table.snapshot,
        state: table.state,
        playback: table.playback,
        selectedPieceId: table.state.selectedPieceId,
        liveRevision: table.liveRevision,
      })
    ),
    conversations: JSON.parse(JSON.stringify(censorReportConversations(conversations))),
    ...captured,
    logs,
    diagnostics: {
      clientRevision: table.liveRevision,
      connection: bugReportDiagnosticsSchema.shape.connection.parse(connection),
      viewport: [window.innerWidth, window.innerHeight],
      pixelRatio: window.devicePixelRatio,
      language: navigator.language,
      userAgent: navigator.userAgent,
      online: navigator.onLine,
    },
  };
  return { operation: 'send', requestId, description: draft.description, browser };
}

/** The hosted page owns the draft so closing or pinning its compass window does not lose a report in flight. */
export function useBugReport(
  gameId: string,
  client: TableSession,
  table: TableProjection,
  connection: string,
  diagnostics: BrowserDiagnostics
): ReactNode {
  const [draft, dispatch] = useReducer(reduce, initial);
  const busy = useRef(false);
  const pending = useRef<Submission | null>(null);
  const submitted = draft.requestId !== null;
  const valid = bugReportDescriptionSchema.safeParse({ description: draft.description }).success;
  const send = async () => {
    if (busy.current || !draft.acknowledged || !valid) {
      return;
    }
    busy.current = true;
    const requestId = draft.requestId ?? crypto.randomUUID();
    dispatch({ type: 'sending', requestId });
    try {
      pending.current = collectReport(draft, requestId, table, connection, diagnostics, pending.current, client);
      const progress = await sendPlayBugReport(gameId, pending.current);
      dispatch({ type: 'progress', progress });
    } catch (error) {
      /* A lost response may follow an accepted submission. Keep its id and check it instead of sending it twice. */
      dispatch({
        type: error instanceof BugReportRejected ? 'rejected' : 'error',
        message: error instanceof Error ? error.message : 'The report could not be sent.',
      });
    }
    busy.current = false;
  };
  const check = useCallback(async () => {
    if (busy.current || !draft.requestId) {
      return;
    }
    busy.current = true;
    try {
      dispatch({
        type: 'progress',
        progress: await sendPlayBugReport(gameId, { operation: 'status', requestId: draft.requestId }),
      });
    } catch (error) {
      dispatch({ type: 'error', message: error instanceof Error ? error.message : 'Could not check the report.' });
    }
    busy.current = false;
  }, [gameId, draft.requestId]);
  const stage = draft.progress?.stage;
  useEffect(() => {
    if (!draft.requestId || draft.error || stage === 'complete' || stage === 'failed' || stage === 'uncertain') {
      return;
    }
    const timer = window.setInterval(() => {
      void check();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [draft.requestId, draft.error, stage, check]);
  return (
    <Stack gap="md">
      <Text size="sm">{BUG_REPORT_DISCLOSURE}</Text>
      <ControlBlock
        title="What went wrong?"
        input={
          <Textarea
            aria-label="What went wrong?"
            required
            maxLength={8000}
            minRows={5}
            autosize
            description="Describe what happened, what you expected, and how to reproduce it."
            value={draft.description}
            disabled={submitted}
            onChange={(event) => dispatch({ type: 'edit', value: event.currentTarget.value })}
          />
        }
      />
      <Checkbox
        label="I understand this publicly reveals hidden game information to everyone."
        checked={draft.acknowledged}
        disabled={submitted}
        onChange={(event) => dispatch({ type: 'acknowledge', value: event.currentTarget.checked })}
      />
      <Text size="xs" c="dimmed">
        Includes browser logs and errors from this Play visit. The export records any older or clipped entries it had to
        omit.
      </Text>
      {draft.error && <FormError title="Report status">{draft.error}</FormError>}
      {draft.progress && (
        <Text size="sm" role="status">
          {draft.progress.message ?? STAGES[draft.progress.stage]}
        </Text>
      )}
      {stage === 'complete' && draft.progress?.issueUrl ? (
        <Anchor href={draft.progress.issueUrl} target="_blank" rel="noopener noreferrer">
          Open GitHub issue
        </Anchor>
      ) : submitted ? (
        <>
          {!draft.progress && !draft.error && (
            <Text role="status" size="sm">
              Sending report...
            </Text>
          )}
          <Button variant="default" onClick={() => void check()} disabled={draft.sending}>
            Check report status
          </Button>
          {draft.error && !draft.progress && (
            <Button variant="default" onClick={() => void send()}>
              Retry sending report
            </Button>
          )}
        </>
      ) : (
        <Button color="cta" onClick={() => void send()} disabled={!draft.acknowledged || !valid}>
          Send report
        </Button>
      )}
      {(stage === 'complete' || stage === 'failed') && (
        <Button variant="default" onClick={() => dispatch({ type: 'reset' })}>
          Write another report
        </Button>
      )}
    </Stack>
  );
}
