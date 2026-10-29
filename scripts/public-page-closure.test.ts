import { resolve } from 'node:path';

import { describe, expect, test } from 'vite-plus/test';

import { importedFiles } from './lib/import-graph';

const root = resolve(import.meta.dirname, '..');

/** Pages every visitor loads, which only draw saved records and never edit or validate them. */
const PUBLIC_PAGES = ['src/app/routes/_app/assets/$type/$slug/index.tsx'];

/*
 * Modules that bring the board geometry library (jsts, about 116 KB gzipped) with them.
 * Editors need them; a public page that reaches one, for example through an editor's toolbar or load dialog, makes every visitor download it.
 */
const EDITOR_ONLY = ['src/shared/boards/geometry.ts', 'src/shared/assets/validation.ts'];

describe('public pages', () => {
  test('do not import the board geometry library', async () => {
    /* Absolute urls name files under public/, and the route tree names every page. */
    const files = await importedFiles(root, PUBLIC_PAGES, /^\/|routeTree\.gen$/, 'test-results/public-page-closure');
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((file) => EDITOR_ONLY.includes(file))).toEqual([]);
  }, 60_000);
});
