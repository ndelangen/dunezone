import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from 'vite-plus/test';

import { VOICE_ASSETS } from '../src/app/routes/_tool/tools/bidding/voiceAssets.generated';

test('the self-hosted voice engine and model match their pinned bytes', () => {
  const root = path.resolve(import.meta.dirname, '../public/tools/bidding-listener/v1');
  for (const asset of Object.values(VOICE_ASSETS)) {
    const bytes = readFileSync(path.join(root, asset.file));
    expect(bytes.byteLength).toBe(asset.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    expect(asset.file).toContain(asset.sha256.slice(0, 12));
  }
  expect(readFileSync(path.join(root, 'LICENSE.txt'), 'utf8')).toContain('Apache License');
  for (const asset of [VOICE_ASSETS.glue, VOICE_ASSETS.spotter]) {
    const code = readFileSync(path.join(root, asset.file), 'utf8');
    expect(code).not.toMatch(/new Function\b|\beval\s*\(/);
  }
});
