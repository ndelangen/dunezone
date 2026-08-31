import type { WithoutSystemFields } from 'convex/server';

import type { Doc, TableNames } from '../../../../convex/_generated/dataModel';
import schema from '../../../../convex/schema';
import { publishingDeckCardback } from '../../../shared/assets/fixtures/publishingDeckCardback';
import { publishingRectangleTokenFace } from '../../../shared/assets/fixtures/publishingRectangleTokenFace';
import { publishingTokenFace } from '../../../shared/assets/fixtures/publishingTokenFace';
import { publishingTreacheryCard } from '../../../shared/assets/fixtures/publishingTreacheryCard';
import { parseAssetDataForWrite } from '../../../shared/assets/validation';
import { assetPublishingFaction } from '../../../shared/factions/fixtures/assetPublishingFaction';
import { FactionInputSchema, FactionRowSlugSchema } from '../../../shared/factions/schema';
import type { FactionInput } from '../../../shared/factions/schema';
import { rulesetInputSchema } from '../../../shared/rulesets/validation';
import { slugify } from '../../../shared/slugify';
import type { SeedDocument, SeedReference, WithSeedReferences, WorkerIdentity } from './protocol';

const STORY_TIME = '2026-01-01T12:00:00.000Z';
const VIEWER_KEY = 'storybook-viewer';
const GROUP_KEY = 'group:arrakeen-rules-council';
const RULESET_KEY = 'ruleset:classicrules';
const FACTION_KEY = 'faction:house-atreides';

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
  return { $key: VIEWER_KEY, name: 'Storybook viewer', isAdmin: true };
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
  baseline.groups.push({
    $key: GROUP_KEY,
    name: 'Arrakeen Rules Council',
    slug: 'arrakeen-rules-council',
    created_at: STORY_TIME,
    created_by: ref(VIEWER_KEY),
    is_deleted: false,
  });
  baseline.group_members.push({
    group_id: ref(GROUP_KEY),
    user_id: ref(VIEWER_KEY),
    status: 'active',
    requested_at: STORY_TIME,
    approved_at: STORY_TIME,
    approved_by: ref(VIEWER_KEY),
  });
  baseline.rulesets.push({ ...ruleset({ name: 'ClassicRules' }), $key: RULESET_KEY, group_id: ref(GROUP_KEY) });
  baseline.factions.push({ ...faction({ name: 'House Atreides' }), $key: FACTION_KEY, group_id: ref(GROUP_KEY) });
  baseline.ruleset_factions.push({ ruleset_id: ref(RULESET_KEY), faction_id: ref(FACTION_KEY) });

  const treachery = asset({ type: 'card-treachery', data: publishingTreacheryCard });
  const deck = asset({
    type: 'deck',
    data: {
      name: 'House Treachery',
      about: 'The standard treachery deck for the page-story baseline.',
      cardback: publishingDeckCardback,
    },
  });
  const disc = asset({
    type: 'token-disc',
    data: { name: 'Karama', about: 'A representative disc token.', front: publishingTokenFace, back: { mode: 'same' } },
  });
  const enhance = asset({
    type: 'token-enhance',
    data: {
      name: 'Kwisatz Haderach',
      about: 'A representative enhance token.',
      front: publishingRectangleTokenFace,
      back: { mode: 'same' },
    },
  });
  const bundle = asset({
    type: 'bundle',
    data: {
      name: 'Atreides Tokens',
      about: 'A representative bundle of house tokens.',
      band: { background: publishingRectangleTokenFace.background, label: 'ATREIDES' },
    },
  });
  baseline.assets.push(treachery, deck, disc, enhance, bundle);
  baseline.asset_relations.push(
    { from_asset_id: ref(deck.$key!), to_asset_id: ref(treachery.$key!), kind: 'deck-card', count: 3 },
    { from_asset_id: ref(bundle.$key!), to_asset_id: ref(disc.$key!), kind: 'bundle-token', count: 1 },
    { from_asset_id: ref(bundle.$key!), to_asset_id: ref(enhance.$key!), kind: 'bundle-token', count: 1 }
  );
  baseline.ruleset_asset_slots.push(
    { ruleset_id: ref(RULESET_KEY), asset_id: ref(deck.$key!), slot: 'treachery' },
    { ruleset_id: ref(RULESET_KEY), asset_id: ref(bundle.$key!), slot: 'customTokens' }
  );

  const questionKey = 'faq:when-does-the-storm-move';
  const answerKey = 'faq-answer:storm-movement';
  baseline.faq_items.push({
    $key: questionKey,
    ruleset_id: ref(RULESET_KEY),
    slug: 'when-does-the-storm-move',
    question: 'When does the storm move?',
    tags: ['rules'],
    asked_by: ref(VIEWER_KEY),
    created_at: STORY_TIME,
    updated_at: STORY_TIME,
    accepted_answer_id: null,
  });
  baseline.faq_answers.push({
    $key: answerKey,
    faq_item_id: ref(questionKey),
    answer: 'Move the storm marker at the start of the storm phase.',
    answered_by: ref(VIEWER_KEY),
    created_at: STORY_TIME,
  });
  baseline.admin_settings.push({
    key: 'publication',
    publication_pickup_enabled: true,
    renderer_revisions: {},
    updated_at: Date.parse(STORY_TIME),
  });
  baseline.publication_jobs.push({
    asset_type: 'faction-sheet',
    asset_id: 'house-atreides',
    asset_data: assetPublishingFaction,
    status: 'pending',
    attempt_counter: 0,
    created_at: Date.parse(STORY_TIME),
    updated_at: Date.parse(STORY_TIME),
  });
  return baseline;
}

function asset({ data, type }: Readonly<{ data: unknown; type: string }>): StorybookRow<'assets'> {
  const parsed = parseAssetDataForWrite(type, data);
  return {
    $key: `asset:${type}:${slugify(parsed.name)}`,
    owner_id: ref(VIEWER_KEY),
    type,
    data: parsed.data,
    slug: slugify(parsed.name),
    created_at: STORY_TIME,
    updated_at: STORY_TIME,
    is_deleted: false,
    group_id: ref(GROUP_KEY),
  };
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

function collectKeys(database: StorybookDatabase) {
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
  return keys;
}

function validateReferences(database: StorybookDatabase, keys: Set<string>) {
  for (const rows of Object.values(database)) {
    for (const row of rows) {
      visitReferences(row, (key) => {
        if (!keys.has(key)) {
          throw new Error(`Storybook database reference ${key} has no matching row.`);
        }
      });
    }
  }
}

function validateDomainRows(database: StorybookDatabase) {
  for (const row of database.factions) {
    FactionInputSchema.parse(row.data);
    FactionRowSlugSchema.parse(row.slug);
  }
  for (const row of database.rulesets) {
    rulesetInputSchema.parse({ name: row.name, about: row.about });
  }
  for (const row of database.assets) {
    parseAssetDataForWrite(row.type, row.data);
  }
}

function validateDatabase(database: StorybookDatabase) {
  const keys = collectKeys(database);
  validateReferences(database, keys);
  validateDomainRows(database);
}

function orderSeedDocuments(documents: SeedDocument[]) {
  const pending = [...documents];
  const ordered: SeedDocument[] = [];
  const resolved = new Set<string>();
  while (pending.length > 0) {
    const readyIndex = pending.findIndex((document) => {
      let ready = true;
      visitReferences(document.value, (key) => {
        ready &&= resolved.has(key);
      });
      return ready;
    });
    if (readyIndex < 0) {
      throw new Error('Storybook database references contain a cycle.');
    }
    const [document] = pending.splice(readyIndex, 1);
    ordered.push(document);
    if (document.key) {
      resolved.add(document.key);
    }
  }
  return ordered;
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
  return orderSeedDocuments(documents);
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
