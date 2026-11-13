/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { api } from './_generated/api';
import { variantsFixture, withStartText } from './factionVariants.test.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('what a variant’s page says about its parent and siblings (#2927)', () => {
  test('a variant with a parent names it, carries its current data, and says which fields follow it', async () => {
    const { t, root, addVariant, data, save, settle } = await variantsFixture();
    const child = await addVariant('Dreamrules', root._id);
    await save(child.id, withStartText(await data(child.id), 'Start in Arrakeen.'), ['rules.revivalText']);
    await save(root._id, withStartText(await data(root._id), 'Start on Caladan.'));
    await settle();

    const page = await t.query(api.factions.pageBySlug, { slug: child.slug });

    expect(page.parent).toMatchObject({ _id: root._id, name: 'Original', slug: 'atreides-original' });
    expect(page.parent?.data.rules.startText).toBe('Start on Caladan.');
    expect(page.faction.inherited).toEqual(['rules.revivalText']);
    expect(page.faction.data.rules.startText).toBe('Start in Arrakeen.');
    expect(page.faction.problems).toEqual([]);
    expect(page.family?.slug).toBe('atreides');
  });

  test('a variant without a parent has none, and every page lists the faction’s live variants oldest first', async () => {
    const { t, owner, root, addVariant } = await variantsFixture();
    const child = await addVariant('Dreamrules', root._id);
    const alone = await addVariant('Homebrew');
    const gone = await addVariant('Retired');
    await owner.mutation(api.factions.softDelete, { id: gone.id });

    const page = await t.query(api.factions.pageBySlug, { slug: alone.slug });

    expect(page.parent).toBeNull();
    expect(page.variants).toEqual([
      { _id: root._id, slug: 'atreides-original', name: 'Original', parent_id: null },
      { _id: child.id, slug: 'atreides-dreamrules', name: 'Dreamrules', parent_id: root._id },
      { _id: alone.id, slug: 'atreides-homebrew', name: 'Homebrew', parent_id: null },
    ]);
  });

  test('a parent’s change that breaks a child shows as the child’s problems', async () => {
    const { t, root, addVariant, data, save, settle } = await variantsFixture();
    const child = await addVariant('Dreamrules', root._id);
    const rootData = await data(root._id);
    const planet = { name: 'Caladan', image: 'https://example.com/caladan.png', description: '' };
    await save(root._id, { ...rootData, planet: [planet] });
    await settle();
    const childData = await data(child.id);
    await save(child.id, { ...childData, troops: childData.troops.map((troop) => ({ ...troop, planet: 'Caladan' })) }, [
      'planet',
    ]);
    await save(root._id, { ...(await data(root._id)), planet: [] });
    await settle();

    const page = await t.query(api.factions.pageBySlug, { slug: child.slug });

    expect(page.faction.problems).toHaveLength(childData.troops.length);
    expect(page.faction.problems?.[0]).toContain('names the planet "Caladan"');
  });
});
