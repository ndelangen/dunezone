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

function moduleDeclaration(node: ts.Node) {
  if (ts.isImportDeclaration(node)) {
    return node;
  }
  if (ts.isExportDeclaration(node)) {
    return node;
  }
  return undefined;
}

function moduleSpecifier(statement: ts.Statement) {
  const specifier = moduleDeclaration(statement)?.moduleSpecifier;
  if (!specifier) {
    return undefined;
  }
  return ts.isStringLiteral(specifier) ? specifier.text : undefined;
}

function runtimeNames(entries: readonly (ts.ImportSpecifier | ts.ExportSpecifier)[]) {
  return entries.filter((entry) => !entry.isTypeOnly).map((entry) => (entry.propertyName ?? entry.name).text);
}

function importNames(statement: ts.ImportDeclaration, source: ts.SourceFile) {
  const clause = statement.importClause;
  if (!clause) {
    throw new Error(`Use named Mantine imports so their styles can be traced: ${source.fileName}`);
  }
  if (clause.isTypeOnly) {
    return [];
  }
  const bindings = clause.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) {
    throw new Error(`Use named Mantine imports so their styles can be traced: ${source.fileName}`);
  }
  if (clause.name) {
    throw new Error(`Default Mantine imports cannot be traced safely: ${source.fileName}`);
  }
  return runtimeNames(bindings.elements);
}

function exportNames(statement: ts.ExportDeclaration, source: ts.SourceFile) {
  if (statement.isTypeOnly) {
    return [];
  }
  const clause = statement.exportClause;
  if (!clause || !ts.isNamedExports(clause)) {
    throw new Error(`Use named Mantine exports so their styles can be traced: ${source.fileName}`);
  }
  return runtimeNames(clause.elements);
}

function importedNames(statement: ts.Statement, source: ts.SourceFile): string[] {
  const specifier = moduleSpecifier(statement);
  if (!specifier) {
    return [];
  }
  if (specifier.startsWith('@mantine/core/') && !specifier.endsWith('.css')) {
    throw new Error(`Deep Mantine imports cannot be traced safely: ${source.fileName}`);
  }
  if (specifier !== '@mantine/core') {
    return [];
  }
  if (ts.isImportDeclaration(statement)) {
    return importNames(statement, source);
  }
  if (ts.isExportDeclaration(statement)) {
    return exportNames(statement, source);
  }
  return [];
}

function mantineReference(node: ts.Node) {
  return ts.isStringLiteral(node) && node.text.startsWith('@mantine/core');
}

function dynamicMantineImport(node: ts.Node) {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  if (node.expression.kind !== ts.SyntaxKind.ImportKeyword) {
    return false;
  }
  return node.arguments.some(mantineReference);
}

function assertStaticImports(source: ts.SourceFile) {
  function visit(node: ts.Node) {
    if (dynamicMantineImport(node)) {
      throw new Error(`Dynamic Mantine imports cannot be traced safely: ${source.fileName}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

function fileExports(file: string) {
  if (file.endsWith('.css')) {
    return [];
  }
  const source = parse(file);
  assertStaticImports(source);
  return source.statements.flatMap((statement) => importedNames(statement, source));
}

function authoredClassNames(file: string, available: Set<string>) {
  return [...readFileSync(file, 'utf8').matchAll(/\bmantine-([A-Z]\w*)-/g)]
    .map((match) => match[1])
    .filter((name) => available.has(`${name}.css`));
}

function usedExports(files: readonly string[], available: Set<string>) {
  return new Set(files.flatMap((file) => [...fileExports(file), ...authoredClassNames(file, available)]));
}

function moduleExports(statement: ts.Statement, source: ts.SourceFile): [string, string][] {
  if (!ts.isImportDeclaration(statement)) {
    return [];
  }
  const bindings = statement.importClause?.namedBindings;
  if (!bindings || !ts.isNamedImports(bindings)) {
    return [];
  }
  const specifier = moduleSpecifier(statement);
  if (!specifier) {
    return [];
  }
  const file = resolve(dirname(source.fileName), specifier);
  return bindings.elements.map((name) => [name.name.text, file]);
}

function exportedFiles(packageRoot: string) {
  const entry = join(packageRoot, 'esm', 'index.mjs');
  const source = parse(entry);
  return new Map(source.statements.flatMap((statement) => moduleExports(statement, source)));
}

function exportFile(name: string, exports: Map<string, string>) {
  const file = exports.get(name);
  if (!file) {
    throw new Error(`Cannot trace Mantine export ${name}; check the installed package format.`);
  }
  return file;
}

function stylesheetName(file: string, available: Set<string>) {
  if (!file.endsWith('.module.mjs')) {
    return undefined;
  }
  const name = basename(file, '.module.mjs');
  if (!available.has(`${name}.css`)) {
    throw new Error(`Missing Mantine stylesheet for ${file}`);
  }
  return name;
}

function relativeSpecifier(value: string | undefined): value is string {
  return value?.startsWith('.') === true;
}

function dependencies(source: ts.SourceFile) {
  return source.statements
    .map(moduleSpecifier)
    .filter(relativeSpecifier)
    .map((specifier) => resolve(dirname(source.fileName), specifier));
}

function componentStyles(used: Set<string>, packageRoot: string, available: Set<string>) {
  const exports = exportedFiles(packageRoot);
  const sheets = new Set(['baseline', 'default-css-variables', 'global']);
  const visited = new Set<string>();
  const classes = new Set<string>();
  const pending = [...used].map((name) => exportFile(name, exports));
  for (const file of pending) {
    if (visited.has(file)) {
      continue;
    }
    visited.add(file);
    const source = parse(file);
    for (const match of source.text.matchAll(/\bm_[\w]+\b/g)) {
      classes.add(match[0]);
    }
    const sheet = stylesheetName(file, available);
    if (sheet) {
      sheets.add(sheet);
    } else {
      pending.push(...dependencies(source));
    }
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
