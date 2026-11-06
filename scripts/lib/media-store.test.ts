import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vite-plus/test';

import {
  IMAGE_INPUTS,
  checkoutStoreRoot,
  generatedImagesCurrent,
  imageInputsDigest,
  imageStampPath,
  isCheckoutStore,
  mediaStoreRoot,
} from './media-store';

describe('mediaStoreRoot', () => {
  const repo = '/work/dunezone';

  test('shares one store per machine off CI', () => {
    expect(mediaStoreRoot(repo, {}, '/Users/me')).toBe('/Users/me/.cache/dunezone/media/v');
    expect(mediaStoreRoot(repo, { XDG_CACHE_HOME: '/xdg' }, '/Users/me')).toBe('/xdg/dunezone/media/v');
  });

  test('keeps the checkout store on CI, where actions/cache saves it', () => {
    expect(mediaStoreRoot(repo, { CI: 'true' }, '/home/runner')).toBe(checkoutStoreRoot(repo));
    expect(mediaStoreRoot(repo, { GITHUB_ACTIONS: 'true' }, '/home/runner')).toBe(checkoutStoreRoot(repo));
  });

  test('MEDIA_STORE_DIR wins everywhere', () => {
    expect(mediaStoreRoot(repo, { CI: 'true', MEDIA_STORE_DIR: '/store' }, '/h')).toBe('/store');
  });

  test('only the checkout store counts as prunable', () => {
    expect(isCheckoutStore(repo, checkoutStoreRoot(repo))).toBe(true);
    expect(isCheckoutStore(repo, mediaStoreRoot(repo, {}, '/Users/me'))).toBe(false);
  });
});

describe('generatedImagesCurrent', () => {
  function checkout() {
    const root = mkdtempSync(path.join(tmpdir(), 'media-store-'));
    for (const input of IMAGE_INPUTS) {
      mkdirSync(path.dirname(path.join(root, input)), { recursive: true });
      writeFileSync(path.join(root, input), input);
    }
    return root;
  }

  test('holds only while the stamp, the inputs and the generated trees all agree', () => {
    const root = checkout();
    const digest = imageInputsDigest(root, { sharp: '1' });
    expect(generatedImagesCurrent(root, digest)).toBe(false);

    mkdirSync(path.dirname(imageStampPath(root)), { recursive: true });
    writeFileSync(imageStampPath(root), digest);
    expect(generatedImagesCurrent(root, digest)).toBe(false);

    mkdirSync(path.join(root, 'public/m'), { recursive: true });
    mkdirSync(path.join(root, 'public/image'), { recursive: true });
    expect(generatedImagesCurrent(root, digest)).toBe(true);

    writeFileSync(path.join(root, 'media/raster.lock.json'), '{}');
    expect(generatedImagesCurrent(root, imageInputsDigest(root, { sharp: '1' }))).toBe(false);
    expect(imageInputsDigest(root, { sharp: '2' })).not.toBe(imageInputsDigest(root, { sharp: '1' }));
  });
});
