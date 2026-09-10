// @vitest-environment edge-runtime

import { describe, expect, test, vi } from 'vitest';

import { factionMemberPublicationId } from '../src/shared/asset-publishing/componentPublication';
import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { createFactionMemberId, ensureFactionMemberIds } from '../src/shared/factions/memberIdentity';
import { RULEBOOK_CATALOGUE_VERSION, rulebookContentsV1Schema } from '../src/shared/rulebooks/contents';
import { projectRulebookRenderDocument, projectRulebookSource } from '../src/shared/rulebooks/projectRenderDocument';
import { api, internal } from './_generated/api';
import { resolveRulebookReferences } from './lib/rulebookReferences';
import { rulebookFixture } from './rulebooks.test.fixture';

async function liveReferenceFixture() {
  const fixture = await rulebookFixture();
  const data = ensureFactionMemberIds(structuredClone(assetPublishingFaction));
  const created = await fixture.owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: fixture.ids.rulesetId,
    name: 'Live components',
    source: { kind: 'starter' },
  });
  const refs = await fixture.t.run(async (ctx) => {
    const factionId = await ctx.db.insert('factions', {
      owner_id: fixture.ids.ownerId,
      group_id: null,
      slug: 'live-components',
      is_deleted: false,
      data,
      created_at: '2026-09-09',
      updated_at: '2026-09-09',
    });
    const assetId = await ctx.db.insert('assets', {
      owner_id: fixture.ids.ownerId,
      group_id: null,
      slug: 'live-artwork',
      is_deleted: false,
      type: 'token-disc',
      data: { name: 'Current artwork' },
      created_at: '2026-09-09',
      updated_at: '2026-09-09',
    });
    await ctx.db.insert('publication_assets', {
      asset_type: 'token-disc',
      asset_id: assetId,
      cache_token: 'one',
      published_at: 1,
    });
    for (const member of [data.hero, ...data.leaders]) {
      await ctx.db.insert('publication_assets', {
        asset_type: 'faction-leader',
        asset_id: factionMemberPublicationId(factionId, member.memberId),
        cache_token: 'one',
        published_at: 1,
      });
    }
    return { factionId, assetId };
  });
  const memberSource = {
    kind: 'faction-member',
    factionId: refs.factionId,
    memberId: data.leaders[0]!.memberId,
  } as const;
  const contents = rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['RULE'],
    pagesById: {
      RULE: {
        id: 'RULE',
        anchor: 'components',
        title: 'Components',
        layoutId: 'single-column',
        showHeading: true,
        controlValues: {},
        blockOrderByRegion: { content: ['ARTW', 'NVTR', 'FACT'] },
        blocksById: {
          ARTW: {
            id: 'ARTW',
            kind: 'referenced-illustration',
            source: memberSource,
            caption: 'Authored Leader caption.',
          },
          NVTR: {
            id: 'NVTR',
            kind: 'illustrated-inventory',
            title: 'Equipment',
            introduction: 'Choose *one*.',
            itemOrder: ['asset', 'leader'],
            itemsById: {
              asset: {
                id: 'asset',
                source: { kind: 'asset', assetId: refs.assetId },
                text: 'Keep this explanation.',
                quantity: 0,
                caption: 'Authored artwork caption.',
              },
              leader: { id: 'leader', source: memberSource, text: 'Keep this Leader explanation.' },
            },
          },
          FACT: {
            id: 'FACT',
            kind: 'faction-introduction',
            factionId: refs.factionId,
            text: 'Keep this introduction.',
          },
        },
      },
    },
  });
  return {
    ...fixture,
    data,
    created,
    refs,
    memberSource,
    contents,
    locator: { ruleset_slug: 'rulebook-test-rules', rulebook_slug: created.rulebook.slug },
  };
}

describe('Rulebook component references', () => {
  test('shares current faction names and roster with the member picker and never retargets a removed member by name', async () => {
    const { t, refs, data, contents, memberSource } = await liveReferenceFixture();
    const original = await t.run((ctx) => resolveRulebookReferences(ctx, contents));
    expect(projectRulebookSource(memberSource, original.assetsById, original.factionsById)).toMatchObject({
      status: 'ready',
      name: data.leaders[0]!.name,
      imageUrl: publishedHref(
        'faction-leader',
        factionMemberPublicationId(refs.factionId, memberSource.memberId),
        'one'
      ),
    });
    const revised = structuredClone(data);
    revised.name = 'Updated house';
    revised.leaders[0]!.name = 'Renamed Leader';
    revised.leaders.reverse();
    await t.run((ctx) => ctx.db.patch('factions', refs.factionId, { data: revised }));
    const current = await t.run((ctx) => resolveRulebookReferences(ctx, contents));
    expect(current.factionsById[refs.factionId]?.name).toBe('Updated house');
    expect(
      current.factionsById[refs.factionId]?.leaders?.map((member) =>
        member.status === 'ready' ? member.reference : null
      )
    ).toEqual(
      revised.leaders.map((member) => ({
        kind: 'faction-member',
        factionId: refs.factionId,
        memberId: member.memberId,
      }))
    );
    expect(projectRulebookSource(memberSource, current.assetsById, current.factionsById)).toMatchObject({
      status: 'ready',
      name: 'Renamed Leader',
    });
    expect(await t.query(api.rulebookSources.factionMembers, { faction_id: refs.factionId })).toMatchObject({
      name: 'Updated house',
      members: [
        { memberId: revised.hero.memberId, role: 'Ruler' },
        ...revised.leaders.map((member) => ({ memberId: member.memberId, name: member.name, role: 'Leader' })),
      ],
    });
    const replacement = {
      ...revised.leaders.find((member) => member.memberId === memberSource.memberId)!,
      memberId: createFactionMemberId(),
    };
    revised.leaders = [...revised.leaders.filter((member) => member.memberId !== memberSource.memberId), replacement];
    await t.run((ctx) => ctx.db.patch('factions', refs.factionId, { data: revised }));
    const removed = await t.run((ctx) => resolveRulebookReferences(ctx, contents));
    expect(projectRulebookSource(memberSource, removed.assetsById, removed.factionsById)).toEqual({
      status: 'unavailable',
      reference: memberSource,
    });
    const picker = await t.query(api.rulebookSources.factionMembers, { faction_id: refs.factionId });
    expect(picker?.members.map((member) => member.memberId)).not.toContain(memberSource.memberId);
    expect(picker?.members.at(-1)).toMatchObject({
      memberId: replacement.memberId,
      name: 'Renamed Leader',
      imageUrl: null,
    });
    await t.run((ctx) => ctx.db.patch('factions', refs.factionId, { is_deleted: true }));
    expect(await t.query(api.rulebookSources.factionMembers, { faction_id: refs.factionId })).toBeNull();
    expect((await t.run((ctx) => resolveRulebookReferences(ctx, contents))).factionsById).toEqual({});
  });

  test('a completed Leader replacement changes current reader and picker image URLs without changing the reference', async () => {
    const { t, owner, refs, data, contents, memberSource, created, locator } = await liveReferenceFixture();
    await owner.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 1,
      contents,
    });
    await owner.mutation(api.rulebooks.publish, {
      rulebook_id: created.rulebook._id,
      expected_revision: 2,
      confirmed: true,
    });
    const imageFrom = (reader: Awaited<ReturnType<typeof t.query<typeof api.rulebooks.readerPage>>>) => {
      if (!reader) {
        throw new Error('Expected a Reader');
      }
      const source = projectRulebookSource(memberSource, reader.assetsById, reader.factionsById);
      if (source.status !== 'ready') {
        throw new Error('Expected a ready Leader');
      }
      return source;
    };
    const before = imageFrom(await t.query(api.rulebooks.readerPage, locator));
    const revised = structuredClone(data);
    revised.leaders[0]!.strength = 9;
    await owner.mutation(api.factions.update, { id: refs.factionId, data: revised });
    expect(imageFrom(await t.query(api.rulebooks.readerPage, locator)).imageUrl).toBe(before.imageUrl);
    await t.run(async (ctx) => {
      await ctx.db.insert('admin_settings', {
        key: 'publication',
        publication_pickup_enabled: true,
        renderer_revisions: { 'faction-leader': 1 },
        updated_at: Date.now(),
      });
    });
    const publicationId = factionMemberPublicationId(refs.factionId, memberSource.memberId);
    const assignment = await t.mutation(internal.publicationJobs.takeWork, {});
    const job = assignment.items.find((item) => item.assetId === publicationId);
    if (!job) {
      throw new Error('Expected a Leader capture');
    }
    const snapshot = await t.query(internal.publicationJobs.readJobForRender, { jobId: job.jobId });
    if (!snapshot) {
      throw new Error('Expected a Leader snapshot');
    }
    const cacheToken = '10000000-1000-4000-8000-100000000002';
    expect(
      await t.mutation(internal.publicationJobs.completeJob, {
        jobId: job.jobId,
        payloadHash: snapshot.payloadHash,
        cacheToken,
      })
    ).toMatchObject({ status: 'completed' });
    const reader = await t.query(api.rulebooks.readerPage, locator);
    const after = imageFrom(reader);
    expect(after.reference).toEqual(before.reference);
    expect(after.name).toBe(before.name);
    expect(after.imageUrl).not.toBe(before.imageUrl);
    expect(new URL(after.imageUrl, 'https://dune.zone').pathname).toBe(
      new URL(before.imageUrl, 'https://dune.zone').pathname
    );
    expect(after.imageUrl).toBe(publishedHref('faction-leader', publicationId, cacheToken));
    expect(reader?.edition.contents).toEqual(contents);
    const picker = await t.query(api.rulebookSources.factionMembers, { faction_id: refs.factionId });
    expect(picker?.members.find((member) => member.memberId === memberSource.memberId)?.imageUrl).toBe(after.imageUrl);
  });

  test('loads each source once when unsaved selections repeat references already in Contents', async () => {
    const { t, refs, contents } = await liveReferenceFixture();
    const result = await t.run(async (ctx) => {
      const get = vi.spyOn(ctx.db, 'get');
      try {
        const resolved = await resolveRulebookReferences(ctx, contents, {
          assetIds: [refs.assetId, refs.assetId],
          factionIds: [refs.factionId, refs.factionId],
        });
        return { resolved, reads: get.mock.calls.map((args) => [...args]) };
      } finally {
        get.mockRestore();
      }
    });
    expect(result.reads).toHaveLength(2);
    expect(Object.keys(result.resolved.assetsById)).toEqual([refs.assetId]);
    expect(Object.keys(result.resolved.factionsById)).toEqual([refs.factionId]);
  });

  test('saves, publishes and clones the three Blocks with live source identities and fresh cloned item identities', async () => {
    const { t, owner, refs, memberSource, contents, locator, created, ids } = await liveReferenceFixture();
    for (const work of await t.mutation(internal.rulebookHtmlPublication.takeHtmlWork, {})) {
      await t.mutation(internal.rulebookHtmlPublication.completeHtmlWork, { artifactId: work.artifactId });
    }
    for (const work of await t.mutation(internal.rulebookPdfPublication.takePdfWork, {})) {
      await t.mutation(internal.rulebookPdfPublication.completePdfWork, { artifactId: work.artifactId });
    }
    await owner.mutation(api.rulebooks.save, { rulebook_id: created.rulebook._id, expected_revision: 1, contents });
    expect(
      await owner.mutation(api.rulebooks.publish, {
        rulebook_id: created.rulebook._id,
        expected_revision: 2,
        confirmed: true,
      })
    ).toMatchObject({ kind: 'published' });
    const reader = await t.query(api.rulebooks.readerPage, locator);
    expect(reader?.edition.contents).toEqual(contents);
    const [html, pdf] = await Promise.all([
      t.mutation(internal.rulebookHtmlPublication.takeHtmlWork, {}),
      t.mutation(internal.rulebookPdfPublication.takePdfWork, {}),
    ]);
    const expected = [
      {
        kind: 'referenced-illustration',
        source: { status: 'ready', reference: memberSource },
        caption: 'Authored Leader caption.',
      },
      {
        kind: 'illustrated-inventory',
        introduction: 'Choose *one*.',
        items: [
          { source: { status: 'ready', reference: { kind: 'asset', assetId: refs.assetId } }, quantity: 0 },
          { source: { status: 'ready', reference: memberSource } },
        ],
      },
      {
        kind: 'faction-introduction',
        faction: { status: 'ready', factionId: refs.factionId },
        text: 'Keep this introduction.',
      },
    ];
    for (const work of [
      html.find((entry) => entry.editionNumber === 2),
      pdf.find((entry) => entry.editionNumber === 2),
    ]) {
      expect(work?.document.pagesById.RULE!.regions[0]!.blocks).toMatchObject(expected);
    }
    const clone = await owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: ids.rulesetId,
      name: 'Cloned components',
      source: { kind: 'clone', rulebook_id: created.rulebook._id },
    });
    const clonedContents = rulebookContentsV1Schema.parse(clone.draft.contents);
    const page = clonedContents.pagesById[clonedContents.pageOrder[0]!]!;
    const clonedInventory = Object.values(page.blocksById).find((block) => block.kind === 'illustrated-inventory');
    if (!clonedInventory || clonedInventory.kind !== 'illustrated-inventory') {
      throw new Error('Expected a cloned inventory');
    }
    expect(clonedInventory.itemOrder).toHaveLength(2);
    expect(clonedInventory.itemOrder.some((id) => id === 'asset' || id === 'leader')).toBe(false);
    expect(clonedInventory.itemsById[clonedInventory.itemOrder[1]!]!.source).toEqual(memberSource);
    await t.run(async (ctx) => {
      await ctx.db.patch('factions', refs.factionId, { is_deleted: true });
      await ctx.db.patch('assets', refs.assetId, { is_deleted: true });
    });
    const missing = await t.query(api.rulebooks.readerPage, locator);
    if (!missing) {
      throw new Error('Expected published Rulebook');
    }
    expect(missing.edition.contents).toEqual(contents);
    expect(
      projectRulebookRenderDocument(
        missing.edition.contents,
        missing.assetsById,
        missing.edition.settings,
        missing.factionsById
      ).pagesById.RULE!.regions[0]!.blocks
    ).toMatchObject([
      { source: { status: 'unavailable', reference: memberSource }, caption: 'Authored Leader caption.' },
      {
        introduction: 'Choose *one*.',
        items: [{ text: 'Keep this explanation.' }, { text: 'Keep this Leader explanation.' }],
      },
      { faction: { status: 'unavailable', factionId: refs.factionId }, text: 'Keep this introduction.' },
    ]);
  });
});
