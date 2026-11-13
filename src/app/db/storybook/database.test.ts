import { describe, expect, test, vi } from 'vite-plus/test';

vi.mock('../core', () => ({ db: { mutation: vi.fn(), query: vi.fn() } }));

import schema from '../../../../convex/schema';
import { db, emptyDatabase, faction, familyRef, ref, ruleset } from './index';
import type { StorybookDatabase, StorybookRow } from './index';

describe('Storybook database authoring', () => {
  test('the accepted callback extends a fresh canonical baseline', () => {
    const scenario = db((baseline) => {
      baseline.factions.push(faction({ name: 'House Harkonnen' }));
      baseline.rulesets.push(ruleset({ name: 'AdvancedRules' }));
    });

    const first = scenario.create();
    const second = scenario.create();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.every((document) => document.operation === undefined)).toBe(true);
    expect(first.filter(({ table }) => table === 'users')).toHaveLength(1);
    expect(first.filter(({ table }) => table === 'profiles')).toHaveLength(1);
    expect(first.filter(({ table }) => table === 'factions')).toHaveLength(2);
    expect(first.filter(({ table }) => table === 'rulesets')).toHaveLength(2);
  });

  test('a story can replace the baseline with a valid empty database', () => {
    expect(db(() => emptyDatabase()).create()).toEqual([]);
  });

  test('the empty database follows the Convex schema table set', () => {
    const database: StorybookDatabase = emptyDatabase();
    const user: StorybookRow<'users'> = { $key: 'typed-user', name: 'Typed user' };
    database.users.push(user);

    expect(Object.keys(database).sort()).toEqual(Object.keys(schema.tables).sort());
    expect(ref('typed-user')).toEqual({ $seedRef: 'typed-user' });
  });

  test('a dangling relationship fails before the story renders', () => {
    const scenario = db((baseline) => {
      baseline.rulesets.push({
        ...ruleset({ name: 'MissingOwner' }),
        owner_id: { $seedRef: 'missing-owner' },
      });
    });

    expect(() => scenario.create()).toThrow('Storybook database reference missing-owner has no matching row.');
  });

  test('a second variant names the Faction its first variant was given, and is inserted after it', () => {
    const scenario = db((baseline) => {
      baseline.factions.unshift({
        ...faction({ name: 'House Atreides' }),
        $key: 'faction:house-atreides-dreamrules',
        slug: 'house-atreides-dreamrules',
        family_id: familyRef('faction:house-atreides'),
        parent_id: ref('faction:house-atreides'),
      });
    });

    const keys = scenario
      .create()
      .filter(({ table }) => table === 'factions')
      .map((document) => document.key);

    expect(keys).toEqual(['faction:house-atreides', 'faction:house-atreides-dreamrules']);
    expect(() =>
      db((baseline) => {
        baseline.factions[0] = { ...baseline.factions[0]!, family_id: familyRef('faction:nobody') };
      }).create()
    ).toThrow('Storybook database reference faction:nobody#family has no matching row.');
  });

  test('a forward reference is inserted after the row it names', () => {
    const scenario = db((baseline) => {
      baseline.publication_assets.push({
        asset_type: 'rulebook-first-page',
        asset_id: ref('later-edition') as unknown as string,
        cache_token: 'forward-reference',
        published_at: 1,
      });
      baseline.rulebooks.push({
        $key: 'forward-reference-rulebook',
        ruleset_id: ref('ruleset:classicrules'),
        name: 'Forward reference',
        name_key: 'forward reference',
        slug: 'forward-reference',
        sort_order: 0,
        current_edition_number: 1,
        created_by: ref('storybook-viewer'),
        created_at: '2026-01-01T12:00:00.000Z',
        updated_at: '2026-01-01T12:00:00.000Z',
        is_deleted: false,
        deleted_at: null,
      });
      baseline.rulebook_editions.push({
        $key: 'later-edition',
        rulebook_id: ref('forward-reference-rulebook'),
        edition_number: 1,
        created_by: ref('storybook-viewer'),
        created_at: '2026-01-01T12:00:00.000Z',
      });
    });
    const documents = scenario.create();

    expect(documents.findIndex(({ table }) => table === 'rulebook_editions')).toBeLessThan(
      documents.findIndex(
        ({ table, value }) =>
          table === 'publication_assets' && (value as { cache_token?: string }).cache_token === 'forward-reference'
      )
    );
  });
});

describe('explicit Storybook seed patches', () => {
  test('inserts acyclic rows first, then deterministically patches a back-reference', () => {
    const scenario = db(() => {
      const database = emptyDatabase();
      database.users.push({ $key: 'source', name: 'Source', $patch: { merged_into_user_id: ref('target') } });
      database.users.push({ $key: 'target', name: 'Target', merged_into_user_id: ref('source') });
      return database;
    });
    const documents = scenario.create();
    expect(documents).toEqual([
      { key: 'source', table: 'users', value: { name: 'Source' } },
      { key: 'target', table: 'users', value: { name: 'Target', merged_into_user_id: ref('source') } },
      { operation: 'patch', key: 'source', table: 'users', value: { merged_into_user_id: ref('target') } },
    ]);
    expect(scenario.create()).toEqual(documents);
  });

  test('a deferred patch still requires a keyed row and known references', () => {
    expect(() =>
      db((baseline) => {
        // @ts-expect-error Exercise the runtime guard for malformed untyped fixture data.
        baseline.users.push({ name: 'No key', $patch: { name: 'Changed' } });
      }).create()
    ).toThrow('A Storybook database $patch requires a row $key.');
    expect(() =>
      db((baseline) => {
        baseline.users[0]!.$patch = { merged_into_user_id: ref('missing') };
      }).create()
    ).toThrow('Storybook database reference missing has no matching row.');
  });

  test('references in insert rows still reject cycles', () => {
    expect(() =>
      db((baseline) => {
        baseline.users[0]!.merged_into_user_id = ref('storybook-viewer');
      }).create()
    ).toThrow('Storybook database references contain a cycle.');
  });

  test('patched domain data must satisfy the same rules as the inserted data', () => {
    expect(() =>
      db((baseline) => {
        baseline.rulesets[0]!.$patch = { name: '' };
      }).create()
    ).toThrow();
    expect(() =>
      db((baseline) => {
        baseline.factions[0]!.$patch = { slug: '' };
      }).create()
    ).toThrow();
    expect(() =>
      db((baseline) => {
        baseline.assets[0]!.$patch = { data: { invalid: true } };
      }).create()
    ).toThrow();
  });
});
