import type { WithoutSystemFields } from 'convex/server';

import type { Doc, TableNames } from '../../../../convex/_generated/dataModel';
import schema from '../../../../convex/schema';
import { assetPublishingFaction } from '../../../shared/factions/fixtures/assetPublishingFaction';
import { FactionInputSchema, FactionRowSlugSchema } from '../../../shared/factions/schema';
import type { FactionInput } from '../../../shared/factions/schema';
import { rulesetInputSchema } from '../../../shared/rulesets/validation';
import { slugify } from '../../../shared/slugify';
import type { SeedDocument, SeedReference, WithSeedReferences, WorkerIdentity } from './protocol';

const STORY_TIME = '2026-01-01T12:00:00.000Z';
const VIEWER_KEY = 'storybook-viewer';

export type StorybookRow<TableName extends TableNames> = WithSeedReferences<WithoutSystemFields<Doc<TableName>>> & {
  $key?: string;
};

export type StorybookDatabase = {
  [TableName in TableNames]: StorybookRow<TableName>[];
};

export type DatabaseDefinition = {
  create: () => SeedDocument[];
};

type DatabaseChange = (baseline: StorybookDatabase) => StorybookDatabase | void;

function emptyTables(): StorybookDatabase {
  const tables: Record<string, unknown> = Object.fromEntries(Object.keys(schema.tables).map((table) => [table, []]));
  return tables as StorybookDatabase;
}

export function ref(key: string): SeedReference {
  return { $seedRef: key };
}

export function emptyDatabase(): StorybookDatabase {
  return emptyTables();
}

function viewerRow(): StorybookRow<'users'> {
  return { $key: VIEWER_KEY, name: 'Storybook viewer' };
}

function viewerProfileRow(): StorybookRow<'profiles'> {
  return {
    $key: 'storybook-viewer-profile',
    user_id: ref(VIEWER_KEY),
    username: 'storybook-viewer',
    avatar_url: null,
    account_state: 'active',
    slug: 'storybook-viewer',
    created_at: STORY_TIME,
    updated_at: STORY_TIME,
  };
}

function baselineDatabase(): StorybookDatabase {
  const baseline = emptyTables();
  baseline.users.push(viewerRow());
  baseline.profiles.push(viewerProfileRow());
  return baseline;
}

export function ruleset({ about, name }: Readonly<{ about?: string; name: string }>): StorybookRow<'rulesets'> {
  const parsed = rulesetInputSchema.parse({
    name,
    about: about ?? `${name} is deterministic Storybook content for a complete page-level database scenario.`,
  });
  return {
    $key: `ruleset:${slugify(parsed.name)}`,
    name: parsed.name,
    slug: slugify(parsed.name),
    about: parsed.about,
    owner_id: ref(VIEWER_KEY),
    group_id: null,
    is_deleted: false,
    image_cover: null,
    created_at: STORY_TIME,
    updated_at: STORY_TIME,
  };
}

export function faction({
  data,
  name,
}: Readonly<{ data?: Partial<FactionInput>; name: string }>): StorybookRow<'factions'> {
  const parsed = FactionInputSchema.parse({
    ...structuredClone(assetPublishingFaction),
    ...data,
    name,
  });
  return {
    $key: `faction:${slugify(parsed.name)}`,
    owner_id: ref(VIEWER_KEY),
    data: parsed,
    slug: slugify(parsed.name),
    created_at: STORY_TIME,
    updated_at: STORY_TIME,
    is_deleted: false,
    group_id: null,
  };
}

function visitReferences(value: unknown, visit: (key: string) => void) {
  if (!value || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      visitReferences(item, visit);
    }
    return;
  }
  const object = value as Record<string, unknown>;
  if (typeof object.$seedRef === 'string') {
    visit(object.$seedRef);
    return;
  }
  for (const item of Object.values(object)) {
    visitReferences(item, visit);
  }
}

function validateDatabase(database: StorybookDatabase) {
  const keys = new Set<string>();
  for (const rows of Object.values(database)) {
    for (const row of rows as Array<{ $key?: string }>) {
      if (!row.$key) {
        continue;
      }
      if (keys.has(row.$key)) {
        throw new Error(`Storybook database key ${row.$key} is duplicated.`);
      }
      keys.add(row.$key);
    }
  }

  for (const rows of Object.values(database)) {
    for (const row of rows) {
      visitReferences(row, (key) => {
        if (!keys.has(key)) {
          throw new Error(`Storybook database reference ${key} has no matching row.`);
        }
      });
    }
  }

  for (const row of database.factions) {
    FactionInputSchema.parse(row.data);
    FactionRowSlugSchema.parse(row.slug);
  }
  for (const row of database.rulesets) {
    rulesetInputSchema.parse({ name: row.name, about: row.about });
  }
}

function toSeedDocuments(database: StorybookDatabase): SeedDocument[] {
  validateDatabase(database);
  const documents: SeedDocument[] = [];
  for (const [table, rows] of Object.entries(database) as Array<[TableNames, Array<StorybookRow<TableNames>>]>) {
    for (const row of rows) {
      const { $key: key, ...value } = row;
      documents.push({ key, table, value } as SeedDocument);
    }
  }
  return documents;
}

/*
 * Declares a fresh page-story database. The callback may mutate the canonical baseline or return
 * a replacement, including `emptyDatabase()`.
 */
export function db(change: DatabaseChange): DatabaseDefinition {
  return {
    create: () => {
      const baseline = baselineDatabase();
      return toSeedDocuments(change(baseline) ?? baseline);
    },
  };
}

export const storybookViewer = {
  name: 'Storybook viewer',
  subjectKey: VIEWER_KEY,
} satisfies WorkerIdentity;
