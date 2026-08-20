import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
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

function mountsPageLayout(source: string): boolean {
  return /<PageLayout[\s/>.]/.test(source);
}

/**
 * Whether a route hands its page off to something that mounts the layout for it.
 *
 * A route that dispatches on a param renders no page of its own, exactly like an `Outlet` passthrough, so it cannot contain `<PageLayout` and should not have to.
 * Resolving one hop keeps the rule real rather than granting such routes a blanket exemption: the file it delegates to still has to mount the layout.
 */
function delegatesToPageLayout(path: string, source: string): boolean {
  const directory = dirname(path);
  return (
    [...source.matchAll(/import\s+\{([^}]+)\}\s+from\s+'(\.[^']+)'/g)]
      .flatMap((match) => {
        const names = (match[1] ?? '').split(',').map((name) => name.replace(/\s+as\s+\w+/, '').trim());
        const base = resolve(directory, match[2] ?? '');
        return [`${base}.tsx`, `${base}/index.tsx`].map((candidate) => ({ candidate, names }));
      })
      .filter(({ candidate }) => existsSync(candidate))
      /* The delegate must be rendered, not merely imported: a route borrowing a button from a file that happens to mount the layout for someone else is not delegating its page to it. */
      .filter(({ names }) => names.some((name) => new RegExp(`<${name}[\\s/>]`).test(source)))
      .some(({ candidate }) => mountsPageLayout(readFileSync(candidate, 'utf8')))
  );
}

describe('PageLayout route contract', () => {
  /*
   * Allowlisted source-scan (ADR-0001): "every terminal visual route mounts PageLayout" is a real
   * structural rule with no type-level or lint-level expression. Everything else this file once
   * asserted (import spellings, chunk-split literals, ghost components) was retired per ADR-0001.
   */
  it('keeps terminal visual routes on PageLayout', () => {
    const routes = listRouteFiles(appRoutesDirectory).map((path) => ({
      path,
      relativePath: relative(appRoutesDirectory, path),
      source: readFileSync(path, 'utf8'),
    }));
    const violations = routes
      .filter(({ source }) => source.includes('component:'))
      .filter(({ source }) => !source.includes('<Outlet />') && !source.includes('component: Outlet'))
      .filter(({ source }) => !mountsPageLayout(source))
      .filter(({ path, source }) => !delegatesToPageLayout(path, source))
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
  });
});
