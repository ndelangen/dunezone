import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import { handleMediaReleaseRequest } from './media-release';
import { memoryR2Bucket } from './test-helpers';

test('token readiness waits for the installed bearer without writing a release', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'dunezone-media-readiness-'));
  const root = path.resolve(import.meta.dirname, '..', '..');
  const bucket = memoryR2Bucket();
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
      { MEDIA_RELEASES_BUCKET: bucket, MEDIA_PUBLISH_TOKEN: attempts === 1 ? 'previous-token' : 'installed-token' }
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
    const child = spawn('bun', ['--no-env-file', path.join(directory, 'scripts/media-publish.ts'), '--await-token'], {
      cwd: directory,
      timeout: 10_000,
      env: {
        ...process.env,
        MEDIA_ORIGIN: `http://127.0.0.1:${address.port}`,
        MEDIA_PUBLISH_TOKEN: 'installed-token',
        MEDIA_RELEASE_ID: `${'a'.repeat(40)}-123456`,
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
    expect({ code, output }).toMatchObject({ code: 0 });
    expect(attempts).toBeGreaterThan(1);
    expect(bucket.objects.size).toBe(0);
    expect(output).not.toContain('installed-token');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});
