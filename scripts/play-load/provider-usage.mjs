import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
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
  'durableObjectsSubrequestsAdaptiveGroups',
];
const AGGREGATES = ['sum', 'max', 'avg'];
const WINDOW_FIELDS = [
  'datetimeMinute',
  'datetimeFiveMinutes',
  'datetimeFifteenMinutes',
  'datetimeHour',
  'datetime',
  'date',
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

/** Reads each dataset's aggregate fields and filter names from the live schema. */
export async function discoverDatasets(fetchFn, token) {
  const { __schema: schema } = await graphql(fetchFn, token, INTROSPECTION);
  const types = new Map(schema.types.map((type) => [type.name, type]));
  const account = schema.types.find((type) => type.fields?.some((field) => field.name === DATASETS[1]));
  assert.ok(account, 'The schema exposes no Durable Objects datasets to this token.');
  return Object.fromEntries(
    DATASETS.flatMap((dataset) => {
      const field = account.fields.find((entry) => entry.name === dataset);
      if (!field) {
        return [];
      }
      const rowType = types.get(unwrap(field.type).name);
      const aggregates = Object.fromEntries(
        AGGREGATES.flatMap((aggregate) => {
          const entry = rowType?.fields?.find((candidate) => candidate.name === aggregate);
          const names = types.get(unwrap(entry?.type)?.name)?.fields?.map((candidate) => candidate.name) ?? [];
          return names.length ? [[aggregate, names]] : [];
        })
      );
      const filterType = unwrap(field.args?.find((arg) => arg.name === 'filter')?.type);
      const filters = types.get(filterType?.name)?.inputFields?.map((entry) => entry.name) ?? [];
      return [[dataset, { aggregates, filters }]];
    })
  );
}

/** A dataset is queried only when its filter names the namespace and a window at some resolution. */
function selection(dataset, { aggregates, filters }, { namespaceId, from, to }) {
  const field = WINDOW_FIELDS.find((name) => filters.includes(`${name}_geq`) && filters.includes(`${name}_leq`));
  if (!field || !filters.includes('namespaceId') || !Object.keys(aggregates).length) {
    return {
      skipped: `The filter offers ${filters.join(', ') || 'nothing'} and the row ${Object.keys(aggregates).join(', ') || 'nothing'}.`,
    };
  }
  const value = (date) => (field === 'date' ? date.toISOString().slice(0, 10) : date.toISOString());
  const filter = JSON.stringify({ namespaceId, [`${field}_geq`]: value(from), [`${field}_leq`]: value(to) }).replaceAll(
    /"([A-Za-z_]+)":/g,
    '$1:'
  );
  const body = Object.entries(aggregates)
    .map(([aggregate, names]) => `${aggregate} { ${names.join(' ')} }`)
    .join(' ');
  return { window: field, query: `${dataset}(filter: ${filter}, limit: 1000) { ${body} }` };
}

/** Sums every aggregate field of every dataset for the namespace inside the window. */
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

/** The deployment's usage so far today and this month, as the CLI prints it. */
async function convexUsage(execFn, deployment) {
  const { stdout } = await execFn('bunx', ['convex', 'deployment', 'usage', '--deployment', deployment, '--json'], {
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(stdout);
}

/** Subtracts numeric leaves of a baseline capture from the current one, leaving other values as they are. */
export function delta(baseline, current) {
  if (typeof current === 'number' && typeof baseline === 'number') {
    return current - baseline;
  }
  if (current !== null && typeof current === 'object' && baseline !== null && typeof baseline === 'object') {
    return Object.fromEntries(Object.entries(current).map(([key, value]) => [key, delta(baseline[key], value)]));
  }
  return current;
}

/** A baseline is an earlier capture of this script or the CLI's own usage output. */
const previous = (baseline) => baseline.convex?.current ?? baseline;

export async function captureProviderUsage({ report, accountTag, token, baseline, fetchFn = fetch, execFn }) {
  const target = report.environment?.target;
  assert.ok(target?.namespaceId, 'The report names no hosted namespace.');
  assert.ok(report.startedAt && report.finishedAt, 'The report has no window.');
  const from = new Date(report.startedAt);
  const to = new Date(report.finishedAt);
  from.setUTCSeconds(0, 0);
  to.setUTCMinutes(to.getUTCMinutes() + 1, 0, 0);
  const datasets = await discoverDatasets(fetchFn, token);
  const cloudflare = await queryNamespace(
    fetchFn,
    token,
    { accountTag, namespaceId: target.namespaceId, from, to },
    datasets
  );
  const deployment = `${target.project}:${target.reference}`;
  const convex = await convexUsage(execFn ?? promisify(execFile), deployment);
  return {
    capturedAt: new Date().toISOString(),
    cell: report.environment.cell,
    window: { from: from.toISOString(), to: to.toISOString() },
    namespaceId: target.namespaceId,
    deployment,
    cloudflare,
    convex: {
      current: convex,
      ...(baseline ? { baseline: previous(baseline), cell: delta(previous(baseline), convex) } : {}),
    },
    limitation:
      'Cloudflare rows are the namespace analytics inside the cell window at their own resolution; Convex figures are the deployment so far, and the cell share is the difference from the baseline capture.',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { report: { type: 'string' }, account: { type: 'string' }, baseline: { type: 'string' } },
  });
  assert.ok(values.report, 'Pass --report DIR with a hosted report.json.');
  const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN;
  const accountTag = values.account ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  assert.ok(token, 'CLOUDFLARE_ANALYTICS_TOKEN must hold a read-only analytics token.');
  assert.ok(accountTag, 'Pass --account or set CLOUDFLARE_ACCOUNT_ID.');
  const report = JSON.parse(await readFile(path.join(values.report, 'report.json'), 'utf8'));
  const baseline = values.baseline ? JSON.parse(await readFile(values.baseline, 'utf8')) : undefined;
  const usage = await captureProviderUsage({ report, accountTag, token, baseline });
  const file = path.join(values.report, 'provider-usage.json');
  await writeFile(file, JSON.stringify(usage, null, 2));
  console.log(file);
}
