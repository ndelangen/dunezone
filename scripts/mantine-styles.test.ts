import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, test } from 'vite-plus/test';

import { mantineStyles, sourceFiles } from './mantine-styles';

const roots: string[] = [];
const vendor = resolve('node_modules/@mantine/core');
function entry(source: string, extension = 'tsx') {
  const folder = mkdtempSync(join(tmpdir(), 'mantine-css-'));
  roots.push(folder);
  const file = join(folder, `consumer.${extension}`);
  writeFileSync(file, source);
  return file;
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('Mantine stylesheet coverage', () => {
  test('discovers imports in every supported source extension', () => {
    const files = ['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts'].map((extension) =>
      entry("import { Modal } from '@mantine/core';", extension)
    );
    for (const file of files) {
      expect(mantineStyles(sourceFiles(resolve(file, '..')), vendor).sheets).toContain('Modal');
    }
  });

  test('retains Button dependencies rather than only its directly imported stylesheet', () => {
    const result = mantineStyles([entry("import { Button as Action, type ModalProps } from '@mantine/core';")], vendor);
    expect(result.sheets).toEqual(
      expect.arrayContaining(['baseline', 'default-css-variables', 'global', 'Button', 'UnstyledButton', 'Loader'])
    );
    expect(result.sheets).not.toContain('Modal');
  });

  test('traces re-exports and composite controls through their real dependency graph', () => {
    const result = mantineStyles([entry("export { Select as Choice } from '@mantine/core';")], vendor);
    expect(result.sheets).toEqual(expect.arrayContaining(['Combobox', 'Input', 'ScrollArea']));
  });

  test('retains styles referenced through an authored Mantine class', () => {
    const result = mantineStyles([entry('.mantine-Button-root { margin: 0; }', 'css')], vendor);
    expect(result.sheets).toEqual(expect.arrayContaining(['Button', 'UnstyledButton', 'Loader']));
  });

  test('adding a component changes the generated entry without changing component styling', () => {
    const file = entry("import { Button } from '@mantine/core';");
    const before = mantineStyles([file], vendor);
    writeFileSync(file, "import { Button, Modal } from '@mantine/core';");
    const after = mantineStyles([file], vendor);
    expect(after.css).not.toBe(before.css);
    expect(after.sheets).toContain('Modal');
    expect(after.css).toContain('@mantine/core/styles/Button.layer.css');
  });

  test('keeps every selected fragment verbatim and in the original vendor cascade order', () => {
    const result = mantineStyles(
      [entry("import { Button, Select, Drawer, Tooltip, ColorInput } from '@mantine/core';")],
      vendor
    );
    const full = readFileSync(join(vendor, 'styles.css'), 'utf8');
    const positions = result.sheets.map((name) =>
      full.indexOf(readFileSync(join(vendor, 'styles', `${name}.css`), 'utf8').trim())
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const name of result.sheets) {
      expect(result.css).toContain(`@mantine/core/styles/${name}.layer.css`);
    }
  });

  test.each([
    "import * as UI from '@mantine/core';",
    "export * from '@mantine/core';",
    "const UI = await import('@mantine/core');",
    'const UI = await import(`@mantine/core`);',
    'const UI = await import(`@mantine/core/${component}`);',
    "const UI = require('@mantine/core');",
    "import UI = require('@mantine/core');",
    "import { Button } from '@mantine/core/esm/components/Button/Button.mjs';",
  ])('fails rather than guessing when a consumer cannot be traced: %s', (source) =>
    expect(() => mantineStyles([entry(source)], vendor)).toThrow(/traced|trace/)
  );
});
