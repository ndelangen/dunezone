import { expect, test, vi } from 'vite-plus/test';

import { assertProductionRevision, productionSnapshotRevision } from './production-snapshot-revision';

const sha = 'a'.repeat(40);
const release = (conclusion = 'success', head_sha = sha) =>
  Response.json({ workflow_runs: [{ id: 1, conclusion, head_sha }] });
const deployed = () => Response.json({ jobs: [{ name: 'deploy', conclusion: 'success' }] });
const healthy = (gitSha = sha) => Response.json({ identity: { gitSha } });

const requestWith = (responses: Response[]) => {
  const request = vi.fn<typeof fetch>();
  for (const response of responses) {
    request.mockResolvedValueOnce(response);
  }
  return request;
};

test('pins both Workers and the export code to the latest completed successful release', async () => {
  const request = requestWith([release(), deployed(), healthy(), healthy()]);
  await expect(productionSnapshotRevision('owner/repo', 'test', request)).resolves.toBe(sha);
  expect(request).toHaveBeenCalledTimes(4);
});

test.each([
  [release('failure'), Response.json({ jobs: [{ name: 'deploy', conclusion: 'failure' }] })],
  [release('success', 'not-a-sha')],
  [Response.json({ workflow_runs: [] })],
  [new Response('', { status: 503 })],
  [release(), deployed(), healthy('b'.repeat(40)), healthy()],
  [release(), deployed(), healthy(), healthy('b'.repeat(40))],
  [release(), deployed(), new Response('', { status: 503 }), healthy()],
])('refuses an incomplete, unavailable or mixed release before the export starts', async (...responses) => {
  await expect(productionSnapshotRevision('owner/repo', 'test', requestWith(responses))).rejects.toThrow(
    /dev data was not touched/
  );
});

test('an older release sync cannot replace a newer production revision in dev', async () => {
  await expect(assertProductionRevision(sha, requestWith([healthy('b'.repeat(40)), healthy()]))).rejects.toThrow(
    /do not match/
  );
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

test('ignores a late completed run whose production deployment was skipped', async () => {
  const request = requestWith([
    Response.json({
      workflow_runs: [
        { id: 2, head_sha: 'b'.repeat(40) },
        { id: 1, head_sha: sha },
      ],
    }),
    Response.json({ jobs: [{ name: 'deploy', conclusion: 'skipped' }] }),
    deployed(),
    healthy(),
    healthy(),
  ]);
  await expect(productionSnapshotRevision('owner/repo', 'test', request)).resolves.toBe(sha);
});

test('searches the next page after twenty deliberately skipped deployments', async () => {
  const request = requestWith([
    Response.json({ workflow_runs: Array.from({ length: 20 }, (_, index) => ({ id: index + 2, head_sha: sha })) }),
    ...Array.from({ length: 20 }, () => Response.json({ jobs: [{ name: 'deploy', conclusion: 'skipped' }] })),
    release(),
    deployed(),
    healthy(),
    healthy(),
  ]);
  await expect(productionSnapshotRevision('owner/repo', 'test', request)).resolves.toBe(sha);
  expect(request.mock.calls[21]?.[0]).toContain('&page=2');
});
