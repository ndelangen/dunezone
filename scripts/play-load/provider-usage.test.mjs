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
const schema = {
  types: [
    object('account', [
      dataset('durableObjectsPeriodicGroups', 'PeriodicFilter'),
      dataset('durableObjectsStorageGroups', 'StorageFilter'),
      dataset('durableObjectsInvocationsAdaptiveGroups', 'InvocationsFilter'),
    ]),
    object('AccountdurableObjectsPeriodicGroups', [
      { name: 'sum', type: { kind: 'OBJECT', name: 'PeriodicSum', ofType: null }, args: [] },
      { name: 'max', type: { kind: 'OBJECT', name: 'PeriodicMax', ofType: null }, args: [] },
    ]),
    object('PeriodicSum', [
      { name: 'cpuTime', type: scalar('uint64'), args: [] },
      { name: 'rowsRead', type: scalar('uint64'), args: [] },
    ]),
    object('PeriodicMax', [{ name: 'activeWebsocketConnections', type: scalar('uint64'), args: [] }]),
    input('PeriodicFilter', ['namespaceId', 'datetimeMinute_geq', 'datetimeMinute_leq', 'date_geq', 'date_leq']),
    object('AccountdurableObjectsStorageGroups', [
      { name: 'max', type: { kind: 'OBJECT', name: 'StorageMax', ofType: null }, args: [] },
    ]),
    object('StorageMax', [{ name: 'storedBytes', type: scalar('uint64'), args: [] }]),
    input('StorageFilter', ['namespaceId', 'date_geq', 'date_leq']),
    object('AccountdurableObjectsInvocationsAdaptiveGroups', [
      { name: 'sum', type: { kind: 'OBJECT', name: 'InvocationsSum', ofType: null }, args: [] },
    ]),
    object('InvocationsSum', [{ name: 'requests', type: scalar('uint64'), args: [] }]),
    input('InvocationsFilter', ['scriptName', 'datetime_geq', 'datetime_leq']),
  ],
};
const data = {
  durableObjectsPeriodicGroups: [
    { sum: { cpuTime: 1500, rowsRead: 20 }, max: { activeWebsocketConnections: 40 } },
    { sum: { cpuTime: 500, rowsRead: 5 }, max: { activeWebsocketConnections: 44 } },
  ],
  durableObjectsStorageGroups: [{ max: { storedBytes: 4096 } }],
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

test('datasets are discovered from the schema and queried by namespace inside the window', async () => {
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
      from: new Date('2026-09-20T10:00:00Z'),
      to: new Date('2026-09-20T10:07:00Z'),
    },
    datasets
  );
  expect(queries[1]).toContain('accountTag: "acct"');
  expect(queries[1]).toContain(
    'durableObjectsPeriodicGroups(filter: {namespaceId:"ns1",datetimeMinute_geq:"2026-09-20T10:00:00.000Z",datetimeMinute_leq:"2026-09-20T10:07:00.000Z"}, limit: 1000) { sum { cpuTime rowsRead } max { activeWebsocketConnections } }'
  );
  expect(queries[1]).toContain(
    'durableObjectsStorageGroups(filter: {namespaceId:"ns1",date_geq:"2026-09-20",date_leq:"2026-09-20"}'
  );
  expect(queries[1]).not.toContain('durableObjectsInvocationsAdaptiveGroups(');
  expect(usage.durableObjectsPeriodicGroups).toEqual({
    rows: 2,
    window: 'datetimeMinute',
    sum: { cpuTime: 2000, rowsRead: 25 },
    max: { activeWebsocketConnections: 44 },
  });
  expect(usage.durableObjectsStorageGroups).toEqual({ rows: 1, window: 'date', max: { storedBytes: 4096 } });
  expect(usage.durableObjectsInvocationsAdaptiveGroups.skipped).toContain('scriptName');
});

test('a capture rounds the report window outward to whole minutes and takes the Convex share from a baseline', async () => {
  const report = {
    startedAt: '2026-09-20T10:00:30.000Z',
    finishedAt: '2026-09-20T10:06:10.000Z',
    environment: {
      cell: { profile: 'stacked', case: 'trace', repetition: 1, compression: 'on' },
      target: { namespaceId: 'ns1', project: 'norbert-de-langen:dunezone-play-load', reference: 'dev/batch-1' },
    },
  };
  const calls = [];
  const execFn = async (file, args) => {
    calls.push([file, ...args]);
    return { stdout: JSON.stringify({ month: { functionCalls: 700, databaseBandwidthBytes: 3000 }, plan: 'starter' }) };
  };
  const usage = await captureProviderUsage({
    report,
    accountTag: 'acct',
    token: 'token-1',
    fetchFn: fakeFetch([]),
    execFn,
    baseline: { month: { functionCalls: 250, databaseBandwidthBytes: 1000 }, plan: 'starter' },
  });
  expect(calls[0]).toEqual([
    'bunx',
    'convex',
    'deployment',
    'usage',
    '--deployment',
    'norbert-de-langen:dunezone-play-load:dev/batch-1',
    '--json',
  ]);
  expect(usage.window).toEqual({ from: '2026-09-20T10:00:00.000Z', to: '2026-09-20T10:07:00.000Z' });
  expect(usage.convex.cell).toEqual({ month: { functionCalls: 450, databaseBandwidthBytes: 2000 }, plan: 'starter' });
  expect(usage.cloudflare.durableObjectsPeriodicGroups.sum.cpuTime).toBe(2000);
  const again = await captureProviderUsage({
    report,
    accountTag: 'acct',
    token: 'token-1',
    fetchFn: fakeFetch([]),
    execFn,
    baseline: usage,
  });
  expect(again.convex.cell.month.functionCalls).toBe(0);
});

test('a report without a hosted namespace or a window is refused', async () => {
  await expect(captureProviderUsage({ report: { environment: {} }, accountTag: 'a', token: 't' })).rejects.toThrow(
    'no hosted namespace'
  );
  await expect(
    captureProviderUsage({ report: { environment: { target: { namespaceId: 'ns1' } } }, accountTag: 'a', token: 't' })
  ).rejects.toThrow('no window');
  expect(delta({ a: 1, b: 'x' }, { a: 3, b: 'y', c: 2 })).toEqual({ a: 2, b: 'y', c: 2 });
});
