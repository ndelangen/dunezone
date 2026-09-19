import { expect, test } from 'vitest';

import { captureProviderUsage, delta, discoverDatasets, queryNamespace } from './provider-usage.mjs';

const scalar = (name) => ({ kind: 'SCALAR', name, ofType: null });
const list = (name) => ({ kind: 'LIST', name: null, ofType: { kind: 'OBJECT', name, ofType: null } });
const object = (name, fields) => ({ kind: 'OBJECT', name, fields, inputFields: null });
const input = (name, names) => ({
  kind: 'INPUT_OBJECT',
  name,
  fields: null,
  inputFields: names.map((n) => ({ name: n })),
});
const dataset = (name, filterType) => ({
  name,
  type: list(`Account${name}`),
  args: [{ name: 'filter', type: { kind: 'INPUT_OBJECT', name: filterType, ofType: null } }],
});
const aggregate = (name, type) => ({ name, type: { kind: 'OBJECT', name: type, ofType: null }, args: [] });
const schema = {
  types: [
    object('account', [
      dataset('durableObjectsPeriodicGroups', 'PeriodicFilter'),
      dataset('durableObjectsStorageGroups', 'StorageFilter'),
      dataset('durableObjectsInvocationsAdaptiveGroups', 'InvocationsFilter'),
      dataset('durableObjectsSubrequestsAdaptiveGroups', 'SubrequestsFilter'),
    ]),
    object('AccountdurableObjectsPeriodicGroups', [
      aggregate('sum', 'PeriodicSum'),
      aggregate('max', 'PeriodicMax'),
      aggregate('avg', 'PeriodicAvg'),
    ]),
    object('PeriodicSum', [
      { name: 'cpuTime', type: scalar('uint64'), args: [] },
      { name: 'rowsRead', type: scalar('uint64'), args: [] },
    ]),
    object('PeriodicMax', [{ name: 'activeWebsocketConnections', type: scalar('uint64'), args: [] }]),
    object('PeriodicAvg', [{ name: 'sampleInterval', type: scalar('float64'), args: [] }]),
    input('PeriodicFilter', ['namespaceId', 'datetimeMinute_geq', 'datetimeMinute_leq', 'date_geq', 'date_leq']),
    object('AccountdurableObjectsStorageGroups', [aggregate('max', 'StorageMax')]),
    object('StorageMax', [{ name: 'storedBytes', type: scalar('uint64'), args: [] }]),
    input('StorageFilter', ['namespaceId', 'date_geq', 'date_leq']),
    object('AccountdurableObjectsInvocationsAdaptiveGroups', [aggregate('sum', 'InvocationsSum')]),
    object('InvocationsSum', [{ name: 'requests', type: scalar('uint64'), args: [] }]),
    input('InvocationsFilter', ['scriptName', 'datetime_geq', 'datetime_leq']),
    object('AccountdurableObjectsSubrequestsAdaptiveGroups', [aggregate('sum', 'SubrequestsSum')]),
    object('SubrequestsSum', [{ name: 'requests', type: scalar('uint64'), args: [] }]),
    input('SubrequestsFilter', ['namespaceId', 'datetimeHour_geq', 'datetimeHour_leq']),
  ],
};
const data = {
  durableObjectsPeriodicGroups: [
    { sum: { cpuTime: 1500, rowsRead: 20 }, max: { activeWebsocketConnections: 40 } },
    { sum: { cpuTime: 500, rowsRead: 5 }, max: { activeWebsocketConnections: 44 } },
  ],
  durableObjectsStorageGroups: [{ max: { storedBytes: 4096 } }],
  durableObjectsSubrequestsAdaptiveGroups: [{ sum: { requests: 7 } }],
};

function fakeFetch(queries) {
  return async (url, init) => {
    const { query } = JSON.parse(init.body);
    queries.push(query);
    expect(url).toBe('https://api.cloudflare.com/client/v4/graphql');
    expect(init.headers.Authorization).toBe('Bearer token-1');
    const body = query.includes('__schema')
      ? { data: { __schema: schema } }
      : { data: { viewer: { accounts: [data] } } };
    return { status: 200, json: async () => body };
  };
}

const usageOutput = (calls, month) =>
  JSON.stringify({
    metrics: {
      functionCalls: { unit: 'calls', usage: { current_day: calls, current_month: month } },
      databaseBandwidth: { unit: 'bytes', usage: { current_day: 1, current_month: 3000 } },
    },
    seedStatus: 'seeded',
  });

const report = {
  startedAt: '2026-09-20T10:00:30.000Z',
  finishedAt: '2026-09-20T10:06:10.000Z',
  environment: {
    cell: { profile: 'stacked', case: 'trace', repetition: 1, compression: 'on' },
    target: {
      namespaceId: 'ns1',
      backendName: 'determined-crocodile-384',
      project: 'norbert-de-langen:dunezone-play-load',
      reference: 'dev/batch-1',
    },
  },
};

test('datasets are discovered from the schema and queried by namespace inside the window at each filter resolution', async () => {
  const queries = [];
  const fetchFn = fakeFetch(queries);
  const datasets = await discoverDatasets(fetchFn, 'token-1');
  expect(datasets.durableObjectsPeriodicGroups).toEqual({
    aggregates: { sum: ['cpuTime', 'rowsRead'], max: ['activeWebsocketConnections'] },
    filters: ['namespaceId', 'datetimeMinute_geq', 'datetimeMinute_leq', 'date_geq', 'date_leq'],
  });
  const usage = await queryNamespace(
    fetchFn,
    'token-1',
    {
      accountTag: 'acct',
      namespaceId: 'ns1',
      from: new Date('2026-09-20T10:34:00Z'),
      to: new Date('2026-09-20T11:07:00Z'),
    },
    datasets
  );
  expect(queries[1]).toContain('accountTag: "acct"');
  expect(queries[1]).toContain(
    'durableObjectsPeriodicGroups(filter: {namespaceId:"ns1",datetimeMinute_geq:"2026-09-20T10:34:00.000Z",datetimeMinute_leq:"2026-09-20T11:07:00.000Z"}, limit: 1000) { sum { cpuTime rowsRead } max { activeWebsocketConnections } }'
  );
  expect(queries[1]).toContain(
    'durableObjectsStorageGroups(filter: {namespaceId:"ns1",date_geq:"2026-09-20",date_leq:"2026-09-20"}'
  );
  expect(queries[1]).toContain(
    'durableObjectsSubrequestsAdaptiveGroups(filter: {namespaceId:"ns1",datetimeHour_geq:"2026-09-20T10:00:00.000Z",datetimeHour_leq:"2026-09-20T11:00:00.000Z"}'
  );
  expect(queries[1]).not.toContain('durableObjectsInvocationsAdaptiveGroups(');
  expect(queries[1]).not.toContain('avg');
  expect(usage.durableObjectsPeriodicGroups).toEqual({
    rows: 2,
    window: { field: 'datetimeMinute', from: '2026-09-20T10:34:00.000Z', to: '2026-09-20T11:07:00.000Z' },
    sum: { cpuTime: 2000, rowsRead: 25 },
    max: { activeWebsocketConnections: 44 },
  });
  expect(usage.durableObjectsStorageGroups).toEqual({
    rows: 1,
    window: { field: 'date', from: '2026-09-20', to: '2026-09-20' },
    max: { storedBytes: 4096 },
  });
  expect(usage.durableObjectsSubrequestsAdaptiveGroups).toEqual({
    rows: 1,
    window: { field: 'datetimeHour', from: '2026-09-20T10:00:00.000Z', to: '2026-09-20T11:00:00.000Z' },
    sum: { requests: 7 },
  });
  expect(usage.durableObjectsInvocationsAdaptiveGroups.skipped).toContain('scriptName');
});

test('a capture keeps the report window exact and takes the Convex month share from a baseline', async () => {
  const calls = [];
  const execFn = async (file, args, options) => {
    calls.push([file, ...args, options.env.CONVEX_DEPLOY_KEY ?? '']);
    return { stdout: usageOutput(40, 700) };
  };
  const usage = await captureProviderUsage({
    report,
    accountTag: 'acct',
    token: 'token-1',
    fetchFn: fakeFetch([]),
    execFn,
    env: {},
    baseline: JSON.parse(usageOutput(880, 250)),
  });
  expect(calls[0]).toEqual([
    'bunx',
    'convex',
    'deployment',
    'usage',
    '--deployment',
    'norbert-de-langen:dunezone-play-load:dev/batch-1',
    '--json',
    '',
  ]);
  expect(usage.window).toEqual({ from: '2026-09-20T10:00:30.000Z', to: '2026-09-20T10:06:10.000Z' });
  expect(usage.cloudflare.durableObjectsPeriodicGroups.window).toEqual({
    field: 'datetimeMinute',
    from: '2026-09-20T10:00:00.000Z',
    to: '2026-09-20T10:06:00.000Z',
  });
  expect(usage.convex.selection).toBe('norbert-de-langen:dunezone-play-load:dev/batch-1');
  expect(usage.convex.cell).toEqual({
    metrics: {
      functionCalls: { unit: 'calls', usage: { current_month: 450 } },
      databaseBandwidth: { unit: 'bytes', usage: { current_month: 0 } },
    },
    seedStatus: 'seeded',
  });
  expect(usage.cloudflare.durableObjectsPeriodicGroups.sum.cpuTime).toBe(2000);
  const again = await captureProviderUsage({
    report,
    accountTag: 'acct',
    token: 'token-1',
    fetchFn: fakeFetch([]),
    execFn,
    env: { CONVEX_DEPLOY_KEY: 'dev:determined-crocodile-384|abc' },
    baseline: usage,
  });
  expect(calls[1]).toEqual(['bunx', 'convex', 'deployment', 'usage', '--json', 'dev:determined-crocodile-384|abc']);
  expect(again.convex.selection).toBe('deploy key');
  const production = await captureProviderUsage({
    report,
    accountTag: 'acct',
    token: 'token-1',
    fetchFn: fakeFetch([]),
    execFn,
    env: { CONVEX_DEPLOY_KEY: 'prod:determined-crocodile-384|def' },
  });
  expect(calls[2]).toEqual(['bunx', 'convex', 'deployment', 'usage', '--json', 'prod:determined-crocodile-384|def']);
  expect(production.convex.selection).toBe('deploy key');
  const other = await captureProviderUsage({
    report,
    accountTag: 'acct',
    token: 'token-1',
    fetchFn: fakeFetch([]),
    execFn,
    env: { CONVEX_DEPLOY_KEY: 'dev:another-name-999|ghi' },
  });
  expect(calls[3].slice(4, 6)).toEqual(['--deployment', 'norbert-de-langen:dunezone-play-load:dev/batch-1']);
  expect(other.convex.selection).toBe('norbert-de-langen:dunezone-play-load:dev/batch-1');
  expect(again.convex.cell.metrics.functionCalls.usage).toEqual({ current_month: 0 });
  expect(JSON.stringify(again)).not.toContain('abc');
});

test('a report without a hosted namespace or a window is refused', async () => {
  await expect(captureProviderUsage({ report: { environment: {} }, accountTag: 'a', token: 't' })).rejects.toThrow(
    'no hosted namespace'
  );
  await expect(
    captureProviderUsage({ report: { environment: { target: { namespaceId: 'ns1' } } }, accountTag: 'a', token: 't' })
  ).rejects.toThrow('no window');
  expect(delta({ a: 1, b: 'x', current_day: 5 }, { a: 3, b: 'y', c: 2, current_day: 1 })).toEqual({
    a: 2,
    b: 'y',
    c: 2,
  });
});
