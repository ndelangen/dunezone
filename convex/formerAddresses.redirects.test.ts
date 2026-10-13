/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import type { FunctionArgs } from 'convex/server';
import { describe, expect, test } from 'vitest';

import { publishingTreacheryCard } from '../src/shared/assets/fixtures/publishingTreacheryCard';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import { api } from './_generated/api';
import { rulesetOwner, VALID_ABOUT } from './rulesets.test.fixture';

async function world() {
  const { t, owner } = await rulesetOwner();
  await owner.mutation(api.profiles.bootstrapCurrent, {});
  const resolve = (address: FunctionArgs<typeof api.formerAddresses.resolve>['address']) =>
    t.query(api.formerAddresses.resolve, { address });
  return { t, owner, resolve };
}

async function createRuleset(owner: Awaited<ReturnType<typeof world>>['owner'], name: string) {
  return await owner.mutation(api.rulesets.create, { name, about: VALID_ABOUT, group_id: null, image_cover: null });
}

describe('former addresses', () => {
  test('a renamed faction leads from every earlier address to its current one, until it is deleted', async () => {
    const { t, owner } = await world();
    const resolve = (slug: string) => t.query(api.formerAddresses.resolve, { address: { kind: 'faction', slug } });
    const faction = await owner.mutation(api.factions.create, {
      data: { ...assetPublishingFaction, name: 'Atreides' },
      group_id: null,
    });
    await owner.mutation(api.factions.update, { id: faction._id, data: { ...assetPublishingFaction, name: 'Bene' } });
    await owner.mutation(api.factions.update, {
      id: faction._id,
      data: { ...assetPublishingFaction, name: 'Corrino' },
    });

    await expect(resolve('atreides')).resolves.toBe('/factions/corrino');
    await expect(resolve('bene')).resolves.toBe('/factions/corrino');
    /* The current address is its own page, and an address nothing left is no redirect. */
    await expect(resolve('corrino')).resolves.toBeNull();
    await expect(resolve('fremen')).resolves.toBeNull();

    await owner.mutation(api.factions.softDelete, { id: faction._id });
    await expect(resolve('atreides')).resolves.toBeNull();
  });

  test('a record that takes a freed address wins over the record that left it', async () => {
    const { t, owner } = await world();
    const resolve = (slug: string) => t.query(api.formerAddresses.resolve, { address: { kind: 'group', slug } });
    const first = await owner.mutation(api.groups.create, { name: 'Sietch' });
    await owner.mutation(api.groups.update, { id: first._id, name: 'Tabr' });
    await expect(resolve('sietch')).resolves.toBe('/groups/tabr');
    const records = await t.run((ctx) => ctx.db.query('former_slugs').collect());
    expect(records).toMatchObject([{ kind: 'group', scope: '', slug: 'sietch', record_id: first._id }]);

    const second = await owner.mutation(api.groups.create, { name: 'Sietch' });
    expect(second.slug).toBe('sietch');
    await expect(resolve('sietch')).resolves.toBeNull();
    /* Deleted holders keep their addresses, so the newer, deleted holder still decides. */
    await owner.mutation(api.groups.softDelete, { id: second._id });
    await expect(resolve('sietch')).resolves.toBeNull();
  });

  test('a renamed or converted asset leads from its old type and slug to its current address', async () => {
    const { t, owner } = await world();
    const adminId = await t.run((ctx) => ctx.db.insert('users', { name: 'Administrator', isAdmin: true }));
    const admin = t.withIdentity({ subject: adminId });
    const resolve = (type: string, slug: string) =>
      t.query(api.formerAddresses.resolve, { address: { kind: 'asset', type, slug } });
    const card = await owner.mutation(api.assets.create, {
      type: 'card-treachery',
      data: { ...publishingTreacheryCard, name: 'Crysknife' },
    });
    await owner.mutation(api.assets.update, {
      id: card.id,
      data: { ...publishingTreacheryCard, name: 'Maula Pistol' },
    });
    await expect(resolve('card-treachery', 'crysknife')).resolves.toBe('/assets/card-treachery/maula-pistol');

    const converted = await admin.mutation(api.assets.convertTreacheryToCustom, { id: card.id });
    await expect(resolve('card-treachery', 'maula-pistol')).resolves.toBe(`/assets/card-custom/${converted.slug}`);
    await expect(resolve('card-treachery', 'crysknife')).resolves.toBe(`/assets/card-custom/${converted.slug}`);
    /* Slugs are unique per type, so the same slug under another type is a different address. */
    await expect(resolve('card-storm', 'crysknife')).resolves.toBeNull();
  });

  test('a renamed ruleset keeps its own, its Rulebook and its FAQ addresses, and a Rulebook rename stays in its ruleset', async () => {
    const { owner, resolve } = await world();
    const ruleset = await createRuleset(owner, 'Classic Rules');
    const other = await createRuleset(owner, 'Other Rules');
    const created = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ruleset._id,
      name: 'Player Guide',
      source: { kind: 'starter' },
    });
    const question = await owner.mutation(api.faq.createQuestion, {
      rulesetId: ruleset._id,
      question: 'Does a renamed ruleset keep its questions?',
      tags: ['rules'],
    });
    await owner.mutation(api.rulesets.update, { id: ruleset._id, name: 'Modern Rules', about: VALID_ABOUT });
    await owner.mutation(api.rulebooks.rename, { rulebook_id: created.rulebook._id, name: 'Reference Guide' });

    await expect(resolve({ kind: 'ruleset', slug: 'classic-rules' })).resolves.toBe('/rulesets/modern-rules');
    await expect(
      resolve({ kind: 'rulebook', ruleset_slug: 'classic-rules', rulebook_slug: 'player-guide' })
    ).resolves.toBe('/rulesets/modern-rules/rulebooks/reference-guide');
    await expect(
      resolve({ kind: 'rulebook', ruleset_slug: 'modern-rules', rulebook_slug: 'player-guide' })
    ).resolves.toBe('/rulesets/modern-rules/rulebooks/reference-guide');
    await expect(
      resolve({ kind: 'rulebook', ruleset_slug: 'classic-rules', rulebook_slug: 'reference-guide' })
    ).resolves.toBe('/rulesets/modern-rules/rulebooks/reference-guide');
    await expect(
      resolve({ kind: 'faq', ruleset_slug: 'classic-rules', question_slug: question.questionSlug })
    ).resolves.toBe(`/rulesets/modern-rules/faq/${question.questionSlug}`);

    /* A Rulebook's former address is scoped to its own ruleset, and a missing child is no redirect. */
    await expect(
      resolve({ kind: 'rulebook', ruleset_slug: 'other-rules', rulebook_slug: 'player-guide' })
    ).resolves.toBeNull();
    await expect(
      resolve({ kind: 'rulebook', ruleset_slug: 'classic-rules', rulebook_slug: 'appendix' })
    ).resolves.toBeNull();
    await expect(resolve({ kind: 'faq', ruleset_slug: 'classic-rules', question_slug: '999' })).resolves.toBeNull();
    expect(other.slug).toBe('other-rules');
  });
});
