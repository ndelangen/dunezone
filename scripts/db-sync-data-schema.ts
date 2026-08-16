import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, parse } from 'node:path';

import { Glob } from 'bun';
import z from 'zod';

const schemaConfigSchema = z.strictObject({
  name: z.string(),
  schema: z.custom<z.ZodObject<any>>(),
});

const glob = new Glob('src/data/*.ts');

/** Tables whose JSON Schema CHECK should use `type: string` instead of huge string `enum` lists (Zod stays strict). */
const RELAX_STRING_ENUMS = new Set(['factions']);

type SchemaConfig = z.infer<typeof schemaConfigSchema>;

const mySchemas: SchemaConfig[] = [];

// Glob is cwd-relative; run this script from the project root.
for await (const file of glob.scan({
  onlyFiles: true,
})) {
  const { name } = parse(file);
  const module = await import(file);

  if (!module.schema || !(module.schema instanceof z.ZodObject)) {
    console.warn(`⚠ No 'schema' export found in ${file} or it's not a ZodObject, skipping`);
    continue;
  }

  const parsed = schemaConfigSchema.parse({
    name,
    schema: module.schema,
  });
  mySchemas.push(parsed);
}

/** Replace string-only `enum` branches with `{ type: 'string' }` (+ pattern / length if present). */
function relaxStringEnumsInJsonSchema(node: unknown): unknown {
  if (node === null || typeof node !== 'object') {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map(relaxStringEnumsInJsonSchema);
  }

  const obj = node as Record<string, unknown>;
  const enumVal = obj.enum;

  if (Array.isArray(enumVal) && enumVal.length > 0 && enumVal.every((e) => typeof e === 'string')) {
    const next: Record<string, unknown> = { type: 'string' };
    if (typeof obj.pattern === 'string') {
      next.pattern = obj.pattern;
    }
    if (typeof obj.minLength === 'number') {
      next.minLength = obj.minLength;
    }
    if (typeof obj.maxLength === 'number') {
      next.maxLength = obj.maxLength;
    }
    if (typeof obj.description === 'string') {
      next.description = obj.description;
    }
    return next;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = relaxStringEnumsInJsonSchema(v);
  }
  return out;
}

const STRING_RESTRICTION_KEYS = new Set(['pattern', 'minLength', 'maxLength', 'format', 'const', 'enum']);

function sortKeysDeep(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

function schemaDedupeKey(node: unknown): string {
  return JSON.stringify(sortKeysDeep(node));
}

/** Plain `type: string` with no format/pattern/length — matches any JSON string. */
function isUnrestrictedStringSchema(node: unknown): boolean {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    return false;
  }
  const o = node as Record<string, unknown>;
  if (o.type !== 'string') {
    return false;
  }
  for (const key of Object.keys(o)) {
    if (key === 'type' || key === 'description') {
      continue;
    }
    if (STRING_RESTRICTION_KEYS.has(key)) {
      return false;
    }
  }
  return true;
}

function dedupeSchemaBranches(branches: unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const b of branches) {
    const k = schemaDedupeKey(b);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(b);
    }
  }
  return out;
}

function simplifyCombinatorBranches(branches: unknown[], combinator: 'anyOf' | 'oneOf'): unknown {
  const processed = branches.map(simplifyRedundantCombinators);
  const unique = dedupeSchemaBranches(processed);
  if (unique.length === 1) {
    return unique[0];
  }
  if (unique.some(isUnrestrictedStringSchema)) {
    return { type: 'string' };
  }
  return { [combinator]: unique };
}

/** Collapse duplicate `anyOf` / `oneOf` arms and `string | string+format` unions to plain `string`. */
function simplifyRedundantCombinators(node: unknown): unknown {
  if (node === null || typeof node !== 'object') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(simplifyRedundantCombinators);
  }

  const obj = node as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (Array.isArray(obj.anyOf)) {
    const otherKeys = keys.filter((k) => k !== 'anyOf');
    const other: Record<string, unknown> = {};
    for (const k of otherKeys) {
      other[k] = simplifyRedundantCombinators(obj[k]);
    }
    const simplified = simplifyCombinatorBranches(obj.anyOf, 'anyOf');
    if (otherKeys.length === 0) {
      return simplified;
    }
    if (simplified !== null && typeof simplified === 'object' && !Array.isArray(simplified) && 'anyOf' in simplified) {
      return { ...other, anyOf: (simplified as { anyOf: unknown[] }).anyOf };
    }
    return { ...other, ...(simplified as Record<string, unknown>) };
  }

  if (Array.isArray(obj.oneOf)) {
    const otherKeys = keys.filter((k) => k !== 'oneOf');
    const other: Record<string, unknown> = {};
    for (const k of otherKeys) {
      other[k] = simplifyRedundantCombinators(obj[k]);
    }
    const simplified = simplifyCombinatorBranches(obj.oneOf, 'oneOf');
    if (otherKeys.length === 0) {
      return simplified;
    }
    if (simplified !== null && typeof simplified === 'object' && !Array.isArray(simplified) && 'oneOf' in simplified) {
      return { ...other, oneOf: (simplified as { oneOf: unknown[] }).oneOf };
    }
    return { ...other, ...(simplified as Record<string, unknown>) };
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = simplifyRedundantCombinators(v);
  }
  return out;
}

function deriveConstraintName(name: string): string {
  return `${name}_data_schema_check`;
}

function extractTimestamp(filename: string): number | null {
  const match = filename.match(/^(\d{14})_/);
  if (!match) {
    return null;
  }
  return parseInt(match[1], 10);
}

async function findLatestValidationMigration(
  constraintName: string,
  migrationsDir: string
): Promise<{ filename: string; content: string } | null> {
  const files = await readdir(migrationsDir);
  const sqlFiles = files.filter((f) => f.endsWith('.sql'));

  const matchingMigrations: Array<{
    filename: string;
    timestamp: number;
    content: string;
    mtimeMs: number;
  }> = [];

  for (const file of sqlFiles) {
    const filePath = join(migrationsDir, file);
    const content = await readFile(filePath, 'utf-8');

    if (content.includes(constraintName)) {
      const timestamp = extractTimestamp(file);
      if (timestamp !== null) {
        const st = await stat(filePath);
        matchingMigrations.push({
          filename: file,
          timestamp,
          content,
          mtimeMs: st.mtimeMs,
        });
      }
    }
  }

  if (matchingMigrations.length === 0) {
    return null;
  }

  /*
   * Prefer newest on disk so a just-written migration wins over an older file with a higher
   * numeric prefix (e.g. 20260321133000 vs 20260320012157 on the next run). Tie-break: higher
   * filename timestamp (stable clones where mtimes are identical).
   */
  matchingMigrations.sort((a, b) => {
    if (b.mtimeMs !== a.mtimeMs) {
      return b.mtimeMs - a.mtimeMs;
    }
    return b.timestamp - a.timestamp;
  });
  return {
    filename: matchingMigrations[0].filename,
    content: matchingMigrations[0].content,
  };
}

function extractSchemaFromMigration(
  migrationContent: string,
  constraintName: string,
  columnName: string
): object | null {
  // Matches this constraint's `jsonb_matches_schema('<json>'::json, column)` CHECK and captures the JSON literal.
  const constraintRegex = new RegExp(
    `ADD CONSTRAINT ${constraintName}[\\s\\S]*?CHECK\\s*\\(\\s*extensions\\.jsonb_matches_schema\\s*\\(\\s*'([^']*(?:''[^']*)*)'::json\\s*,\\s*${columnName}\\s*\\)\\s*\\)`,
    'i'
  );

  const match = migrationContent.match(constraintRegex);
  if (!match) {
    return null;
  }

  // Unescape the SQL string literal ('' -> ')
  const jsonString = match[1].replace(/''/g, "'");

  try {
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}

/**
 * Deep canonical form for schema equality: object keys sorted; array elements sorted by their own canonical JSON string so `anyOf` / `oneOf` branch order does not matter (the old `array.map(normalize).sort()` compared `[object Object]` and never reordered, so every run looked like a schema change).
 */
function canonicalizeSchemaForComparison(node: unknown): unknown {
  if (node === null || typeof node !== 'object') {
    return node;
  }

  if (Array.isArray(node)) {
    const mapped = node.map(canonicalizeSchemaForComparison);
    return mapped
      .map((item) => ({
        sortKey: JSON.stringify(sortKeysDeep(item)),
        item,
      }))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map((x) => x.item);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(node as Record<string, unknown>).sort();
  for (const key of keys) {
    sorted[key] = canonicalizeSchemaForComparison((node as Record<string, unknown>)[key]);
  }
  return sorted;
}

function compareSchemas(schema1: object, schema2: object): boolean {
  const a = canonicalizeSchemaForComparison(schema1);
  const b = canonicalizeSchemaForComparison(schema2);
  return JSON.stringify(a) === JSON.stringify(b);
}

function generateMigrationSQL(config: SchemaConfig, jsonSchema: object, includeExtension: boolean): string {
  const schemaJsonString = JSON.stringify(jsonSchema, null, 2);
  // Escape single quotes for the SQL string literal (' -> '')
  const escapedSchema = schemaJsonString.replace(/'/g, "''");
  const constraintName = deriveConstraintName(config.name);
  const columnName = 'data';

  const lines: string[] = [];

  if (includeExtension) {
    lines.push('-- Enable pg_jsonschema extension (idempotent)');
    lines.push('CREATE EXTENSION IF NOT EXISTS pg_jsonschema WITH SCHEMA extensions;');
    lines.push('');
  }

  lines.push(`-- Drop existing constraint if it exists (safe for first migration)`);
  lines.push(`ALTER TABLE ${config.name}`);
  lines.push(`  DROP CONSTRAINT IF EXISTS ${constraintName};`);
  if (config.name === 'factions') {
    lines.push(`ALTER TABLE ${config.name}`);
    lines.push(`  DROP CONSTRAINT IF EXISTS factions_data_is_object_check;`);
  }
  lines.push('');
  lines.push(`-- Add CHECK constraint with new schema`);
  lines.push(`ALTER TABLE ${config.name}`);
  lines.push(`  ADD CONSTRAINT ${constraintName}`);
  lines.push(`  CHECK (extensions.jsonb_matches_schema(`);
  lines.push(`    '${escapedSchema}'::json,`);
  lines.push(`    ${columnName}`);
  lines.push(`  ));`);

  return lines.join('\n');
}

function generateMigrationTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

// Main execution

const migrationsDir = './supabase/migrations';
let extensionIncluded = false;

for (const config of mySchemas) {
  const constraintName = deriveConstraintName(config.name);
  const columnName = 'data';

  // Apply the same transforms used in written migrations so comparison is apples-to-apples.
  let newSchema = z.toJSONSchema(config.schema, { unrepresentable: 'any' }) as object;
  if (RELAX_STRING_ENUMS.has(config.name)) {
    newSchema = relaxStringEnumsInJsonSchema(newSchema) as object;
  }
  newSchema = simplifyRedundantCombinators(newSchema) as object;

  const latestMigration = await findLatestValidationMigration(constraintName, migrationsDir);

  if (latestMigration) {
    const extractedRaw = extractSchemaFromMigration(latestMigration.content, constraintName, columnName);

    if (extractedRaw) {
      let extractedComparable = relaxStringEnumsInJsonSchema(extractedRaw) as object;
      extractedComparable = simplifyRedundantCombinators(extractedComparable) as object;

      if (compareSchemas(extractedComparable, newSchema)) {
        console.log(`✓ Schema for ${config.name} unchanged, skipping migration`);
        continue;
      }
    } else {
      console.warn(
        `⚠ Could not parse JSON schema from ${latestMigration.filename} (${constraintName}); generating new migration`
      );
    }
  }

  const migrationSQL = generateMigrationSQL(config, newSchema, !extensionIncluded);

  const timestamp = generateMigrationTimestamp();
  const migrationFilename = `${timestamp}_${config.name}_data_validation.sql`;
  const migrationPath = join(migrationsDir, migrationFilename);

  await writeFile(migrationPath, migrationSQL);
  console.log(`✓ Generated migration: ${migrationFilename}`);

  if (!extensionIncluded) {
    extensionIncluded = true;
  }
}

console.log('✓ Schema generation complete');
