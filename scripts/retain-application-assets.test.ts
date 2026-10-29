import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build } from 'esbuild';
import { beforeAll, expect, test } from 'vite-plus/test';

const root = path.resolve(import.meta.dirname, '..');
const assetPath = 'public/previous-aaaa.js';
const asset = Buffer.from('export const previous = true;');
const manifest = {
  version: 1,
  files: [
    {
      path: assetPath,
      sha256: createHash('sha256').update(asset).digest('hex'),
      bytes: asset.length,
      current: true,
      lastUsedAt: 1,
    },
  ],
};
let command: string;
beforeAll(async () => {
  const result = await build({
    entryPoints: [path.join(root, 'scripts/retain-application-assets.ts')],
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    write: false,
  });
  command = result.outputFiles[0]!.text;
});

type Failure = 'status' | 'body' | 'timeout' | 'corrupt' | 'missing' | 'json';
const failureStatus: Partial<Record<Failure, number>> = { status: 502, missing: 404 };

function writeFixtureResponse(response: ServerResponse, bytes: Buffer, contentType: string, failure?: Failure) {
  const status = failure && failureStatus[failure];
  if (status) {
    response.writeHead(status).end('unavailable');
    return;
  }
  const interrupted = failure === 'body' || failure === 'timeout';
  if (interrupted) {
    response.setHeader('X-Retention-Fixture-Fault', failure);
  }
  response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': String(bytes.length) });
  if (interrupted) {
    /* The preload acknowledges headers before the fixture interrupts this body. */
    response.write(bytes.subarray(0, 5));
    return response;
  }
  response.end(failure === 'corrupt' || failure === 'json' ? Buffer.alloc(bytes.length, 'x') : bytes);
}

async function retain(failures: Failure[], failManifest = false, assetCount = 1) {
  const files = Array.from({ length: assetCount }, (_, index) => ({
    ...manifest.files[0]!,
    path: index === 0 ? assetPath : `public/previous${index}-aaaa.js`,
  }));
  const directory = mkdtempSync(path.join(tmpdir(), 'retention-transfer-'));
  const output = path.join(directory, 'workers/publisher/dist');
  mkdirSync(path.join(directory, 'scripts'));
  mkdirSync(path.join(output, 'public'), { recursive: true });
  mkdirSync(path.join(output, 'publisher-capture'));
  symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'));
  writeFileSync(path.join(directory, 'scripts/retain.mjs'), command);
  const shell = '<html><head><meta name="robots" content="noindex"/></head><body></body></html>';
  for (const [file, content] of Object.entries({
    '_shell.html': shell,
    'index.html': shell,
    'publisher-capture.html': 'capture',
    _headers: 'headers',
    'publisher-capture/main.js': 'capture',
    'public/current-bbbb.js': 'current',
    'application-assets.json': JSON.stringify({ version: 1, files: [] }),
  })) {
    writeFileSync(path.join(output, file), content);
  }
  let manifestRequests = 0;
  let assetRequests = 0;
  const requests: { path: string; cacheControl: string | undefined }[] = [];
  const waiting: (() => void)[] = [];
  let peakWaiting = 0;
  let released = false;
  let interrupted: ServerResponse | undefined;
  const server = createServer((request, response) => {
    const url = new URL(request.url!, 'http://local');
    if (url.pathname === '/interrupt-body') {
      interrupted?.destroy();
      response.end('closed');
      return;
    }
    const metadata = url.pathname === '/application-assets.json';
    requests.push({ path: request.url!, cacheControl: request.headers['cache-control'] });
    if (metadata) {
      manifestRequests++;
    } else {
      assetRequests++;
    }
    const failing = failManifest ? metadata : url.pathname === `/${assetPath}`;
    const failure = failing ? failures.shift() : undefined;
    const bytes = metadata ? Buffer.from(JSON.stringify({ ...manifest, files })) : asset;
    const respond = () => {
      interrupted = writeFixtureResponse(response, bytes, metadata ? 'application/json' : 'text/javascript', failure);
    };
    if (!metadata && !released) {
      waiting.push(respond);
      peakWaiting = waiting.length;
      if (waiting.length === assetCount) {
        released = true;
        for (const respond of waiting.reverse()) {
          respond();
        }
      }
    } else {
      respond();
    }
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('The retention fixture did not bind a port');
    }
    const origin = `http://127.0.0.1:${address.port}`;
    const preload = path.join(directory, 'local-fetch.mjs');
    /* The disposable CLI reaches only the fixture, and transport backoff advances without wall-clock sleeps. */
    writeFileSync(
      preload,
      `const nativeFetch = globalThis.fetch;
       globalThis.fetch = async (input, init) => {
         const url = new URL(input);
         if (url.origin !== 'https://dune.zone') throw new Error('Unexpected retention origin');
         const controller = new AbortController();
         const response = await nativeFetch(new URL(url.pathname + url.search, ${JSON.stringify(origin)}), {
           ...init, signal: AbortSignal.any([init.signal, controller.signal]),
         });
         const fault = response.headers.get('X-Retention-Fixture-Fault');
         if (fault === 'body') {
           await nativeFetch(new URL('/interrupt-body', ${JSON.stringify(origin)}));
         } else if (fault === 'timeout') {
           controller.abort(new DOMException('The operation timed out.', 'TimeoutError'));
         }
         return response;
       };
       const nativeTimeout = globalThis.setTimeout;
       globalThis.setTimeout = (callback, delay, ...args) =>
         nativeTimeout(callback, [2000, 4000, 8000].includes(delay) ? 0 : delay, ...args);`
    );
    const child = spawn('bun', ['--no-env-file', '--preload', preload, path.join(directory, 'scripts/retain.mjs')], {
      cwd: directory,
      timeout: 10_000,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    const [code] = await once(child, 'close');
    return {
      code,
      stdout,
      stderr,
      manifestRequests,
      assetRequests,
      requests,
      peakWaiting,
      manifest: JSON.parse(readFileSync(path.join(output, 'application-assets.json'), 'utf8')),
      files: files.map((file) => ({
        path: file.path,
        bytes: existsSync(path.join(output, file.path)) ? readFileSync(path.join(output, file.path)) : null,
      })),
      retained: existsSync(path.join(output, assetPath)) ? readFileSync(path.join(output, assetPath)) : null,
    };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
}

test(
  'the retention CLI overlaps downloads and retries a 5xx without changing manifest order',
  { timeout: 15_000 },
  async () => {
    const result = await retain(['status'], false, 3);
    expect(result.code, result.stderr).toBe(0);
    expect(result.peakWaiting).toBe(3);
    expect(result.assetRequests).toBe(4);
    expect(result.stderr).toContain(`${assetPath}: attempt 1 of 4 failed (HTTP 502)`);
    expect(result.manifest.files.map((file: { path: string }) => file.path)).toEqual(
      result.files.map((file) => file.path)
    );
    for (const file of result.files) {
      expect(file.bytes).toEqual(asset);
    }
    for (const request of result.requests) {
      expect(request.path).not.toContain('?');
      expect(request.cacheControl).toBeUndefined();
    }
  }
);

test(
  'one corrupt download fails the concurrent CLI run without publishing its manifest',
  { timeout: 15_000 },
  async () => {
    const result = await retain(['corrupt'], false, 3);
    expect(result.code).toBe(1);
    expect(result.peakWaiting).toBe(3);
    expect(result.assetRequests).toBe(3);
    expect(result.stderr).toContain('digest check');
    expect(result.stderr).not.toContain('retrying');
    expect(result.retained).toBeNull();
    expect(result.manifest).toEqual({ version: 1, files: [] });
  }
);

test(
  'the retention CLI recovers status and body failures within one transport attempt budget',
  { timeout: 15_000 },
  async () => {
    const result = await retain(['status', 'body']);
    expect(result.code, result.stderr).toBe(0);
    expect(result.assetRequests).toBe(3);
    expect(result.retained).toEqual(asset);
    expect(result.stderr).toContain(`${assetPath}: attempt 1 of 4 failed (HTTP 502)`);
    expect(result.stderr).toContain(`${assetPath}: attempt 2 of 4 failed`);
  }
);

test(
  'the retention CLI recovers a manifest body interrupted after successful headers',
  { timeout: 15_000 },
  async () => {
    const result = await retain(['body'], true);
    expect(result.code, result.stderr).toBe(0);
    expect(result.manifestRequests).toBe(2);
    expect(result.retained).toEqual(asset);
  }
);

test(
  'a deadline abort after headers recovers without extending the request deadline',
  { timeout: 15_000 },
  async () => {
    const result = await retain(['timeout']);
    expect(result.code, result.stderr).toBe(0);
    expect(result.assetRequests).toBe(2);
    expect(result.stderr).toContain('The operation timed out.');
    expect(result.retained).toEqual(asset);
  }
);

test(
  'persistent body failures refuse with the asset name and the unchanged attempt limit',
  { timeout: 15_000 },
  async () => {
    const result = await retain(['body', 'body', 'body', 'body']);
    expect(result.code).toBe(1);
    expect(result.assetRequests).toBe(4);
    expect(result.stderr).toContain(`${assetPath} unreachable after 4 attempts`);
    expect(result.retained).toBeNull();
  }
);

test.each(['corrupt', 'missing', 'json'] as const)(
  'the retention CLI refuses %s data without retrying it',
  { timeout: 15_000 },
  async (failure) => {
    const metadata = failure === 'json';
    const result = await retain([failure], metadata);
    expect(result.code).toBe(1);
    expect(metadata ? result.manifestRequests : result.assetRequests).toBe(1);
    expect(result.stderr).not.toContain('retrying');
    expect(result.retained).toBeNull();
    if (failure === 'corrupt') {
      expect(result.stderr).toContain('digest check');
    }
  }
);
