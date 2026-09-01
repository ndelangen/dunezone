import { describe, expect, test, vi } from 'vitest';

vi.mock('../core', () => ({ db: { mutation: vi.fn(), query: vi.fn() } }));

import schema from '../../../../convex/schema';
import { db, emptyDatabase, faction, ref, ruleset } from './index';
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
        contents: {
          schemaVersion: 1,
          pageOrder: [],
          pagesById: {},
        },
        created_by: ref('storybook-viewer'),
        created_at: '2026-01-01T12:00:00.000Z',
      });
    });
    const documents = scenario.create();

    expect(documents.findIndex(({ table }) => table === 'rulebook_editions')).toBeLessThan(
      documents.findIndex(({ table }) => table === 'publication_assets')
    );
  });
});
