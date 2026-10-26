import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vite-plus/test';

/*
 * The kit's Mantine `Tooltip` is the app's one hover label, raised on the Play island (docs/technical/ui-design-decisions.md).
 * A pseudo-element that prints an attribute is a second tooltip with its own look, as the chat bar once had (#2550).
 */
const root = fileURLToPath(new URL('..', import.meta.url));

function stylesheets(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return stylesheets(path);
    }
    return path.endsWith('.css') ? [path] : [];
  });
}

test('no stylesheet draws a tooltip of its own from an attribute', () => {
  const findings = stylesheets(join(root, 'src/app')).flatMap((path) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((line, index) => (/content:\s*attr\(/.test(line) ? [`${relative(root, path)}:${index + 1}`] : []))
  );
  expect(findings, 'Wrap the element in the kit Tooltip instead of printing an attribute from CSS').toEqual([]);
});
