import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx|mjs|css)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function parse(file: string) {
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

function importedNames(statement: ts.Statement, file: string): string[] {
  if (
    !(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) ||
    !statement.moduleSpecifier ||
    !ts.isStringLiteral(statement.moduleSpecifier)
  ) {
    return [];
  }
  const specifier = statement.moduleSpecifier.text;
  if (specifier.startsWith('@mantine/core/') && !specifier.endsWith('.css')) {
    throw new Error(`Deep Mantine imports cannot be traced safely: ${file}`);
  }
  if (specifier !== '@mantine/core') {
    return [];
  }
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause;
    if (clause?.isTypeOnly) {
      return [];
    }
    if (!clause?.namedBindings || !ts.isNamedImports(clause.namedBindings) || clause.name) {
      throw new Error(`Use named Mantine imports so their styles can be traced: ${file}`);
    }
    return clause.namedBindings.elements
      .filter((entry) => !entry.isTypeOnly)
      .map((entry) => (entry.propertyName ?? entry.name).text);
  }
  if (statement.isTypeOnly) {
    return [];
  }
  if (!statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
    throw new Error(`Use named Mantine exports so their styles can be traced: ${file}`);
  }
  return statement.exportClause.elements
    .filter((entry) => !entry.isTypeOnly)
    .map((entry) => (entry.propertyName ?? entry.name).text);
}

function assertStaticImports(source: ts.SourceFile, file: string) {
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.some((arg) => ts.isStringLiteral(arg) && arg.text.startsWith('@mantine/core'))
    ) {
      throw new Error(`Dynamic Mantine imports cannot be traced safely: ${file}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

function usedExports(files: readonly string[], available: Set<string>) {
  const used = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (!file.endsWith('.css')) {
      const source = parse(file);
      for (const statement of source.statements) {
        for (const name of importedNames(statement, file)) {
          used.add(name);
        }
      }
      assertStaticImports(source, file);
    }
    /* A hand-written Mantine class is a consumer too, even without a component import. */
    for (const match of text.matchAll(/\bmantine-([A-Z]\w*)-/g)) {
      if (available.has(`${match[1]}.css`)) {
        used.add(match[1]);
      }
    }
  }
  return used;
}

function exportedFiles(packageRoot: string) {
  const entry = join(packageRoot, 'esm', 'index.mjs');
  const exports = new Map<string, string>();
  for (const statement of parse(entry).statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const name of bindings.elements) {
          exports.set(name.name.text, resolve(dirname(entry), statement.moduleSpecifier.text));
        }
      }
    }
  }
  return exports;
}

function componentStyles(used: Set<string>, packageRoot: string, available: Set<string>) {
  const exports = exportedFiles(packageRoot);
  const sheets = new Set(['baseline', 'default-css-variables', 'global']);
  const visited = new Set<string>();
  const classes = new Set<string>();
  function visit(file: string) {
    if (visited.has(file)) {
      return;
    }
    visited.add(file);
    const source = parse(file);
    for (const match of source.text.matchAll(/\bm_[\w]+\b/g)) {
      classes.add(match[0]);
    }
    if (file.endsWith('.module.mjs')) {
      const name = basename(file, '.module.mjs');
      if (!available.has(`${name}.css`)) {
        throw new Error(`Missing Mantine stylesheet for ${file}`);
      }
      sheets.add(name);
      return;
    }
    for (const statement of source.statements) {
      if (
        (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text.startsWith('.')
      ) {
        visit(resolve(dirname(file), statement.moduleSpecifier.text));
      }
    }
  }
  for (const name of used) {
    const file = exports.get(name);
    if (!file) {
      throw new Error(`Cannot trace Mantine export ${name}; check the installed package format.`);
    }
    visit(file);
  }
  return { sheets, classes };
}

/** Keeps every reachable component's own CSS and its dependencies, in the vendor bundle's order. */
export function mantineStyles(files: readonly string[], packageRoot: string) {
  const styles = join(packageRoot, 'styles');
  const full = readFileSync(join(packageRoot, 'styles.css'), 'utf8');
  const available = new Set(
    readdirSync(styles).filter((name) => name.endsWith('.css') && !name.endsWith('.layer.css'))
  );
  const { sheets, classes } = componentStyles(usedExports(files, available), packageRoot, available);
  const ordered = [...sheets]
    .map((name) => {
      const css = readFileSync(join(styles, `${name}.css`), 'utf8').trim();
      const position = full.indexOf(css);
      if (position < 0) {
        throw new Error(`Mantine ${name} CSS no longer matches the full bundle.`);
      }
      return { name, css, position };
    })
    .sort((a, b) => a.position - b.position);
  const retained = ordered.map(({ css }) => css).join('\n');
  for (const name of classes) {
    if (full.includes(`.${name}`) && !retained.includes(`.${name}`)) {
      throw new Error(`Reachable Mantine class ${name} has no retained stylesheet.`);
    }
  }
  return {
    css:
      '/* Generated by bun run generate:mantine-css. Keep vendor order and declarations intact. */\n\n' +
      ordered.map(({ name }) => `@import "@mantine/core/styles/${name}.layer.css";`).join('\n') +
      '\n',
    sheets: ordered.map(({ name }) => name),
    retainedBytes: Buffer.byteLength(retained),
    fullBytes: Buffer.byteLength(full),
  };
}

if (import.meta.main) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const result = mantineStyles(
    [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, '.storybook'))],
    join(root, 'node_modules/@mantine/core')
  );
  const output = join(root, 'src/app/styles/mantine.generated.css');
  if (process.argv.includes('--check')) {
    if (readFileSync(output, 'utf8') !== result.css) {
      throw new Error('Mantine styles changed. Run bun run generate:mantine-css before building.');
    }
  } else {
    writeFileSync(output, result.css);
  }
  console.log(`Mantine CSS: ${result.sheets.length} sheets, ${result.retainedBytes} of ${result.fullBytes} bytes.`);
}
