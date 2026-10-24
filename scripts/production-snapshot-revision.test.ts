import { expect, test, vi } from 'vite-plus/test';

import { assertProductionRevision, productionSnapshotRevision } from './production-snapshot-revision';

const sha = 'a'.repeat(40);
const release = (conclusion = 'success', head_sha = sha) =>
  Response.json({ workflow_runs: [{ conclusion, head_sha }] });
const healthy = (gitSha = sha) => Response.json({ identity: { gitSha } });

const requestWith = (responses: Response[]) => {
  const request = vi.fn<typeof fetch>();
  for (const response of responses) {
    request.mockResolvedValueOnce(response);
  }
  return request;
};

test('pins both Workers and the export code to the latest completed successful release', async () => {
  const request = requestWith([release(), healthy(), healthy()]);
  await expect(productionSnapshotRevision('owner/repo', 'test', request)).resolves.toBe(sha);
  expect(request).toHaveBeenCalledTimes(3);
});

test.each([
  [release('failure')],
  [release('success', 'not-a-sha')],
  [Response.json({ workflow_runs: [] })],
  [new Response('', { status: 503 })],
  [release(), healthy('b'.repeat(40))],
  [release(), healthy(), healthy('b'.repeat(40))],
  [release(), new Response('', { status: 503 })],
])('refuses an incomplete, unavailable or mixed release before the export starts', async (...responses) => {
  await expect(productionSnapshotRevision('owner/repo', 'test', requestWith(responses))).rejects.toThrow(
    /dev data was not touched/
  );
});

test('an older release sync cannot replace a newer production revision in dev', async () => {
  await expect(assertProductionRevision(sha, requestWith([healthy('b'.repeat(40))]))).rejects.toThrow(/do not match/);
  await expect(assertProductionRevision(sha, requestWith([healthy(), healthy()]))).resolves.toBeUndefined();
});

test('a failed dev sync still permits weekly recovery when the production deploy succeeded', async () => {
  const request = requestWith([
    Response.json({ workflow_runs: [{ id: 1, conclusion: 'failure', head_sha: sha }] }),
    Response.json({
      jobs: [
        { name: 'deploy', conclusion: 'success' },
        { name: 'dev_rebuild / rebuild', conclusion: 'failure' },
      ],
    }),
    healthy(),
    healthy(),
  ]);
  await expect(productionSnapshotRevision('owner/repo', 'test', request)).resolves.toBe(sha);
});
