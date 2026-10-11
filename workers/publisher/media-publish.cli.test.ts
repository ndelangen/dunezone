import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import { handleMediaReleaseRequest } from './media-release';
import { memoryR2Bucket } from './test-helpers';

test.each([
  ['readiness without a write', ['--await-token'], 0, 0],
  ['publishing after a rotation', ['--deployed', '--rotated-token'], 0, 2],
  ['ordinary publishing', ['--deployed'], 1, 1],
])('%s handles the installed bearer through the real CLI', async (_, flags, expectedCode, expectedObjects) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'dunezone-media-readiness-'));
  const root = path.resolve(import.meta.dirname, '..', '..');
  const bucket = memoryR2Bucket();
  const release = `${'a'.repeat(40)}-123456`;
  if (flags.includes('--deployed')) {
    await bucket.put(`releases/${release}.json`, new Uint8Array([1]), { customMetadata: { sha256: 'a'.repeat(64) } });
  }
  let attempts = 0;
  const server = createServer(async (incoming, outgoing) => {
    const chunks = [];
    for await (const chunk of incoming) {
      chunks.push(chunk);
    }
    attempts += 1;
    const response = await handleMediaReleaseRequest(
      new Request(`http://localhost${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers as Record<string, string>,
        body: Buffer.concat(chunks),
      }),
      {
        MEDIA_RELEASES_BUCKET: bucket,
        MEDIA_PUBLISH_TOKEN: [1, 3].includes(attempts) ? 'previous-token' : 'installed-token',
      }
    );
    outgoing.writeHead(response!.status, Object.fromEntries(response!.headers));
    outgoing.end(await response!.text());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  try {
    cpSync(path.join(root, 'scripts'), path.join(directory, 'scripts'), { recursive: true });
    symlinkSync(path.join(root, 'src'), path.join(directory, 'src'), 'dir');
    symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
    mkdirSync(path.join(directory, 'media'));
    writeFileSync(path.join(directory, 'media/raster.lock.json'), '{}');
    const child = spawn('bun', ['--no-env-file', path.join(directory, 'scripts/media-publish.ts'), ...flags], {
      cwd: directory,
      timeout: 10_000,
      env: {
        ...process.env,
        MEDIA_ORIGIN: `http://127.0.0.1:${address.port}`,
        MEDIA_PUBLISH_TOKEN: 'installed-token',
        MEDIA_RELEASE_ID: release,
      },
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
    expect({ code, output }).toMatchObject({ code: expectedCode });
    expect(bucket.objects.size).toBe(expectedObjects);
    expect(output).not.toContain('installed-token');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});
