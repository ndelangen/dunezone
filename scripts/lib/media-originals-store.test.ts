import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import type { Original } from './media-originals';
import { checkOutOriginal, seedStore } from './media-originals-store';

const bytes = new TextEncoder().encode('an original');
const hash = createHash('sha256').update(bytes).digest('hex');
const original: Original = {
  hash,
  key: '/image/a.png',
  entry: { sha256: hash, bytes: bytes.length, width: 1, height: 1, format: 'png', isOpaque: true, color: '#000000' },
};

let root = '';
let store = '';
let checkout = '';

function stored(contents: string | Uint8Array = bytes) {
  mkdirSync(store, { recursive: true });
  writeFileSync(path.join(store, hash), contents);
}

describe('the originals store', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(root, { recursive: true, force: true });
  });

  function scratch() {
    root = mkdtempSync(path.join(tmpdir(), 'originals-'));
    store = path.join(root, 'store');
    checkout = path.join(root, 'checkout');
  }

  test('fills a worktree from the store without a request', async () => {
    scratch();
    stored();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const destinations = [path.join(checkout, 'a.png'), path.join(checkout, 'nested/a-copy.png')];
    expect(await checkOutOriginal(original, destinations, store)).toBe('cloned');
    expect(destinations.map((file) => readFileSync(file, 'utf8'))).toEqual(['an original', 'an original']);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('downloads an original the store holds damaged, and keeps the good copy', async () => {
    scratch();
    stored('damaged');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(bytes, { headers: { 'X-Media-SHA256': hash, 'X-Media-Bytes': String(bytes.length) } })
      )
    );
    expect(await checkOutOriginal(original, [path.join(checkout, 'a.png')], store)).toBe('downloaded');
    expect(readFileSync(path.join(store, hash), 'utf8')).toBe('an original');
  });

  test('never replaces a file already checked out', async () => {
    scratch();
    stored();
    mkdirSync(checkout);
    writeFileSync(path.join(checkout, 'a.png'), 'local edit');
    await expect(checkOutOriginal(original, [path.join(checkout, 'a.png')], store)).rejects.toThrow();
    expect(readFileSync(path.join(checkout, 'a.png'), 'utf8')).toBe('local edit');
  });

  test('seeds the store from a checked-out original, and an edit to it afterwards stays in the worktree', () => {
    scratch();
    seedStore(original, path.join(checkout, 'absent.png'), store);
    expect(existsSync(path.join(store, hash))).toBe(false);
    mkdirSync(checkout);
    writeFileSync(path.join(checkout, 'a.png'), bytes);
    seedStore(original, path.join(checkout, 'a.png'), store);
    writeFileSync(path.join(checkout, 'a.png'), 'edited since');
    expect(readFileSync(path.join(store, hash), 'utf8')).toBe('an original');
  });
});
