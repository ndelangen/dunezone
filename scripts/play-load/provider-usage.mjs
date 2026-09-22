import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

/**
 * Captures the providers' own counters for one hosted cell beside its report.
 * Cloudflare's analytics answer for the game namespace over the cell's window;
 * Convex answers with the deployment's usage so far, so a baseline capture turns it into the cell's share.
 * The Cloudflare fields come from the API's schema at capture time: the record lists what the provider offered, not what this script expected.
 */

const GRAPHQL = 'https://api.cloudflare.com/client/v4/graphql';
const DATASETS = [
  'durableObjectsInvocationsAdaptiveGroups',
  'durableObjectsPeriodicGroups',
  'durableObjectsStorageGroups',
  'durableObjectsSqlStorageGroups',
  'durableObjectsSubrequestsAdaptiveGroups',
];
const AGGREGATES = ['sum', 'max'];
/* Window filters in order of preference, with the width of the bucket each one compares, in minutes. */
const WINDOW_FIELDS = [
  ['datetime', 0],
  ['datetimeMinute', 1],
  ['datetimeFiveMinutes', 5],
  ['datetimeFifteenMinutes', 15],
  ['datetimeHour', 60],
  ['date', 24 * 60],
];
const INTROSPECTION = `{
  __schema {
    types {
      name
      kind
      fields {
        name
        type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
        args { name type { kind name ofType { kind name } } }
      }
      inputFields { name }
    }
  }
}`;

const unwrap = (type) => (type?.ofType ? unwrap(type.ofType) : type);

async function graphql(fetchFn, token, query, variables) {
  const response = await fetchFn(GRAPHQL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(60_000),
  });
  assert.equal(response.status, 200, `Cloudflare analytics answered ${response.status}.`);
  const body = await response.json();
  assert.ok(!body.errors?.length, `Cloudflare analytics refused the query: ${JSON.stringify(body.errors)}`);
  return body.data;
}

const fieldNames = (types, type) =>
  types
    .get(unwrap(type)?.name)
    ?.fields?.filter((entry) => /^(u?int(32|64)?|float(32|64)?|Int|Float)$/.test(unwrap(entry.type)?.name))
    .map((entry) => entry.name) ?? [];

/** The aggregate groups a dataset row offers, each with its field names. */
function aggregateNames(types, rowType) {
  const aggregates = {};
  for (const aggregate of AGGREGATES) {
    const names = fieldNames(types, rowType?.fields?.find((candidate) => candidate.name === aggregate)?.type);
    if (names.length) {
      aggregates[aggregate] = names;
    }
  }
  return aggregates;
}

/** The aggregate groups a dataset row offers and the names its filter accepts. */
function datasetShape(types, field) {
  const filterType = unwrap(field.args?.find((arg) => arg.name === 'filter')?.type);
  return {
    aggregates: aggregateNames(types, types.get(unwrap(field.type).name)),
    filters: types.get(filterType?.name)?.inputFields?.map((entry) => entry.name) ?? [],
  };
}

/** Reads each dataset's aggregate fields and filter names from the live schema. */
export async function discoverDatasets(fetchFn, token) {
  const { __schema: schema } = await graphql(fetchFn, token, INTROSPECTION);
  const types = new Map(schema.types.map((type) => [type.name, type]));
  const account = schema.types.find((type) =>
    type.fields?.some((field) => field.name === DATASETS[1] && field.args?.some((arg) => arg.name === 'filter'))
  );
  assert.ok(account, 'The schema exposes no Durable Objects datasets to this token.');
  const shapes = {};
  for (const dataset of DATASETS) {
    const field = account.fields.find((entry) => entry.name === dataset);
    if (field) {
      shapes[dataset] = datasetShape(types, field);
    }
  }
  return shapes;
}

/** A bucketed filter compares bucket starts, so both bounds move down to the start of their bucket. */
function bounds(width, from, to) {
  if (!width) {
    return { from: from.toISOString(), to: to.toISOString() };
  }
  const bucket = (date) => new Date(Math.floor(date.getTime() / (width * 60_000)) * width * 60_000);
  const value = (date) => (width >= 24 * 60 ? date.toISOString().slice(0, 10) : date.toISOString());
  return { from: value(bucket(from)), to: value(bucket(to)) };
}

/** A dataset is queried only when its filter names the namespace and a window at some resolution. */
function selection(dataset, { aggregates, filters }, { namespaceId, from, to }) {
  const window = WINDOW_FIELDS.find(([name]) => filters.includes(`${name}_geq`) && filters.includes(`${name}_leq`));
  if (!window || !filters.includes('namespaceId') || !Object.keys(aggregates).length) {
    return {
      skipped: `The filter offers ${filters.join(', ') || 'nothing'} and the row ${Object.keys(aggregates).join(', ') || 'nothing'}.`,
    };
  }
  const [field, width] = window;
  const range = bounds(width, from, to);
  const filter = JSON.stringify({ namespaceId, [`${field}_geq`]: range.from, [`${field}_leq`]: range.to }).replaceAll(
    /"([A-Za-z_]+)":/g,
    '$1:'
  );
  const body = Object.entries(aggregates)
    .map(([aggregate, names]) => `${aggregate} { ${names.join(' ')} }`)
    .join(' ');
  return { window: { field, ...range }, query: `${dataset}(filter: ${filter}, limit: 1000) { ${body} }` };
}

/** Sums every sum field and keeps the largest max field of every dataset for the namespace inside the window. */
export async function queryNamespace(fetchFn, token, { accountTag, namespaceId, from, to }, datasets) {
  const selections = Object.fromEntries(
    Object.entries(datasets).map(([dataset, shape]) => [dataset, selection(dataset, shape, { namespaceId, from, to })])
  );
  const queries = Object.values(selections).flatMap((entry) => (entry.query ? [entry.query] : []));
  const data = queries.length
    ? await graphql(
        fetchFn,
        token,
        `{ viewer { accounts(filter: { accountTag: "${accountTag}" }) { ${queries.join(' ')} } } }`
      )
    : { viewer: { accounts: [] } };
  const [account] = data.viewer.accounts;
  return Object.fromEntries(
    Object.entries(selections).map(([dataset, entry]) => {
      if (!entry.query) {
        return [dataset, entry];
      }
      const rows = account?.[dataset] ?? [];
      const totals = {};
      for (const row of rows) {
        for (const [aggregate, values] of Object.entries(row)) {
          const target = (totals[aggregate] ??= {});
          for (const [name, value] of Object.entries(values)) {
            target[name] = aggregate === 'max' ? Math.max(target[name] ?? 0, value) : (target[name] ?? 0) + value;
          }
        }
      }
      return [dataset, { rows: rows.length, window: entry.window, ...totals }];
    })
  );
}

/**
 * The deployment's usage so far today and this month, as the CLI prints it.
 * With the isolated deploy key loaded the CLI resolves the deployment from the key and refuses a reference;
 * without it the reference needs an account login.
 */
async function convexUsage(execFn, target, env) {
  const key = env.CONVEX_DEPLOY_KEY ?? '';
  const selected = ['dev', 'prod'].some((kind) => key.startsWith(`${kind}:${target.backendName}|`));
  const reference = `${target.project}:${target.reference}`;
  const { stdout } = await execFn(
    'bunx',
    ['convex', 'deployment', 'usage', ...(selected ? [] : ['--deployment', reference]), '--json'],
    { timeout: 60_000, maxBuffer: 1024 * 1024, env }
  );
  return { selection: selected ? 'deploy key' : reference, current: JSON.parse(stdout) };
}

/**
 * Subtracts numeric leaves of a baseline capture from the current one, leaving other values as they are.
 * A day counter resets at the deployment's midnight between two captures, so only month counters make a share.
 */
export function delta(baseline, current) {
  if (typeof current === 'number' && typeof baseline === 'number') {
    return current - baseline;
  }
  if (current !== null && typeof current === 'object' && baseline !== null && typeof baseline === 'object') {
    return Object.fromEntries(
      Object.entries(current)
        .filter(([key]) => key !== 'current_day')
        .map(([key, value]) => [key, delta(baseline[key], value)])
    );
  }
  return current;
}

/** A baseline is an earlier capture of this script or the CLI's own usage output. */
const previous = (baseline) => baseline.convex?.current ?? baseline;

export async function captureProviderUsage({
  report,
  accountTag,
  token,
  baseline,
  fetchFn = fetch,
  execFn,
  env = process.env,
}) {
  const target = report.environment?.target;
  assert.ok(target?.namespaceId, 'The report names no hosted namespace.');
  assert.ok(report.startedAt && report.finishedAt, 'The report has no window.');
  const from = new Date(report.startedAt);
  const to = new Date(report.finishedAt);
  const datasets = await discoverDatasets(fetchFn, token);
  const cloudflare = await queryNamespace(
    fetchFn,
    token,
    { accountTag, namespaceId: target.namespaceId, from, to },
    datasets
  );
  const convex = await convexUsage(execFn ?? promisify(execFile), target, env);
  return {
    capturedAt: new Date().toISOString(),
    cell: report.environment.cell,
    window: { from: from.toISOString(), to: to.toISOString() },
    namespaceId: target.namespaceId,
    deployment: `${target.project}:${target.reference}`,
    cloudflare,
    convex: {
      ...convex,
      ...(baseline ? { baseline: previous(baseline), cell: delta(previous(baseline), convex.current) } : {}),
    },
    limitation:
      'Cloudflare rows are the namespace analytics inside the cell window, each dataset at the resolution its filter offers with both bounds moved to the start of their bucket; Convex figures are the deployment so far, and the cell share is the month counters less the baseline capture.',
  };
}

/**
 * Reports and captures live under the checkout's report tree, so an argument is the name of an entry there and nothing else.
 * A directory name yields its capture file when a file is wanted, so the previous cell's directory serves as the baseline.
 */
export async function reportPath(requested, kind, root = path.resolve('test-results/play-load')) {
  const name = path.basename(requested);
  assert.ok(name && name !== '.' && name !== '..', 'Name an entry of test-results/play-load.');
  const entry = path.join(root, name);
  const found = await stat(entry);
  if (kind === 'directory') {
    assert.ok(found.isDirectory(), `${name} is not a report directory.`);
    return entry;
  }
  return found.isDirectory() ? path.join(entry, 'provider-usage.json') : entry;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { report: { type: 'string' }, account: { type: 'string' }, baseline: { type: 'string' } },
  });
  assert.ok(values.report, 'Pass --report DIR with a hosted report.json under test-results/play-load.');
  const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN;
  const accountTag = values.account ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  assert.ok(token, 'CLOUDFLARE_ANALYTICS_TOKEN must hold a read-only analytics token.');
  assert.ok(accountTag, 'Pass --account or set CLOUDFLARE_ACCOUNT_ID.');
  const directory = await reportPath(values.report, 'directory');
  const report = JSON.parse(await readFile(path.join(directory, 'report.json'), 'utf8'));
  const baseline = values.baseline
    ? JSON.parse(await readFile(await reportPath(values.baseline, 'file'), 'utf8'))
    : undefined;
  const usage = await captureProviderUsage({ report, accountTag, token, baseline });
  const file = path.join(directory, 'provider-usage.json');
  await writeFile(file, JSON.stringify(usage, null, 2));
  console.log(file);
}
