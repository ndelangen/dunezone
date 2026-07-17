import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { checkCloudflareLiveDrift } from './cloudflare-live-drift';

const ACCOUNT_ID = '0123456789abcdef0123456789abcdef';
const WORKER = 'faction-sheet-asset-publisher';

function envelope(result: unknown, resultInfo?: unknown, status = 200): Response {
  return Response.json(
    {
      success: status >= 200 && status < 300,
      result,
      ...(resultInfo ? { result_info: resultInfo } : {}),
      errors: status >= 400 ? [{ message: 'request denied' }] : [],
    },
    { status }
  );
}

function liveBindings() {
  return [
    { name: 'ASSET_BUCKET', type: 'r2_bucket', bucket_name: 'tanstack-start-faction-sheet-assets' },
    { name: 'BROWSER', type: 'browser' },
    { name: 'ASSETS', type: 'assets' },
    { name: 'CF_VERSION_METADATA', type: 'version_metadata' },
    { name: 'ASSET_PUBLISHER_CACHE_TOKEN_SECRET', type: 'secret_text' },
    { name: 'ASSET_PUBLISHER_EXECUTOR_SECRET', type: 'secret_text' },
    {
      name: 'CAPTURE_BASE_URL',
      type: 'plain_text',
      text: 'https://faction-sheet-asset-publisher.ndelangen.workers.dev',
    },
    {
      name: 'CONVEX_EXECUTOR_BASE_URL',
      type: 'plain_text',
      text: 'https://exuberant-finch-263.eu-west-1.convex.site/asset-publishing/executor',
    },
    {
      name: 'CONVEX_RENDER_URL',
      type: 'plain_text',
      text: 'https://exuberant-finch-263.eu-west-1.convex.site/asset-publishing/render',
    },
    { name: 'SUPPORTED_RENDERER_VERSION', type: 'plain_text', text: 'faction-sheet-v3' },
    { name: 'WORK_WINDOW_MS', type: 'plain_text', text: '240000' },
    { name: 'BROWSER_CAPTURE_TIMEOUT_MS', type: 'plain_text', text: '45000' },
    { name: 'BROWSER_CLEANUP_GRACE_MS', type: 'plain_text', text: '15000' },
    { name: 'PDF_MAX_BYTES', type: 'plain_text', text: '8000000' },
  ];
}

function liveFetcher(
  options: {
    extraSecret?: boolean;
    queueConsumers?: number;
    cron?: string;
    publisherBucketPublic?: boolean;
    workerDomains?: string[];
    denied?: boolean;
  } = {}
) {
  const requests: Array<{ url: URL; method: string; authorization: string | null }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    requests.push({
      url,
      method: init?.method ?? 'GET',
      authorization: new Headers(init?.headers).get('Authorization'),
    });
    if (options.denied) return envelope(null, undefined, 403);
    if (url.pathname.endsWith(`/workers/scripts/${WORKER}/settings`)) {
      return envelope({
        bindings: liveBindings(),
        compatibility_date: '2026-07-17',
        compatibility_flags: ['nodejs_compat'],
        limits: { cpu_ms: 30000 },
      });
    }
    if (url.pathname.endsWith(`/workers/scripts/${WORKER}/secrets`)) {
      return envelope([
        { name: 'ASSET_PUBLISHER_CACHE_TOKEN_SECRET', type: 'secret_text' },
        { name: 'ASSET_PUBLISHER_EXECUTOR_SECRET', type: 'secret_text' },
        ...(options.extraSecret
          ? [{ name: 'ASSET_PUBLISHER_POLL_SECRET', type: 'secret_text' }]
          : []),
      ]);
    }
    if (url.pathname.endsWith(`/workers/scripts/${WORKER}/schedules`)) {
      return envelope({ schedules: [{ cron: options.cron ?? '*/5 * * * *' }] });
    }
    if (url.pathname.endsWith('/workers/domains')) {
      return envelope(
        (options.workerDomains ?? ['dune.zone']).map((hostname) => ({
          hostname,
          service: WORKER,
          zone_name: 'dune.zone',
        }))
      );
    }
    if (url.pathname.endsWith('/queues')) {
      return envelope(
        [
          {
            queue_name: 'faction-sheet-asset-publisher',
            producers_total_count: 0,
            consumers_total_count: options.queueConsumers ?? 0,
          },
        ],
        { total_pages: 1 }
      );
    }
    const bucketMatch = /\/r2\/buckets\/([^/]+)(.*)$/.exec(url.pathname);
    if (bucketMatch) {
      const bucket = decodeURIComponent(bucketMatch[1] ?? '');
      const suffix = bucketMatch[2];
      if (suffix === '/domains/managed') {
        return envelope({
          enabled:
            bucket === 'tanstack-start-faction-sheet-assets' &&
            options.publisherBucketPublic === true,
        });
      }
      if (suffix === '/domains/custom') return envelope({ domains: [] });
      if (suffix === '') {
        return envelope({ name: bucket, location: 'weur', storage_class: 'Standard' });
      }
    }
    throw new Error(`Unexpected test request: ${url.pathname}`);
  };
  return { fetcher, requests };
}

describe('Cloudflare live drift check', () => {
  test('keeps the PR workflow on trusted base code with a dedicated read credential', () => {
    const workflow = readFileSync(
      path.resolve(process.cwd(), '.github/workflows/cloudflare-live-drift.yml'),
      'utf8'
    );
    expect(workflow).toContain('pull_request_target:');
    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain('types: [opened, synchronize, reopened, ready_for_review, edited]');
    expect(workflow).not.toContain("github.event.pull_request.base.ref == 'main'");
    expect(workflow).toContain('actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd # v5');
    expect(workflow).toContain(
      'oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0'
    );
    expect(workflow).toContain(`ref: $${'{'}{ github.event.pull_request.base.sha || github.sha }}`);
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain(
      `CLOUDFLARE_API_TOKEN: $${'{'}{ secrets.CLOUDFLARE_READ_API_TOKEN }}`
    );
    expect(workflow).not.toContain('github.event.pull_request.head.sha');
    expect(workflow).not.toContain('secrets.CLOUDFLARE_API_TOKEN');
  });

  test('uses only authenticated GETs and accepts the reviewed live contract', async () => {
    const live = liveFetcher();
    await expect(
      checkCloudflareLiveDrift({
        accountId: ACCOUNT_ID,
        apiToken: 'read-only-token',
        fetcher: live.fetcher,
      })
    ).resolves.toEqual({
      worker: WORKER,
      domainCount: 1,
      bindingCount: 12,
      secretCount: 2,
      cronCount: 1,
      queueCount: 1,
      bucketCount: 2,
    });
    expect(live.requests).toHaveLength(11);
    expect(new Set(live.requests.map((request) => request.method))).toEqual(new Set(['GET']));
    expect(
      live.requests.find((request) => request.url.pathname.endsWith('/workers/domains'))?.url
        .searchParams
    ).toEqual(new URLSearchParams({ service: WORKER }));
    expect(
      live.requests.every((request) => request.authorization === 'Bearer read-only-token')
    ).toBe(true);
  });

  test('reports extra secrets and restored Queue consumers together', async () => {
    const live = liveFetcher({ extraSecret: true, queueConsumers: 1 });
    await expect(
      checkCloudflareLiveDrift({
        accountId: ACCOUNT_ID,
        apiToken: 'read-only-token',
        fetcher: live.fetcher,
      })
    ).rejects.toThrow(
      /Worker secrets drift: unexpected ASSET_PUBLISHER_POLL_SECRET[\s\S]*expected 0 producers\/0 consumers, found 0\/1/
    );
  });

  test('reports Cron and public-bucket drift together', async () => {
    const live = liveFetcher({ cron: '*/15 * * * *', publisherBucketPublic: true });
    await expect(
      checkCloudflareLiveDrift({
        accountId: ACCOUNT_ID,
        apiToken: 'read-only-token',
        fetcher: live.fetcher,
      })
    ).rejects.toThrow(/Worker Cron drift[\s\S]*r2\.dev drift/);
  });

  test('reports a missing or unexpected Worker Custom Domain', async () => {
    const missing = liveFetcher({ workerDomains: [] });
    await expect(
      checkCloudflareLiveDrift({
        accountId: ACCOUNT_ID,
        apiToken: 'read-only-token',
        fetcher: missing.fetcher,
      })
    ).rejects.toThrow(/Worker Custom Domain drift: missing dune\.zone/);

    const extra = liveFetcher({ workerDomains: ['dune.zone', 'legacy.example.com'] });
    await expect(
      checkCloudflareLiveDrift({
        accountId: ACCOUNT_ID,
        apiToken: 'read-only-token',
        fetcher: extra.fetcher,
      })
    ).rejects.toThrow(/Worker Custom Domain drift: unexpected legacy\.example\.com/);
  });

  test('fails closed on an API error without exposing the token', async () => {
    const live = liveFetcher({ denied: true });
    let message = '';
    try {
      await checkCloudflareLiveDrift({
        accountId: ACCOUNT_ID,
        apiToken: 'highly-sensitive-token',
        fetcher: live.fetcher,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('HTTP 403');
    expect(message).not.toContain('highly-sensitive-token');
  });
});
