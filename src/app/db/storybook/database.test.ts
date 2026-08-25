import { describe, expect, test, vi } from 'vitest';

vi.mock('../core', () => ({ db: { mutation: vi.fn(), query: vi.fn() } }));

import schema from '../../../../convex/schema';
import { db, emptyDatabase, faction, ref, ruleset } from './index';
import type { StorybookDatabase, StorybookRow } from './index';

describe('Storybook database authoring', () => {
  test('the accepted callback extends a fresh canonical baseline', () => {
    const scenario = db((baseline) => {
      baseline.factions.push(faction({ name: 'House Atreides' }));
      baseline.rulesets.push(ruleset({ name: 'ClassicRules' }));
    });

    const first = scenario.create();
    const second = scenario.create();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.filter(({ table }) => table === 'users')).toHaveLength(1);
    expect(first.filter(({ table }) => table === 'profiles')).toHaveLength(1);
    expect(first.filter(({ table }) => table === 'factions')).toHaveLength(1);
    expect(first.filter(({ table }) => table === 'rulesets')).toHaveLength(1);
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
});
