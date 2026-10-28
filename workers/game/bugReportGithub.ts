import { Buffer } from 'node:buffer';
import { createPrivateKey, sign } from 'node:crypto';

import { z } from 'zod';

import { BUG_REPORT_LABEL, BUG_REPORT_REPOSITORY } from '../../src/shared/play/bugReports';
import { redactReportText } from '../../src/shared/play/reportRedaction';

export type BugReportSecrets = {
  BUG_REPORT_GITHUB_APP_ID?: string;
  BUG_REPORT_GITHUB_INSTALLATION_ID?: string;
  BUG_REPORT_GITHUB_PRIVATE_KEY?: string;
};

const issueSchema = z.object({
  html_url: z.string().regex(/^https:\/\/github\.com\/ndelangen\/dunezone\/issues\/\d+$/u),
  labels: z.array(z.object({ name: z.string() })),
  body: z.string().nullable(),
});
const tokenSchema = z.object({ token: z.string().min(1) });
const apiRoot = 'https://api.github.com';

async function github(path: string, token: string, body?: unknown) {
  return await fetch(`${apiRoot}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2026-03-10',
      'User-Agent': 'DuneZone-Play-bug-reports',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
}

export function bugReportConfigured(env: BugReportSecrets) {
  return Boolean(
    env.BUG_REPORT_GITHUB_APP_ID && env.BUG_REPORT_GITHUB_INSTALLATION_ID && env.BUG_REPORT_GITHUB_PRIVATE_KEY
  );
}

export async function bugReportInstallationToken(env: BugReportSecrets): Promise<string> {
  if (!bugReportConfigured(env)) {
    throw new Error('Bug reporting is not configured.');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 240, iss: env.BUG_REPORT_GITHUB_APP_ID })
  ).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(unsigned),
    createPrivateKey(env.BUG_REPORT_GITHUB_PRIVATE_KEY!)
  ).toString('base64url');
  const response = await github(
    `/app/installations/${encodeURIComponent(env.BUG_REPORT_GITHUB_INSTALLATION_ID!)}/access_tokens`,
    `${unsigned}.${signature}`,
    {
      repositories: ['dunezone'],
      permissions: { issues: 'write' },
    }
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('GitHub authentication failed.');
  }
  return tokenSchema.parse(await response.json()).token;
}

export const reportMarker = (requestId: string) => `<!-- dunezone-play-report:${requestId} -->`;

/** GitHub refused the request without creating an issue; a new report is safe. */
export class BugReportIssueRejected extends Error {}

/** Once this request starts, a lost answer is ambiguous; callers must reconcile it rather than repeat the POST. */
export async function createBugReportIssue(token: string, title: string, body: string) {
  const response = await github(`/repos/${BUG_REPORT_REPOSITORY}/issues`, token, {
    title: `[Play] ${redactReportText(title).replaceAll('@', ' ').replaceAll(/\s+/gu, ' ').trim().slice(0, 120)}`,
    body,
    labels: [BUG_REPORT_LABEL],
  });
  if (!response.ok) {
    await response.body?.cancel();
    /* A timeout or server error can follow a successful write. Explicit client rejections cannot. */
    if (response.status >= 400 && response.status < 500 && response.status !== 408) {
      throw new BugReportIssueRejected('GitHub rejected the report.');
    }
    throw new Error('GitHub did not confirm the issue.');
  }
  const issue = issueSchema.parse(await response.json());
  if (!issue.labels.some((label) => label.name === BUG_REPORT_LABEL)) {
    throw new Error('GitHub did not confirm the report label.');
  }
  return issue.html_url;
}

export async function findBugReportIssue(token: string, requestId: string, since: number) {
  const response = await github(
    `/repos/${BUG_REPORT_REPOSITORY}/issues?state=all&labels=${BUG_REPORT_LABEL}&since=${encodeURIComponent(new Date(since).toISOString())}&per_page=100&sort=created&direction=desc`,
    token
  );
  if (!response.ok) {
    await response.body?.cancel();
    return null;
  }
  const issues = z.array(issueSchema).parse(await response.json());
  return issues.find((issue) => issue.body?.includes(reportMarker(requestId)))?.html_url ?? null;
}
