import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoutesDirectory = fileURLToPath(new URL('../../routes/_app/', import.meta.url));

function listRouteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return listRouteFiles(path);
    }
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

describe('PageLayout route contract', () => {
  /*
   * Allowlisted source-scan (ADR-0001): "every terminal visual route mounts PageLayout" is a real
   * structural rule with no type-level or lint-level expression. Everything else this file once
   * asserted (import spellings, chunk-split literals, ghost components) was retired per ADR-0001.
   */
  it('keeps terminal visual routes on PageLayout', () => {
    const routes = listRouteFiles(appRoutesDirectory).map((path) => ({
      relativePath: relative(appRoutesDirectory, path),
      source: readFileSync(path, 'utf8'),
    }));
    const violations = routes
      .filter(({ source }) => source.includes('component:'))
      .filter(
        ({ source }) => !source.includes('<Outlet />') && !source.includes('component: Outlet')
      )
      .filter(({ source }) => !source.includes('<PageLayout'))
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
  });
});
