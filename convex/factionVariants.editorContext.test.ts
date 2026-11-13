/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { api } from './_generated/api';
import { variantsFixture, withStartText } from './factionVariants.test.fixture';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('what a variant’s editors are told about its parent and siblings (#2927)', () => {
  test('a variant with a parent names it and carries its current data', async () => {
    const { owner, root, addVariant, data, save, settle } = await variantsFixture();
    const child = await addVariant('Dreamrules', root._id);
    await save(child.id, withStartText(await data(child.id), 'Start in Arrakeen.'), ['rules.revivalText']);
    await save(root._id, withStartText(await data(root._id), 'Start on Caladan.'));
    await settle();

    const context = await owner.query(api.factionVariants.editorContext, { faction_id: child.id });

    expect(context?.parent?.name).toBe('Original');
    expect(context?.parent?.data.rules.startText).toBe('Start on Caladan.');
    expect(context?.familySlug).toBe('atreides');
  });

  test('a variant without a parent has none, and the faction’s live variants are listed oldest first', async () => {
    const { owner, root, addVariant } = await variantsFixture();
    const child = await addVariant('Dreamrules', root._id);
    const alone = await addVariant('Homebrew');
    const gone = await addVariant('Retired');
    await owner.mutation(api.factions.softDelete, { id: gone.id });

    const context = await owner.query(api.factionVariants.editorContext, { faction_id: alone.id });

    expect(context?.parent).toBeNull();
    expect(context?.variants).toEqual([
      { _id: root._id, name: 'Original' },
      { _id: child.id, name: 'Dreamrules' },
      { _id: alone.id, name: 'Homebrew' },
    ]);
  });

  test('a child keeps its soft-deleted parent’s data, which only its editors are told', async () => {
    const { t, owner, stranger, root, addVariant } = await variantsFixture();
    const parent = await addVariant('Dreamrules', root._id);
    const child = await addVariant('Tournament', parent.id);
    await owner.mutation(api.factions.softDelete, { id: parent.id });

    const context = await owner.query(api.factionVariants.editorContext, { faction_id: child.id });

    expect(context?.parent?.name).toBe('Dreamrules');
    expect(context?.variants.map((variant) => variant.name)).toEqual(['Original', 'Tournament']);
    await expect(stranger.query(api.factionVariants.editorContext, { faction_id: child.id })).resolves.toBeNull();
    await expect(t.query(api.factionVariants.editorContext, { faction_id: child.id })).resolves.toBeNull();
  });
});
