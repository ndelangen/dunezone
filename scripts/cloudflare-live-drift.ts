import { readFileSync } from 'node:fs';
import path from 'node:path';

type JsonRecord = Record<string, unknown>;
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type QueueContract = {
  name: string;
  producers: number;
  consumers: number;
};

type BucketContract = {
  name: string;
  location: string;
  storageClass: string;
  managedPublic: boolean;
  customDomains: string[];
};

type LiveContract = {
  schemaVersion: 1;
  publisherWorker: string;
  ownedQueuePrefix: string;
  queues: QueueContract[];
  buckets: BucketContract[];
};

export type CloudflareDriftDependencies = {
  accountId: string;
  apiToken: string;
  fetcher?: Fetcher;
  root?: string;
};

export type CloudflareDriftReport = {
  worker: string;
  domainCount: number;
  bindingCount: number;
  secretCount: number;
  cronCount: number;
  queueCount: number;
  bucketCount: number;
};

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Cloudflare ${label} response is invalid`);
  }
  return value as JsonRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Cloudflare ${label} response is invalid`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Cloudflare ${label} response is invalid`);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Cloudflare ${label} response is invalid`);
  }
  return value;
}

function loadJson(file: string): JsonRecord {
  return record(JSON.parse(readFileSync(file, 'utf8')), file);
}

function loadContract(root: string): LiveContract {
  const value = loadJson(path.join(root, 'infra/cloudflare-live-contract.json'));
  if (value.schemaVersion !== 1) throw new Error('Cloudflare live contract version is invalid');
  const queues = array(value.queues, 'live contract queues').map((entry) => {
    const queue = record(entry, 'live contract queue');
    return {
      name: string(queue.name, 'live contract queue name'),
      producers: integer(queue.producers, 'live contract queue producers'),
      consumers: integer(queue.consumers, 'live contract queue consumers'),
    };
  });
  const buckets = array(value.buckets, 'live contract buckets').map((entry) => {
    const bucket = record(entry, 'live contract bucket');
    if (typeof bucket.managedPublic !== 'boolean') {
      throw new Error('Cloudflare live contract bucket access is invalid');
    }
    return {
      name: string(bucket.name, 'live contract bucket name'),
      location: string(bucket.location, 'live contract bucket location').toLowerCase(),
      storageClass: string(bucket.storageClass, 'live contract bucket storage class'),
      managedPublic: bucket.managedPublic,
      customDomains: array(bucket.customDomains, 'live contract custom domains').map((domain) =>
        string(domain, 'live contract custom domain')
      ),
    };
  });
  return {
    schemaVersion: 1,
    publisherWorker: string(value.publisherWorker, 'live contract Worker'),
    ownedQueuePrefix: string(value.ownedQueuePrefix, 'live contract Queue prefix'),
    queues,
    buckets,
  };
}

class CloudflareReadClient {
  private readonly baseUrl: string;

  constructor(
    accountId: string,
    private readonly apiToken: string,
    private readonly fetcher: Fetcher
  ) {
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
  }

  async get(pathname: string): Promise<{ result: unknown; resultInfo?: JsonRecord }> {
    const response = await this.fetcher(`${this.baseUrl}${pathname}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.apiToken}`,
      },
    });
    let body: JsonRecord;
    try {
      body = record(await response.json(), 'API');
    } catch {
      throw new Error(`Cloudflare GET ${pathname} returned an invalid response`);
    }
    if (!response.ok || body.success !== true) {
      const errors = Array.isArray(body.errors)
        ? body.errors
            .map((entry) =>
              entry && typeof entry === 'object' ? (entry as JsonRecord).message : null
            )
            .filter((message): message is string => typeof message === 'string')
            .join('; ')
        : '';
      throw new Error(
        `Cloudflare GET ${pathname} failed with HTTP ${response.status}${errors ? `: ${errors}` : ''}`
      );
    }
    return {
      result: body.result,
      ...(body.result_info && typeof body.result_info === 'object'
        ? { resultInfo: body.result_info as JsonRecord }
        : {}),
    };
  }
}

function expectedBindings(wrangler: JsonRecord): string[] {
  const bindings: string[] = [];
  const vars = record(wrangler.vars, 'Wrangler vars');
  for (const [name, value] of Object.entries(vars)) {
    bindings.push(`${name}|plain_text|${string(value, `Wrangler var ${name}`)}`);
  }
  const assets = record(wrangler.assets, 'Wrangler assets');
  bindings.push(`${string(assets.binding, 'Wrangler assets binding')}|assets|`);
  const browser = record(wrangler.browser, 'Wrangler browser');
  bindings.push(`${string(browser.binding, 'Wrangler browser binding')}|browser|`);
  const versionMetadata = record(wrangler.version_metadata, 'Wrangler version metadata');
  bindings.push(
    `${string(versionMetadata.binding, 'Wrangler version metadata binding')}|version_metadata|`
  );
  for (const entry of array(wrangler.r2_buckets, 'Wrangler R2 bindings')) {
    const binding = record(entry, 'Wrangler R2 binding');
    bindings.push(
      `${string(binding.binding, 'Wrangler R2 binding name')}|r2_bucket|${string(
        binding.bucket_name,
        'Wrangler R2 bucket name'
      )}`
    );
  }
  return bindings.sort();
}

function expectedWorkerDomains(wrangler: JsonRecord, worker: string): string[] {
  const domains: string[] = [];
  for (const value of array(wrangler.routes, 'Wrangler routes')) {
    const route = record(value, 'Wrangler route');
    if (route.custom_domain !== true) continue;
    domains.push(`${string(route.pattern, 'Wrangler Custom Domain')}|${worker}`);
  }
  return domains.sort();
}

function liveBinding(value: unknown): string | null {
  const binding = record(value, 'Worker binding');
  const name = string(binding.name, 'Worker binding name');
  const type = string(binding.type, `Worker binding ${name} type`);
  if (type === 'secret_text' || type === 'secret_key') return null;
  if (type === 'plain_text') return `${name}|${type}|${string(binding.text, `Worker var ${name}`)}`;
  if (type === 'r2_bucket') {
    return `${name}|${type}|${string(binding.bucket_name, `Worker R2 binding ${name}`)}`;
  }
  return `${name}|${type}|`;
}

function difference(expected: string[], actual: string[]): string {
  const missing = expected.filter((value) => !actual.includes(value));
  const extra = actual.filter((value) => !expected.includes(value));
  return [
    ...(missing.length ? [`missing ${missing.join(', ')}`] : []),
    ...(extra.length ? [`unexpected ${extra.join(', ')}`] : []),
  ].join('; ');
}

function compareExactSet(failures: string[], label: string, expected: string[], actual: string[]) {
  const detail = difference([...expected].sort(), [...actual].sort());
  if (detail) failures.push(`${label}: ${detail}`);
}

async function allQueues(client: CloudflareReadClient): Promise<JsonRecord[]> {
  const queues: JsonRecord[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const response = await client.get(`/queues?page=${page}&per_page=100`);
    queues.push(...array(response.result, 'Queues').map((value) => record(value, 'Queue')));
    const reportedPages = response.resultInfo?.total_pages;
    totalPages = typeof reportedPages === 'number' ? reportedPages : 1;
    page += 1;
  } while (page <= totalPages);
  return queues;
}

export async function checkCloudflareLiveDrift(
  dependencies: CloudflareDriftDependencies
): Promise<CloudflareDriftReport> {
  if (!/^[0-9a-f]{32}$/.test(dependencies.accountId)) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID must be a 32-character lowercase account ID');
  }
  if (!dependencies.apiToken.trim()) {
    throw new Error('CLOUDFLARE_API_TOKEN must be a separately scoped read-only token');
  }
  const root = dependencies.root ?? process.cwd();
  const contract = loadContract(root);
  const wrangler = loadJson(path.join(root, 'workers/publisher/wrangler.jsonc'));
  if (wrangler.name !== contract.publisherWorker) {
    throw new Error('Publisher Worker name differs between Wrangler and the live contract');
  }
  const client = new CloudflareReadClient(
    dependencies.accountId,
    dependencies.apiToken,
    dependencies.fetcher ?? fetch
  );
  const failures: string[] = [];

  const encodedWorker = encodeURIComponent(contract.publisherWorker);
  const [settingsResponse, secretsResponse, schedulesResponse, domainsResponse, queues] =
    await Promise.all([
      client.get(`/workers/scripts/${encodedWorker}/settings`),
      client.get(`/workers/scripts/${encodedWorker}/secrets`),
      client.get(`/workers/scripts/${encodedWorker}/schedules`),
      client.get(`/workers/domains?service=${encodedWorker}`),
      allQueues(client),
    ]);

  const settings = record(settingsResponse.result, 'Worker settings');
  const bindings = array(settings.bindings, 'Worker bindings')
    .map(liveBinding)
    .filter((binding): binding is string => binding !== null)
    .sort();
  compareExactSet(failures, 'Worker bindings drift', expectedBindings(wrangler), bindings);

  if (settings.compatibility_date !== wrangler.compatibility_date) {
    failures.push(
      `Worker compatibility date drift: expected ${String(wrangler.compatibility_date)}, found ${String(
        settings.compatibility_date
      )}`
    );
  }
  compareExactSet(
    failures,
    'Worker compatibility flags drift',
    array(wrangler.compatibility_flags, 'Wrangler compatibility flags').map((value) =>
      string(value, 'Wrangler compatibility flag')
    ),
    array(settings.compatibility_flags, 'Worker compatibility flags').map((value) =>
      string(value, 'Worker compatibility flag')
    )
  );
  const expectedLimits = record(wrangler.limits, 'Wrangler limits');
  const actualLimits = record(settings.limits, 'Worker limits');
  if (actualLimits.cpu_ms !== expectedLimits.cpu_ms) {
    failures.push(
      `Worker CPU limit drift: expected ${String(expectedLimits.cpu_ms)}, found ${String(actualLimits.cpu_ms)}`
    );
  }

  const expectedSecrets = array(
    record(wrangler.secrets, 'Wrangler secrets').required,
    'Wrangler required secrets'
  ).map((value) => string(value, 'Wrangler required secret'));
  const liveSecrets = array(secretsResponse.result, 'Worker secrets').map((value) =>
    string(record(value, 'Worker secret').name, 'Worker secret name')
  );
  compareExactSet(failures, 'Worker secrets drift', expectedSecrets, liveSecrets);

  const schedules = record(schedulesResponse.result, 'Worker schedules');
  const liveCrons = array(schedules.schedules, 'Worker schedules').map((value) =>
    string(record(value, 'Worker schedule').cron, 'Worker schedule cron')
  );
  const expectedCrons = array(
    record(wrangler.triggers, 'Wrangler triggers').crons,
    'Wrangler Cron triggers'
  ).map((value) => string(value, 'Wrangler Cron trigger'));
  compareExactSet(failures, 'Worker Cron drift', expectedCrons, liveCrons);

  const liveDomains = array(domainsResponse.result, 'Worker Custom Domains').map((value) => {
    const domain = record(value, 'Worker Custom Domain');
    return `${string(domain.hostname, 'Worker Custom Domain hostname')}|${string(
      domain.service,
      'Worker Custom Domain service'
    )}`;
  });
  compareExactSet(
    failures,
    'Worker Custom Domain drift',
    expectedWorkerDomains(wrangler, contract.publisherWorker),
    liveDomains
  );

  const ownedQueues = queues.filter((queue) =>
    string(queue.queue_name, 'Queue name').startsWith(contract.ownedQueuePrefix)
  );
  compareExactSet(
    failures,
    'Owned Queue inventory drift',
    contract.queues.map((queue) => queue.name),
    ownedQueues.map((queue) => string(queue.queue_name, 'Queue name'))
  );
  for (const expected of contract.queues) {
    const live = ownedQueues.find((queue) => queue.queue_name === expected.name);
    if (!live) continue;
    const producers = integer(live.producers_total_count, `${expected.name} producers`);
    const consumers = integer(live.consumers_total_count, `${expected.name} consumers`);
    if (producers !== expected.producers || consumers !== expected.consumers) {
      failures.push(
        `Queue ${expected.name} drift: expected ${expected.producers} producers/${expected.consumers} consumers, found ${producers}/${consumers}`
      );
    }
  }

  for (const expected of contract.buckets) {
    const bucketName = encodeURIComponent(expected.name);
    const [bucketResponse, managedResponse, customResponse] = await Promise.all([
      client.get(`/r2/buckets/${bucketName}`),
      client.get(`/r2/buckets/${bucketName}/domains/managed`),
      client.get(`/r2/buckets/${bucketName}/domains/custom`),
    ]);
    const bucket = record(bucketResponse.result, `R2 bucket ${expected.name}`);
    if (
      String(bucket.name) !== expected.name ||
      String(bucket.location).toLowerCase() !== expected.location ||
      bucket.storage_class !== expected.storageClass
    ) {
      failures.push(
        `R2 bucket ${expected.name} drift: expected ${expected.location}/${expected.storageClass}, found ${String(
          bucket.location
        ).toLowerCase()}/${String(bucket.storage_class)}`
      );
    }
    const managed = record(managedResponse.result, `R2 managed domain ${expected.name}`);
    if (managed.enabled !== expected.managedPublic) {
      failures.push(
        `R2 bucket ${expected.name} r2.dev drift: expected enabled=${expected.managedPublic}, found ${String(
          managed.enabled
        )}`
      );
    }
    const custom = record(customResponse.result, `R2 custom domains ${expected.name}`);
    const domains = array(custom.domains, `R2 custom domains ${expected.name}`).map((value) =>
      string(record(value, 'R2 custom domain').domain, 'R2 custom domain name')
    );
    compareExactSet(
      failures,
      `R2 bucket ${expected.name} custom-domain drift`,
      expected.customDomains,
      domains
    );
  }

  if (failures.length > 0) {
    throw new Error(`Cloudflare live infrastructure drift detected:\n- ${failures.join('\n- ')}`);
  }
  return {
    worker: contract.publisherWorker,
    domainCount: liveDomains.length,
    bindingCount: bindings.length,
    secretCount: liveSecrets.length,
    cronCount: liveCrons.length,
    queueCount: ownedQueues.length,
    bucketCount: contract.buckets.length,
  };
}

if (import.meta.main) {
  const report = await checkCloudflareLiveDrift({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '',
    apiToken: process.env.CLOUDFLARE_API_TOKEN ?? '',
  });
  console.log(JSON.stringify({ ok: true, ...report }));
}
