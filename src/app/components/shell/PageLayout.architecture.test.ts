import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appRoutesDirectory = fileURLToPath(new URL('../../routes/_app/', import.meta.url));
const appLayoutSource = readFileSync(
  fileURLToPath(new URL('../../routes/_app.tsx', import.meta.url)),
  'utf8'
);
const applicationChromeSource = readFileSync(
  new URL('./ApplicationChrome.tsx', import.meta.url),
  'utf8'
);
const rootRouteSource = readFileSync(
  fileURLToPath(new URL('../../routes/__root.tsx', import.meta.url)),
  'utf8'
);
const appCatchAllSource = readFileSync(
  fileURLToPath(new URL('../../routes/_app/$.tsx', import.meta.url)),
  'utf8'
);
const rootNotFoundSource = readFileSync(new URL('./AppNotFound.tsx', import.meta.url), 'utf8');
const sheetRouteSource = readFileSync(
  fileURLToPath(new URL('../../routes/preview/sheet/$factionSlug.tsx', import.meta.url)),
  'utf8'
);
const factionDetailSource = readFileSync(
  fileURLToPath(new URL('../../routes/_app/factions/$factionId/index.tsx', import.meta.url)),
  'utf8'
);
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
  const routes = listRouteFiles(appRoutesDirectory).map((path) => ({
    path,
    relativePath: relative(appRoutesDirectory, path),
    source: readFileSync(path, 'utf8'),
  }));

  it('keeps terminal visual routes on PageLayout', () => {
    const violations = routes
      .filter(({ source }) => source.includes('component:'))
      .filter(
        ({ source }) => !source.includes('<Outlet />') && !source.includes('component: Outlet')
      )
      .filter(({ source }) => !source.includes('<PageLayout'))
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
  });

  it('does not split page composition through route metadata', () => {
    const violations = routes
      .filter(({ source }) => source.includes('PageHead'))
      .map(({ relativePath }) => relativePath);

    expect(violations).toEqual([]);
    expect(appLayoutSource).not.toContain('PageHead');
  });

  it('keeps application not-found presentation lazy and outside the root', () => {
    expect(rootRouteSource).not.toContain('AppNotFound');
    expect(rootRouteSource).not.toContain('ApplicationChrome');
    expect(appLayoutSource).toContain("codeSplitGroupings: [['component', 'notFoundComponent']]");
    expect(appLayoutSource).toContain('notFoundComponent: AppNotFound');
    expect(rootNotFoundSource).toContain('<ApplicationChrome');
    expect(rootNotFoundSource).toContain('<PageLayout');
  });

  it('routes unknown public URLs through the application branch without capturing the sheet', () => {
    expect(appCatchAllSource).toContain("createFileRoute('/_app/$')");
    expect(appCatchAllSource).toContain("notFound({ routeId: '/_app' })");
    expect(sheetRouteSource).toContain("createFileRoute('/preview/sheet/$factionSlug')");
    expect(sheetRouteSource).not.toContain("createFileRoute('/_app/");
  });

  it('keeps application CSS and Mantine UI chunks owned by the application match', () => {
    expect(rootRouteSource).not.toContain('styles.layer.css');
    expect(rootRouteSource).not.toContain('mantine-shell-compatibility.css');
    expect(appLayoutSource).not.toContain('styles.layer.css');
    expect(appLayoutSource).not.toContain('mantine-shell-compatibility.css');
    expect(applicationChromeSource).toContain("import '@mantine/core/styles.layer.css';");
    expect(applicationChromeSource).toContain(
      "import '../../styles/mantine-shell-compatibility.css';"
    );
    expect(appLayoutSource).not.toContain('precedence');
    expect(appLayoutSource).not.toContain('?url');
    expect(factionDetailSource).toContain(
      "codeSplitGroupings: [['component', 'pendingComponent', 'errorComponent']]"
    );
  });
});
