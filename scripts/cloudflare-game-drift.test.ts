import { expect, test } from 'vitest';

import { checkGameWorkerLiveDrift } from './cloudflare-live-drift';

const namespaceId = '1234567890abcdef1234567890abcdef';
const gitSha = '0123456789abcdef0123456789abcdef01234567';

type GameApiOptions = {
  sqlite?: boolean;
  route?: boolean;
  public?: boolean;
  extraBinding?: boolean;
  namespaceId?: string;
  owner?: string;
  namespacePages?: number;
  bindingName?: unknown;
  flags?: readonly unknown[];
};

function gameSettings(options: GameApiOptions) {
  return {
    bindings: [
      { name: options.bindingName ?? 'GAME_ROOMS', type: 'durable_object_namespace', namespace_id: namespaceId },
      { name: 'CF_VERSION_METADATA', type: 'version_metadata' },
      { name: 'CONVEX_URL', type: 'plain_text', text: 'https://exuberant-finch-263.eu-west-1.convex.cloud' },
      { name: 'APPLICATION_ORIGIN', type: 'plain_text', text: 'https://dune.zone' },
      { name: 'GIT_SHA', type: 'plain_text', text: gitSha },
      ...(options.extraBinding ? [{ name: 'EXTRA_SECRET', type: 'secret_text' }] : []),
    ],
    compatibility_date: '2026-08-11',
    compatibility_flags: options.flags ?? ['nodejs_compat'],
    limits: { cpu_ms: 30_000 },
  };
}

function namespacePage(url: URL, options: GameApiOptions) {
  if (Number(url.searchParams.get('page')) !== (options.namespacePages ?? 1)) {
    return [];
  }
  return [
    {
      id: options.namespaceId ?? namespaceId,
      class: 'GameRoom',
      script: options.owner ?? 'dunezone-game',
      use_sqlite: options.sqlite ?? true,
    },
  ];
}

function gameApi(options: GameApiOptions = {}) {
  const requests: string[] = [];
  const authorization: Array<string | null> = [];
  return {
    requests,
    authorization,
    fetcher: async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      requests.push(`${init?.method ?? 'GET'} ${url.pathname}`);
      authorization.push(new Headers(init?.headers).get('Authorization'));
      const responses: Record<string, () => unknown> = {
        settings: () => gameSettings(options),
        secrets: () => [],
        domains: () => [],
        routes: () => (options.route ? [{ pattern: 'other.example/*' }] : []),
        schedules: () => ({ schedules: [] }),
        subdomain: () => ({ enabled: options.public ?? false, previews_enabled: false }),
        namespaces: () => namespacePage(url, options),
      };
      const answer = responses[url.pathname.split('/').at(-1)!];
      if (!answer) {
        throw new Error(`Unexpected API request: ${url.pathname}`);
      }
      return Response.json({
        success: true,
        result: answer(),
        result_info: { total_pages: options.namespacePages ?? 1 },
      });
    },
  };
}

test('the game audit verifies the bound SQLite namespace and all external ingress with authenticated GETs', async () => {
  const api = gameApi();
  await expect(
    checkGameWorkerLiveDrift({
      accountId: namespaceId,
      apiToken: 'read-only-test-token',
      fetcher: api.fetcher,
    })
  ).resolves.toEqual({ worker: 'dunezone-game', namespaceId, bindingCount: 5 });
  expect(api.requests).toHaveLength(7);
  expect(api.requests.every((request) => request.startsWith('GET '))).toBe(true);
  expect(api.authorization.every((value) => value === 'Bearer read-only-test-token')).toBe(true);
  expect(api.requests).toContain(
    `GET /client/v4/accounts/${namespaceId}/workers/services/dunezone-game/environments/production/routes`
  );
});

test.each([
  [{ sqlite: false }, /SQLite/],
  [{ route: true }, /routes/],
  [{ public: true }, /workers.dev/],
  [{ extraBinding: true }, /bindings/],
  [{ namespaceId: 'a'.repeat(32) }, /namespace/],
  [{ owner: 'other-worker' }, /owned/],
  [{ bindingName: {} }, /only strings/],
  [{ flags: [{}] }, /only strings/],
] as const)('the game audit refuses live contract drift %j', async (options, error) => {
  const api = gameApi(options);
  await expect(
    checkGameWorkerLiveDrift({
      accountId: namespaceId,
      apiToken: 'read-only-test-token',
      fetcher: api.fetcher,
    })
  ).rejects.toThrow(error);
});

test('the game audit reads the full namespace inventory before identifying the bound class', async () => {
  const api = gameApi({ namespacePages: 2 });
  await expect(
    checkGameWorkerLiveDrift({
      accountId: namespaceId,
      apiToken: 'read-only-test-token',
      fetcher: api.fetcher,
    })
  ).resolves.toMatchObject({ namespaceId });
  expect(api.requests.filter((request) => request.endsWith('/namespaces'))).toHaveLength(2);
});
