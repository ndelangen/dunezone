import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import type { Id, TableNames } from '../../convex/_generated/dataModel';
import { SNAPSHOT_REBUILD_CONTRACT } from '../../convex/lib/provisioningContract';
import {
  installedComponents,
  placeholderOwner,
  retiredComponents,
  retiredTables,
  snapshotPolicy,
} from './snapshot-policy';

/**
 * Turns a Convex export into the anonymised snapshot that local and cloud dev load instead of production (#1559).
 *
 * Both sides use the layout `convex export` writes: `_tables/documents.jsonl` maps each table to its number, and `<table>/documents.jsonl` holds one document per line.
 * The module is pure: entries go in as a map from path to text and come out the same way, and the script entry does the zip work.
 * It fails closed.
 * Anything the policy does not name stops the run, and so does any hit from the leak scan that runs on the output before it is returned.
 * Errors and reports name tables and fields and give counts, never values, because CI logs on this repository are public.
 */

/** A Convex export or snapshot: each zip entry's path and its UTF-8 text. */
export type ExportEntries = ReadonlyMap<string, string>;

/** Written into every snapshot, so a loader can refuse a raw export. */
export const SNAPSHOT_MANIFEST = 'snapshot-manifest.json';

const SNAPSHOT_FORMAT = 'dunezone-anonymised-snapshot';

export type SnapshotManifest = {
  format: typeof SNAPSHOT_FORMAT;
  version: 1;
  placeholderOwner: { userId: Id<'users'>; profileId: Id<'profiles'> };
  rows: Record<string, number>;
};

type TableReport = {
  table: string;
  /** Why the policy drops the table, or null when it keeps it. */
  dropReason: string | null;
  rowsIn: number;
  rowsOut: number;
  droppedFields: string[];
};

type ComponentReport = { component: string; dropReason: string };

export type SnapshotReport = { tables: TableReport[]; droppedComponents: ComponentReport[] };

type LeakKind = 'email' | 'token' | 'denied field' | 'sign-in table' | 'user row' | 'profile row' | 'unexpected entry';

/** Where a leak was found, never what it was. */
export type LeakFinding = { table: string; field: string; kind: LeakKind };

/**
 * A problem that names several things, one per line under its heading.
 * A log viewer that cuts long lines then still shows every name, and the step summary renders it as a nested list.
 */
function listed(heading: string, names: readonly string[]): string {
  return [`${heading}:`, ...names.map((name) => `  - ${name}`)].join('\n');
}

export class SnapshotRefused extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`The snapshot was refused:\n- ${problems.join('\n- ')}`);
    this.name = 'SnapshotRefused';
    this.problems = problems;
  }
}

/*
 * Convex document ids.
 * An id is the table number as an unsigned LEB128 varint, sixteen bytes of internal id and a Fletcher-16 checksum
 * (sums modulo 256), written in lowercase base32 with the Crockford alphabet. Ids from a local backend export decode
 * this way, so the anonymiser can check that every document sits in the table it claims and mint placeholder ids the
 * importer accepts.
 */

const ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const INTERNAL_ID_BYTES = 16;
const CHECKSUM_BYTES = 2;

function varint(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  bytes.push(rest);
  return bytes;
}

function readVarint(bytes: readonly number[]): { value: number; length: number } | null {
  let value = 0;
  for (let index = 0; index < Math.min(bytes.length, 5); index += 1) {
    const byte = bytes[index]!;
    value += (byte & 0x7f) * 2 ** (7 * index);
    if ((byte & 0x80) === 0) {
      return { value, length: index + 1 };
    }
  }
  return null;
}

function fletcher16(bytes: readonly number[]): [number, number] {
  let sum = 0;
  let sumOfSums = 0;
  for (const byte of bytes) {
    sum = (sum + byte) % 256;
    sumOfSums = (sumOfSums + sum) % 256;
  }
  return [sum, sumOfSums];
}

function base32Encode(bytes: readonly number[]): string {
  let text = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = ((buffer << 8) | byte) & 0xff_ff;
    bits += 8;
    while (bits >= 5) {
      text += ID_ALPHABET[(buffer >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    text += ID_ALPHABET[(buffer << (5 - bits)) & 31];
  }
  return text;
}

function base32Decode(text: string): number[] | null {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of text) {
    const digit = ID_ALPHABET.indexOf(character);
    if (digit < 0) {
      return null;
    }
    buffer = ((buffer << 5) | digit) & 0xff_ff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return bytes;
}

export function encodeDocumentId(tableNumber: number, internalId: Uint8Array): string {
  if (internalId.length !== INTERNAL_ID_BYTES) {
    throw new Error(`An internal id has ${INTERNAL_ID_BYTES} bytes`);
  }
  const body = [...varint(tableNumber), ...internalId];
  return base32Encode([...body, ...fletcher16(body)]);
}

/** The table number a document id belongs to, or null when the text is not a well-formed id. */
export function tableNumberOfId(id: string): number | null {
  const bytes = base32Decode(id);
  if (!bytes) {
    return null;
  }
  const table = readVarint(bytes);
  if (!table || bytes.length !== table.length + INTERNAL_ID_BYTES + CHECKSUM_BYTES) {
    return null;
  }
  const body = bytes.slice(0, -CHECKSUM_BYTES);
  const [sum, sumOfSums] = fletcher16(body);
  const checksumMatches = bytes.at(-2) === sum && bytes.at(-1) === sumOfSums;
  /* Re-encoding rules out stray padding bits, so each id has exactly one spelling. */
  return checksumMatches && base32Encode(bytes) === id ? table.value : null;
}

function placeholderId(tableNumber: number, table: string): string {
  const internalId = createHash('sha256').update(`dunezone snapshot placeholder ${table}`).digest();
  return encodeDocumentId(tableNumber, internalId.subarray(0, INTERNAL_ID_BYTES));
}

/*
 * The policy, seen at runtime.
 * The typed policy in snapshot-policy.ts is what typecheck holds to the schema; this is the same object with its
 * per-table types erased, so one loop can walk every table.
 */

type FieldRule =
  | 'keep'
  | 'drop'
  | 'owner'
  | { parent: TableNames }
  | { orNull: TableNames }
  | { project: (value: unknown) => unknown };

type RowRule = 'all' | ((row: Readonly<Record<string, unknown>>) => boolean);

type TablePolicy = { drop: string } | { fields: Readonly<Record<string, FieldRule>>; rows: RowRule };

type KeptPolicy = Extract<TablePolicy, { fields: unknown }>;

/* A retired table is dropped like any table the policy drops. The types keep its name apart from the schema's. */
const policy: Readonly<Record<string, TablePolicy>> = {
  ...Object.fromEntries(Object.entries(retiredTables).map(([table, reason]) => [table, { drop: reason }])),
  ...snapshotPolicy,
};

const componentPolicy: Readonly<Record<string, string>> = { ...installedComponents, ...retiredComponents };

/*
 * Every lookup by a name from the export reads own keys only. A plain object also answers `constructor` or
 * `toString` through its prototype, which would let a table or field of that name pass as classified.
 */

function tablePolicy(table: string): TablePolicy | null {
  return Object.hasOwn(policy, table) ? policy[table]! : null;
}

/** Why the policy drops a component's data, or null when it does not name the component. */
function componentDropReason(component: string): string | null {
  return Object.hasOwn(componentPolicy, component) ? componentPolicy[component]! : null;
}

function keptPolicy(table: string): KeptPolicy | null {
  const entry = tablePolicy(table);
  return entry && 'fields' in entry ? entry : null;
}

function fieldRule(kept: KeptPolicy, field: string): FieldRule | null {
  return Object.hasOwn(kept.fields, field) ? kept.fields[field]! : null;
}

function referencedTable(rule: FieldRule): TableNames | null {
  if (typeof rule === 'string') {
    return null;
  }
  if ('parent' in rule) {
    return rule.parent;
  }
  return 'orNull' in rule ? rule.orNull : null;
}

/** Kept tables in an order where every table comes after the tables its references point at. */
function keptTableOrder(): string[] {
  const order: string[] = [];
  const visiting = new Set<string>();
  const visit = (table: string) => {
    if (order.includes(table)) {
      return;
    }
    if (visiting.has(table)) {
      throw new Error(`The snapshot policy's references form a cycle through ${table}`);
    }
    visiting.add(table);
    for (const rule of Object.values(keptPolicy(table)?.fields ?? {})) {
      const target = referencedTable(rule);
      if (target && keptPolicy(target)) {
        visit(target);
      }
    }
    visiting.delete(table);
    order.push(table);
  };
  Object.keys(policy).filter(keptPolicy).forEach(visit);
  return order;
}

/*
 * Reading the export's layout.
 * Every entry is either a part of the layout below or a reason to stop.
 */

const TABLE_MAP = '_tables/documents.jsonl';
const TABLE_ENTRY = /^([A-Za-z][A-Za-z0-9_]*)\/(documents|generated_schema)\.jsonl$/;
/*
 * A component's data, as the Convex backend's export writes it (`get_export_path_prefix` in crates/exports/src/lib.rs):
 * `_components/<name>/` once for each level of the component's path, then its `_tables` map and its tables' two files
 * in the root's layout. The first name is the component the app installs, so the whole tree under it is that component's.
 * Component names are Convex identifiers, and table names start with a letter, as at the root.
 */
const COMPONENT_ENTRY =
  /^_components\/([A-Za-z_][A-Za-z0-9_]*)\/(?:_components\/[A-Za-z_][A-Za-z0-9_]*\/)*(?:_tables\/documents|[A-Za-z][A-Za-z0-9_]*\/(?:documents|generated_schema))\.jsonl$/;
const EMPTY_STORAGE = '_storage/documents.jsonl';
/* The schema file of a table whose values are all plain JSON. Anything else carries typed values that plain JSON rows would lose. */
const PLAIN_SCHEMA = '"uniform"';

type Layout = {
  tableNumbers: Map<string, number>;
  documents: Map<string, string>;
  schemas: Map<string, string>;
  components: Set<string>;
};

function jsonLines(text: string): string[] {
  return text.split('\n').filter((line) => line.trim().length > 0);
}

function parseJsonObject(line: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readTableMap(text: string, problems: string[]): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const line of jsonLines(text)) {
    const entry = parseJsonObject(line);
    if (typeof entry?.name !== 'string' || typeof entry.id !== 'number' || !Number.isInteger(entry.id)) {
      problems.push(`${TABLE_MAP} has a line that is not a table entry`);
      continue;
    }
    numbers.set(entry.name, entry.id);
  }
  return numbers;
}

function readLayout(input: ExportEntries, problems: string[]): Layout {
  const layout: Layout = { tableNumbers: new Map(), documents: new Map(), schemas: new Map(), components: new Set() };
  const unexpected: string[] = [];
  const unclassifiedComponents = new Set<string>();
  for (const [path, text] of input) {
    const table = TABLE_ENTRY.exec(path);
    const component = COMPONENT_ENTRY.exec(path)?.[1];
    switch (true) {
      case path === 'README.md':
        break;
      case path === TABLE_MAP:
        layout.tableNumbers = readTableMap(text, problems);
        break;
      case path === EMPTY_STORAGE && jsonLines(text).length === 0:
        break;
      case table !== null && table[2] === 'documents':
        layout.documents.set(table[1]!, text);
        break;
      case table !== null:
        layout.schemas.set(table[1]!, text);
        break;
      case component !== undefined && componentDropReason(component) !== null:
        layout.components.add(component);
        break;
      case component !== undefined:
        unclassifiedComponents.add(component);
        break;
      default:
        unexpected.push(path);
    }
  }
  if (!input.has(TABLE_MAP)) {
    problems.push(`the export has no ${TABLE_MAP}`);
  }
  if (unexpected.length > 0) {
    problems.push(listed('unexpected entries', unexpected.sort()));
  }
  if (unclassifiedComponents.size > 0) {
    problems.push(listed('components the snapshot policy does not classify', [...unclassifiedComponents].sort()));
  }
  const unclassified = [...new Set([...layout.tableNumbers.keys(), ...layout.documents.keys()])]
    .filter((table) => tablePolicy(table) === null)
    .sort();
  if (unclassified.length > 0) {
    problems.push(listed('tables the snapshot policy does not classify', unclassified));
  }
  const unmapped = [...layout.documents.keys()].filter((table) => !layout.tableNumbers.has(table)).sort();
  if (unmapped.length > 0) {
    problems.push(listed(`tables missing from ${TABLE_MAP}`, unmapped));
  }
  return layout;
}

/*
 * Anonymising.
 */

type Row = Record<string, unknown>;

type Placeholder = SnapshotManifest['placeholderOwner'];

function parseTableRows(table: string, text: string, tableNumber: number, problems: string[]): Row[] {
  const counts = new Map<string, number>();
  const count = (problem: string) => counts.set(problem, (counts.get(problem) ?? 0) + 1);
  const rows: Row[] = [];
  for (const line of jsonLines(text)) {
    const row = parseJsonObject(line);
    if (row === null) {
      count('lines that are not documents');
    } else if (typeof row._id !== 'string' || tableNumberOfId(row._id) !== tableNumber) {
      count('documents whose _id is not an id of this table');
    } else if (typeof row._creationTime !== 'number') {
      count('documents without a numeric _creationTime');
    } else {
      rows.push(row);
    }
  }
  for (const [problem, total] of counts) {
    problems.push(`${table}: ${total} ${problem}`);
  }
  return rows;
}

type IsKept = (table: TableNames, id: unknown) => boolean;

/**
 * Whether a row is published: its row rule says so, and every `parent` rule finds the row it points at kept.
 * It walks the policy rather than the row, so a row without a parent reference is dropped instead of skipping the check.
 */
function isPublished(kept: KeptPolicy, row: Row, isKept: IsKept): boolean {
  if (kept.rows !== 'all' && kept.rows(row) !== true) {
    return false;
  }
  return Object.entries(kept.fields).every(([field, rule]) => {
    const parent = typeof rule === 'object' && 'parent' in rule ? rule.parent : null;
    return parent === null || (Object.hasOwn(row, field) && isKept(parent, row[field]));
  });
}

/** A published row with only its classified fields, its user references on the placeholder and its projections applied. */
function anonymiseRow(kept: KeptPolicy, row: Row, isKept: IsKept, placeholder: Placeholder, unprojected: string[]) {
  const anonymised: Row = { _id: row._id, _creationTime: row._creationTime };
  for (const [field, rule] of Object.entries(kept.fields)) {
    if (!Object.hasOwn(row, field)) {
      continue;
    }
    const value = row[field];
    switch (rule) {
      case 'drop':
        break;
      case 'keep':
        anonymised[field] = value;
        break;
      case 'owner':
        anonymised[field] = placeholder.userId;
        break;
      default:
        if ('parent' in rule) {
          anonymised[field] = value;
        } else if ('orNull' in rule) {
          anonymised[field] = isKept(rule.orNull, value) ? value : null;
        } else {
          try {
            anonymised[field] = rule.project(value);
          } catch {
            unprojected.push(field);
          }
        }
    }
  }
  return anonymised;
}

/** Keeps a table's published rows, each with only its classified fields, and its references resolved. */
function anonymiseRows(
  table: string,
  kept: KeptPolicy,
  rows: readonly Row[],
  keptIds: ReadonlyMap<string, ReadonlySet<unknown>>,
  placeholder: Placeholder,
  problems: string[]
): Row[] {
  const isKept: IsKept = (target, id) => keptIds.get(target)?.has(id) === true;
  const unclassified = new Set<string>();
  const unprojected = new Map<string, number>();
  const output: Row[] = [];
  for (const row of rows) {
    for (const field of Object.keys(row)) {
      if (field !== '_id' && field !== '_creationTime' && fieldRule(kept, field) === null) {
        unclassified.add(field);
      }
    }
    if (!isPublished(kept, row, isKept)) {
      continue;
    }
    const failed: string[] = [];
    const anonymised = anonymiseRow(kept, row, isKept, placeholder, failed);
    for (const field of failed) {
      unprojected.set(field, (unprojected.get(field) ?? 0) + 1);
    }
    if (failed.length === 0) {
      output.push(anonymised);
    }
  }
  if (unclassified.size > 0) {
    problems.push(listed(`${table}: fields the snapshot policy does not classify`, [...unclassified].sort()));
  }
  for (const field of [...unprojected.keys()].sort()) {
    problems.push(`${table}: ${unprojected.get(field)} rows whose ${field} the snapshot cannot project`);
  }
  return output;
}

/** The placeholder owner's ids, which take the export's own numbers for users and profiles so the importer places them there. */
function placeholderFor(layout: Layout, problems: string[]): Placeholder {
  const usersNumber = layout.tableNumbers.get('users');
  const profilesNumber = layout.tableNumbers.get('profiles');
  if (usersNumber === undefined || profilesNumber === undefined) {
    throw new SnapshotRefused([
      ...problems,
      `${TABLE_MAP} must list users and profiles, whose numbers the placeholder owner's ids need`,
    ]);
  }
  return {
    userId: placeholderId(usersNumber, 'users') as Id<'users'>,
    profileId: placeholderId(profilesNumber, 'profiles') as Id<'profiles'>,
  };
}

type PlaceholderTable = (typeof SNAPSHOT_REBUILD_CONTRACT.placeholderOnly)[number];

/** Everything a snapshot holds in `users` and `profiles`: the placeholder owner's one row in each. */
function placeholderRows(placeholder: Placeholder): Record<PlaceholderTable, Row[]> {
  return {
    users: [{ _id: placeholder.userId, _creationTime: placeholderOwner.creationTime, ...placeholderOwner.user() }],
    profiles: [
      {
        _id: placeholder.profileId,
        _creationTime: placeholderOwner.creationTime,
        ...placeholderOwner.profile(placeholder.userId),
      },
    ],
  };
}

/** Every table the snapshot writes, with its rows: the kept tables, plus the placeholder owner's user and profile. */
function anonymiseTables(layout: Layout, placeholder: Placeholder, problems: string[]): Map<string, Row[]> {
  const outputs = new Map<string, Row[]>();
  const keptIds = new Map<string, Set<unknown>>();
  for (const table of keptTableOrder()) {
    const tableNumber = layout.tableNumbers.get(table);
    if (tableNumber === undefined) {
      continue;
    }
    const rows = parseTableRows(table, layout.documents.get(table) ?? '', tableNumber, problems);
    const kept = anonymiseRows(table, keptPolicy(table)!, rows, keptIds, placeholder, problems);
    keptIds.set(table, new Set(kept.map((row) => row._id)));
    outputs.set(table, kept);
  }
  for (const [table, rows] of Object.entries(placeholderRows(placeholder))) {
    outputs.set(table, rows);
  }
  return outputs;
}

function toJsonLines(rows: readonly unknown[]): string {
  return rows.map((row) => `${JSON.stringify(row)}\n`).join('');
}

function snapshotEntries(layout: Layout, outputs: ReadonlyMap<string, Row[]>, placeholder: Placeholder) {
  const tables = [...outputs.keys()]
    .map((name) => ({ name, id: layout.tableNumbers.get(name)! }))
    .sort((left, right) => left.id - right.id);
  const entries = new Map<string, string>([[TABLE_MAP, toJsonLines(tables)]]);
  for (const { name } of tables) {
    entries.set(`${name}/documents.jsonl`, toJsonLines(outputs.get(name)!));
  }
  const manifest: SnapshotManifest = {
    format: SNAPSHOT_FORMAT,
    version: 1,
    placeholderOwner: placeholder,
    rows: Object.fromEntries(tables.map(({ name }) => [name, outputs.get(name)!.length])),
  };
  entries.set(SNAPSHOT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  return entries;
}

function reportFor(layout: Layout, outputs: ReadonlyMap<string, Row[]>): SnapshotReport {
  const tables = [...layout.tableNumbers.keys()].sort().map((table) => {
    const entry = tablePolicy(table);
    const fields = Object.entries(keptPolicy(table)?.fields ?? {});
    return {
      table,
      dropReason: entry && 'drop' in entry ? entry.drop : null,
      rowsIn: jsonLines(layout.documents.get(table) ?? '').length,
      rowsOut: outputs.get(table)?.length ?? 0,
      droppedFields: fields.filter(([, rule]) => rule === 'drop').map(([field]) => field),
    };
  });
  const droppedComponents = [...layout.components]
    .sort()
    .map((component) => ({ component, dropReason: componentDropReason(component)! }));
  return { tables, droppedComponents };
}

/**
 * Anonymises one export and scans the result.
 * Throws `SnapshotRefused` listing every problem it found, so one dry run reports all of them at once.
 */
export function anonymiseExport(input: ExportEntries): { entries: Map<string, string>; report: SnapshotReport } {
  const problems: string[] = [];
  const layout = readLayout(input, problems);
  for (const [table, schema] of layout.schemas) {
    if (keptPolicy(table) && schema.trim() !== PLAIN_SCHEMA) {
      problems.push(`${table}: its generated schema is not plain JSON, and typed values would not survive`);
    }
  }
  const placeholder = placeholderFor(layout, problems);
  const outputs = anonymiseTables(layout, placeholder, problems);
  const entries = snapshotEntries(layout, outputs, placeholder);
  for (const { table, field, kind } of scanSnapshot(entries)) {
    problems.push(`leak scan: ${kind} in ${table}.${field}`);
  }
  if (problems.length > 0) {
    throw new SnapshotRefused(problems);
  }
  return { entries, report: reportFor(layout, outputs) };
}

/*
 * Checking a snapshot before a loader clears or imports anything.
 * A check that fails only after the import would leave cloud dev cleared, so every condition the rebuild contract
 * reads from the file is checked here first.
 */

/** Each table's document lines, for every `<table>/documents.jsonl` entry. */
function snapshotRows(entries: ExportEntries): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  for (const [path, text] of entries) {
    const table = TABLE_ENTRY.exec(path);
    if (table?.[2] === 'documents') {
      rows.set(table[1]!, jsonLines(text));
    }
  }
  return rows;
}

/**
 * Tables whose row count in the file is not the count the manifest records.
 * The manifest's keys and values come from the file, so it names only tables the file carries or the policy names, and counts the rest.
 */
function rowCountProblems(recorded: unknown, rows: ReadonlyMap<string, readonly string[]>): string[] {
  if (typeof recorded !== 'object' || recorded === null || Array.isArray(recorded)) {
    return [`${SNAPSHOT_MANIFEST} records no row counts`];
  }
  const counts = recorded as Record<string, unknown>;
  const names = new Set([...Object.keys(counts), ...rows.keys()]);
  const nameable = (name: string) => rows.has(name) || tablePolicy(name) !== null;
  const unnamed = [...names].filter((name) => !nameable(name)).length;
  const differing = [...names]
    .filter(nameable)
    .sort()
    .flatMap((table) => {
      const count = Object.hasOwn(counts, table) ? counts[table] : undefined;
      const held = rows.get(table)?.length;
      if (count === held) {
        return [];
      }
      const inManifest = typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : 'no count';
      return [`${table}: ${inManifest} in the manifest, ${held ?? 'no entry'} in the file`];
    });
  return [
    ...(differing.length > 0 ? [listed('tables whose rows differ from the manifest', differing)] : []),
    ...(unnamed > 0
      ? [
          `${SNAPSHOT_MANIFEST} counts rows for ${unnamed} ${unnamed === 1 ? 'name' : 'names'} that the file and the policy do not hold`,
        ]
      : []),
  ];
}

/**
 * Tables the file carries that the policy drops or does not name.
 * The placeholder owner's `users` and `profiles` are the exception.
 */
function policyProblems(entries: ExportEntries): string[] {
  const placeholderTables: readonly string[] = SNAPSHOT_REBUILD_CONTRACT.placeholderOnly;
  const tables = [
    ...new Set([...entries.keys()].map((path) => TABLE_ENTRY.exec(path)?.[1]).filter((table) => table !== undefined)),
  ].sort();
  const dropped = tables.filter(
    (table) => tablePolicy(table) !== null && keptPolicy(table) === null && !placeholderTables.includes(table)
  );
  const unclassified = tables.filter((table) => tablePolicy(table) === null);
  return [
    ...(dropped.length > 0 ? [listed('tables the snapshot policy drops', dropped)] : []),
    ...(unclassified.length > 0 ? [listed('tables the snapshot policy does not classify', unclassified)] : []),
  ];
}

/** Tables the rebuild contract requires rows in, which the file leaves empty or out. */
function requiredRowProblems(rows: ReadonlyMap<string, readonly string[]>): string[] {
  const empty = SNAPSHOT_REBUILD_CONTRACT.required.filter((table) => (rows.get(table)?.length ?? 0) === 0);
  return empty.length > 0 ? [listed('tables that must hold rows, which the file leaves empty', empty)] : [];
}

/**
 * `users` and `profiles` must each hold the placeholder owner's row alone, exactly as the anonymiser writes it under the manifest's ids.
 * That covers the contract's checks on them: one row each, and no email, phone, name or image on the user.
 */
function placeholderProblems(entries: ExportEntries, rows: ReadonlyMap<string, readonly string[]>): string[] {
  const ids = manifestPlaceholder(entries);
  if (typeof ids.users !== 'string' || typeof ids.profiles !== 'string') {
    return [`${SNAPSHOT_MANIFEST} does not name the placeholder owner's rows`];
  }
  const expected = placeholderRows({ userId: ids.users as Id<'users'>, profileId: ids.profiles as Id<'profiles'> });
  const differing = SNAPSHOT_REBUILD_CONTRACT.placeholderOnly.filter(
    (table) => !isDeepStrictEqual((rows.get(table) ?? []).map(parseJsonObject), expected[table])
  );
  return differing.length > 0 ? [listed("tables that must hold the placeholder owner's row alone", differing)] : [];
}

/**
 * Checks that entries are a snapshot the anonymiser wrote, and that loading them meets the rebuild contract, before a loader clears or imports anything.
 * They need the anonymiser's manifest, which a raw Convex export lacks, and in every table the row count the manifest records.
 * Every table must be one the policy keeps, apart from `users` and `profiles`, which hold the placeholder owner's row alone.
 * The tables the contract requires must hold rows, and the leak scan must find nothing.
 * Throws `SnapshotRefused` naming every problem by table and field, never by value.
 */
export function verifySnapshot(entries: ExportEntries): SnapshotManifest {
  const rows = snapshotRows(entries);
  const manifest = parseJsonObject(entries.get(SNAPSHOT_MANIFEST) ?? '');
  const fromAnonymiser = manifest?.format === SNAPSHOT_FORMAT && manifest.version === 1;
  const problems = [
    ...(fromAnonymiser
      ? rowCountProblems(manifest.rows, rows)
      : [`the file has no ${SNAPSHOT_MANIFEST} from the anonymiser, so it is not an anonymised snapshot`]),
    ...policyProblems(entries),
    ...requiredRowProblems(rows),
    ...(fromAnonymiser ? placeholderProblems(entries, rows) : []),
    ...scanSnapshot(entries).map(({ table, field, kind }) => `leak scan: ${kind} in ${table}.${field}`),
  ];
  if (problems.length > 0) {
    throw new SnapshotRefused(problems);
  }
  return manifest as SnapshotManifest;
}

/*
 * The leak scan.
 * It is independent of the policy on purpose: a policy mistake that keeps an email or a sign-in row still stops the run.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.([A-Za-z]{2,63})(?![A-Za-z0-9-])/g;
/* File extensions that follow an `@2x`-style image name. None of them is a top-level domain. */
const FILE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif']);

const TOKENS = [
  /* A JSON Web Token: base64url header, payload and signature. */
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /* A Convex Auth refresh token, two document ids joined by a bar. */
  /[0-9a-z]{31,37}\|[0-9a-z]{31,37}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/* Forty or more hex digits: digests, and credentials like the 256-bit ingest tokens. */
const HEX_RUN = /(?<![0-9A-Fa-f])[0-9A-Fa-f]{40,}(?![0-9A-Fa-f])/;

/*
 * A rehosted user image's public path, as `userImagePublicPath` in src/shared/user-images/contract.ts writes it.
 * Its key is the sha-256 of the image bytes, so every rehosted avatar and cover holds 64 hex digits. The hex rule
 * skips this exact shape and nothing looser: the prefix, 64 lowercase hex digits, then `.jpg`.
 */
const USER_IMAGE_PATH = /\/user-images\/[0-9a-f]{64}\.jpg/g;

const DENIED_FIELDS = new Set([
  'email',
  'emailVerified',
  'emailVerificationTime',
  'phone',
  'phoneVerified',
  'phoneVerificationTime',
  'providerAccountId',
  'secret',
  'sessionId',
  'session_id',
  'refreshToken',
  'parentRefreshTokenId',
  'verifier',
  'token_id',
  'digest',
  'attempt_id',
]);

const SIGN_IN_TABLES = new Set([
  'homepage_tickets',
  'play_tickets',
  'play_auth_registrations',
  'user_image_ingest_tokens',
]);

function isSignInTable(table: string) {
  return /^auth[A-Z]/.test(table) || SIGN_IN_TABLES.has(table);
}

function hasEmail(text: string) {
  return [...text.matchAll(EMAIL)].some((match) => !FILE_EXTENSIONS.has(match[1]!.toLowerCase()));
}

function hasToken(text: string) {
  return TOKENS.some((pattern) => pattern.test(text)) || HEX_RUN.test(text.replaceAll(USER_IMAGE_PATH, ' '));
}

function scanValue(value: unknown, report: (kind: LeakKind) => void) {
  switch (true) {
    case typeof value === 'string':
      if (hasEmail(value)) {
        report('email');
      }
      if (hasToken(value)) {
        report('token');
      }
      break;
    case Array.isArray(value):
      value.forEach((item) => scanValue(item, report));
      break;
    case typeof value === 'object' && value !== null:
      for (const [key, nested] of Object.entries(value)) {
        if (DENIED_FIELDS.has(key)) {
          report('denied field');
        }
        scanValue(key, report);
        scanValue(nested, report);
      }
      break;
  }
}

/** The placeholder owner's row id in each of its two tables, as the manifest names them. */
function manifestPlaceholder(entries: ExportEntries): { users: unknown; profiles: unknown } {
  const manifest = parseJsonObject(entries.get(SNAPSHOT_MANIFEST) ?? '');
  const owner = manifest?.placeholderOwner as { userId?: unknown; profileId?: unknown } | undefined;
  return { users: owner?.userId ?? null, profiles: owner?.profileId ?? null };
}

/** Scans a snapshot for anything that must never leave production, and says where each hit is. */
export function scanSnapshot(entries: ExportEntries): LeakFinding[] {
  const findings = new Map<string, LeakFinding>();
  const add = (finding: LeakFinding) => findings.set(`${finding.table}\n${finding.field}\n${finding.kind}`, finding);
  const placeholder = manifestPlaceholder(entries);
  for (const [path, text] of entries) {
    const table = TABLE_ENTRY.exec(path)?.[1];
    if (path === TABLE_MAP || path === SNAPSHOT_MANIFEST) {
      const values = path === TABLE_MAP ? jsonLines(text).map(parseJsonObject) : [parseJsonObject(text)];
      scanValue(values, (kind) => add({ table: path, field: '*', kind }));
      continue;
    }
    if (!table || !path.endsWith('/documents.jsonl')) {
      add({ table: path, field: '*', kind: 'unexpected entry' });
      continue;
    }
    for (const line of jsonLines(text)) {
      const row = parseJsonObject(line) ?? { unparsed: line };
      if (isSignInTable(table)) {
        add({ table, field: '*', kind: 'sign-in table' });
      }
      if (table === 'users' && row._id !== placeholder.users) {
        add({ table, field: '*', kind: 'user row' });
      }
      if (table === 'profiles' && row._id !== placeholder.profiles) {
        add({ table, field: '*', kind: 'profile row' });
      }
      for (const [field, value] of Object.entries(row)) {
        if (DENIED_FIELDS.has(field)) {
          add({ table, field, kind: 'denied field' });
        }
        scanValue(value, (kind) => add({ table, field, kind }));
      }
    }
  }
  return [...findings.values()];
}
