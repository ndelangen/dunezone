import { bugReportProgressSchema } from '@shared/play/bugReports';
import type { BugReportRequest } from '@shared/play/bugReports';

import { requestPlayAdmission } from '@db/play';

export class BugReportRejected extends Error {}

/** Reports carry a game-scoped seat pass, never the account's Convex token. */
export async function sendPlayBugReport(
  gameId: string,
  request:
    | Omit<Extract<BugReportRequest, { operation: 'send' }>, 'pass'>
    | Omit<Extract<BugReportRequest, { operation: 'status' }>, 'pass'>
) {
  const admission = await requestPlayAdmission(gameId);
  if (!admission.ok || !('pass' in admission)) {
    throw new Error('Sign in again before sending or checking a report.');
  }
  const response = await fetch(`/__play/games/${encodeURIComponent(gameId)}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...request, pass: admission.pass }),
    signal: AbortSignal.timeout(30_000),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      result !== null && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
        ? result.error
        : 'The report could not be sent. Please try again.';
    if (response.status >= 400 && response.status < 500) {
      throw new BugReportRejected(error);
    }
    throw new Error(error);
  }
  return bugReportProgressSchema.parse(result);
}
