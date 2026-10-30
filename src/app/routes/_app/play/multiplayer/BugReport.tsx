import { Anchor, Button, Checkbox, Stack, Text, Textarea } from '@mantine/core';
import { BUG_REPORT_DISCLOSURE, bugReportDescriptionSchema, bugReportDiagnosticsSchema } from '@shared/play/bugReports';
import type { BugReportBrowser, BugReportProgress, BugReportRequest } from '@shared/play/bugReports';
import { FormError } from '@ui/block/FormError';
import { ControlBlock } from '@ui/control/ControlBlock';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { Dispatch, ReactNode } from 'react';

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

type ReportContext = {
  gameId: string;
  client: TableSession;
  table: TableProjection;
  connection: string;
  diagnostics: BrowserDiagnostics;
};

function collectReport(context: ReportContext, description: string, requestId: string): Submission {
  const { client, table, connection, diagnostics } = context;
  const conversations = client.getSnapshot().conversations;
  const captured = diagnostics.snapshot();
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
    conversations: JSON.parse(JSON.stringify(conversations)),
    ...captured,
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
  return { operation: 'send', requestId, description, browser };
}

class ReportSubmission {
  private busy = false;
  private pending: Submission | null = null;

  async send(context: ReportContext, draft: Draft, dispatch: Dispatch<Event>) {
    if (this.busy || !canSend(draft)) {
      return;
    }
    this.busy = true;
    const requestId = draft.requestId ?? crypto.randomUUID();
    dispatch({ type: 'sending', requestId });
    try {
      if (!draft.requestId) {
        this.pending = null;
      }
      this.pending ??= collectReport(context, draft.description, requestId);
      const progress = await sendPlayBugReport(context.gameId, this.pending);
      dispatch({ type: 'progress', progress });
    } catch (error) {
      /* Keep an ambiguous submission's id so a retry cannot create a second issue. */
      dispatch(submissionError(error));
    }
    this.busy = false;
  }

  async check(gameId: string, requestId: string | null, dispatch: Dispatch<Event>) {
    if (this.busy || !requestId) {
      return;
    }
    this.busy = true;
    try {
      const progress = await sendPlayBugReport(gameId, { operation: 'status', requestId });
      dispatch({ type: 'progress', progress });
    } catch (error) {
      dispatch({ type: 'error', message: reportErrorMessage(error, 'Could not check the report.') });
    }
    this.busy = false;
  }
}

function canSend(draft: Draft) {
  return draft.acknowledged && bugReportDescriptionSchema.safeParse({ description: draft.description }).success;
}

function reportErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function submissionError(error: unknown): Event {
  return {
    type: error instanceof BugReportRejected ? 'rejected' : 'error',
    message: reportErrorMessage(error, 'The report could not be sent.'),
  };
}

function shouldPoll(draft: Draft) {
  if (!draft.requestId || draft.error) {
    return false;
  }
  return !new Set(['complete', 'failed', 'uncertain']).has(draft.progress?.stage ?? '');
}

type ReportFormProps = {
  draft: Draft;
  dispatch: Dispatch<Event>;
  send: () => void;
  check: () => void;
};

/** The hosted page owns the draft so closing or pinning its compass window does not lose a report in flight. */
export function useBugReport(context: ReportContext): ReactNode {
  const [draft, dispatch] = useReducer(reduce, initial);
  const submission = useRef(new ReportSubmission());
  const check = useCallback(async () => {
    await submission.current.check(context.gameId, draft.requestId, dispatch);
  }, [context.gameId, draft.requestId]);
  const polling = shouldPoll(draft);
  useEffect(() => {
    if (!polling) {
      return;
    }
    const timer = window.setInterval(() => {
      void check();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [polling, check]);
  return (
    <ReportForm
      draft={draft}
      dispatch={dispatch}
      send={() => void submission.current.send(context, draft, dispatch)}
      check={() => void check()}
    />
  );
}

function ReportForm({ draft, dispatch, send, check }: ReportFormProps) {
  const submitted = draft.requestId !== null;
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
      <ReportActions draft={draft} dispatch={dispatch} send={send} check={check} />
    </Stack>
  );
}

function ReportActions({ draft, dispatch, send, check }: ReportFormProps) {
  const stage = draft.progress?.stage;
  return (
    <>
      {stage === 'complete' && draft.progress?.issueUrl ? (
        <Anchor href={draft.progress.issueUrl} target="_blank" rel="noopener noreferrer">
          Open GitHub issue
        </Anchor>
      ) : draft.requestId !== null ? (
        <SubmittedActions draft={draft} check={check} send={send} />
      ) : (
        <Button color="cta" onClick={send} disabled={!canSend(draft)}>
          Send report
        </Button>
      )}
      {(stage === 'complete' || stage === 'failed') && (
        <Button variant="default" onClick={() => dispatch({ type: 'reset' })}>
          Write another report
        </Button>
      )}
    </>
  );
}

function SubmittedActions({ draft, send, check }: Omit<ReportFormProps, 'dispatch'>) {
  return (
    <>
      {!draft.progress && !draft.error && (
        <Text role="status" size="sm">
          Sending report...
        </Text>
      )}
      <Button variant="default" onClick={check} disabled={draft.sending}>
        Check report status
      </Button>
      {draft.error && !draft.progress && (
        <Button variant="default" onClick={send}>
          Retry sending report
        </Button>
      )}
    </>
  );
}
