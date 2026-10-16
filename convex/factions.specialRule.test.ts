/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { FACTION_SHEET_ASSET_TYPE } from '../src/shared/asset-publishing/publication';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { FactionRender } from '../src/shared/factions/schema';
import { factionSpecialRuleLabel } from '../src/shared/factions/specialRule';
import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

test('the special rule name round-trips as an optional override and reaches sheet publication', async () => {
  const { t, owner, ids } = await rulebookFixture();
  await t.run((ctx) =>
    ctx.db.insert('profiles', {
      user_id: ids.ownerId,
      username: 'Special rule author',
      avatar_url: null,
      account_state: 'active',
      slug: 'special-rule-author',
      created_at: '2026-10-16T12:00:00.000Z',
      updated_at: '2026-10-16T12:00:00.000Z',
    })
  );
  const created = await owner.mutation(api.factions.create, {
    data: structuredClone(assetPublishingFaction),
    group_id: null,
  });
  const authoredRule = structuredClone(created.data.rules.fate);
  expect(authoredRule).not.toHaveProperty('label');

  for (const label of ['fate', 'karama', undefined] as const) {
    const data = structuredClone(created.data);
    data.rules.fate.label = label;
    const updated = await owner.mutation(api.factions.update, { id: created._id, data });
    const page = await t.query(api.factions.pageBySlug, { slug: updated.slug });
    const stored = await t.run((ctx) => ctx.db.get('factions', created._id));
    const job = await t.run((ctx) =>
      ctx.db
        .query('publication_jobs')
        .withIndex('by_asset_type_and_asset_id', (q) =>
          q.eq('asset_type', FACTION_SHEET_ASSET_TYPE).eq('asset_id', created._id)
        )
        .unique()
    );
    if (!job) {
      throw new Error('Missing faction sheet publication');
    }

    const sheet = FactionRender.sheet.parse(job.asset_data.faction);
    for (const faction of [page.faction.data, stored?.data, sheet]) {
      expect(faction?.rules.fate).toEqual({ ...authoredRule, ...(label ? { label } : {}) });
      expect(factionSpecialRuleLabel(faction?.rules.fate.label)).toBe(
        label === 'fate' ? 'Fate' : 'Faction Special Karama'
      );
    }
    expect(updated.data.rules.fate.text).toBe(authoredRule.text);
    expect(updated.data.rules.fate.title).toBe(authoredRule.title);
  }
});
