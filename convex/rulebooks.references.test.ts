// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { RULEBOOK_CATALOGUE_VERSION } from '../src/shared/rulebooks/contents';
import type { RulebookContentsDraftV1 } from '../src/shared/rulebooks/contents';
import { projectRulebookRenderDocument } from '../src/shared/rulebooks/projectRenderDocument';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

async function referenceFixture() {
  const fixture = await rulebookFixture();
  const { t, owner, ids } = fixture;
  const created = await owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: ids.rulesetId,
    name: 'Referenced manual',
    source: { kind: 'starter' },
  });
  const references = await t.run(async (ctx) => {
    const factionId = await ctx.db.insert('factions', {
      owner_id: ids.ownerId,
      group_id: null,
      slug: 'referenced-faction',
      is_deleted: false,
      data: assetPublishingFaction,
      created_at: '2026-09-09',
      updated_at: '2026-09-09',
    });
    const assetId = await ctx.db.insert('assets', {
      owner_id: ids.ownerId,
      group_id: null,
      slug: 'cover-artwork',
      is_deleted: false,
      type: 'token-disc',
      data: { name: 'Cover artwork' },
      created_at: '2026-09-09',
      updated_at: '2026-09-09',
    });
    const publicationId = await ctx.db.insert('publication_assets', {
      asset_type: 'token-disc',
      asset_id: assetId,
      cache_token: 'initial',
      published_at: 1,
    });
    return { factionId, assetId, publicationId };
  });
  const locator = { ruleset_slug: 'rulebook-test-rules', rulebook_slug: created.rulebook.slug };
  const contents: RulebookContentsDraftV1 = structuredClone(created.draft.contents);
  const page = contents.pagesById.RULE;
  if (page.layoutId !== 'single-column') {
    throw new Error('Expected the current starter grid');
  }
  page.blocksById.HEAD = {
    id: 'HEAD',
    kind: 'section-heading',
    title: 'Movement advantages',
    factionId: references.factionId,
  };
  page.blockOrderByRegion.content.unshift('HEAD');
  contents.pagesById.CVVR = {
    id: 'CVVR',
    anchor: 'cover',
    title: 'The field manual',
    showHeading: true,
    layoutId: 'cover',
    controlValues: { cover: { artworkAssetId: references.assetId, subtitle: 'Table reference', supportingText: '' } },
    blockOrderByRegion: {},
    blocksById: {},
  };
  contents.pageOrder.unshift('CVVR');
  return { ...fixture, created, references, locator, contents };
}

async function publishReferences(fixture: Awaited<ReturnType<typeof referenceFixture>>) {
  const { owner, created, contents } = fixture;
  await owner.mutation(api.rulebooks.save, { rulebook_id: created.rulebook._id, expected_revision: 1, contents });
  const published = await owner.mutation(api.rulebooks.publish, {
    rulebook_id: created.rulebook._id,
    expected_revision: 2,
    confirmed: true,
  });
  expect(published).toMatchObject({ kind: 'published' });
}

describe('Rulebook live faction and Cover references', () => {
  test('a battle step resolves its faction troop identities and artwork through the saved draft', async () => {
    const { owner, contents, references, created, locator } = await referenceFixture();
    const troop = assetPublishingFaction.troops[0]!;
    const side = {
      factionId: references.factionId,
      role: 'Aggressor',
      revealed: true,
      dial: 1.5,
      spice: 1,
      cards: [],
      troops: [
        {
          id: 'ordinary',
          troopId: troop.troopId,
          face: 'front' as const,
          supported: 1,
          unsupported: 1,
          uncommitted: 2,
        },
      ],
    };
    contents.pagesById.BTTL = {
      id: 'BTTL',
      anchor: 'battle',
      title: 'Battle',
      layoutId: 'sequence',
      showHeading: true,
      controlValues: {},
      blockOrderByRegion: { content: ['STEP'] },
      blocksById: {
        STEP: {
          id: 'STEP',
          kind: 'battle-step',
          step: '1',
          title: 'Build a plan',
          caption: '',
          left: side,
          right: { ...side, role: 'Defender' },
        },
      },
    };
    contents.pageOrder.push('BTTL');
    await owner.mutation(api.rulebooks.save, { rulebook_id: created.rulebook._id, expected_revision: 1, contents });
    const page = await owner.query(api.rulebooks.editorPage, locator);
    expect(page).toMatchObject({
      draft: {
        contents: { pagesById: { BTTL: { layoutId: 'sequence', blocksById: { STEP: { kind: 'battle-step' } } } } },
      },
      factionsById: {
        [references.factionId]: { troops: [{ troopId: troop.troopId, image: troop.image, name: troop.name }] },
      },
    });
  });

  test('saves board scenes, piece movements and paired battle examples as ordinary draft blocks', async () => {
    const { owner, contents, references, created, locator } = await referenceFixture();
    const scene = {
      boardId: 'arrakis',
      caption: 'Battle order',
      players: [{ id: 'player', factionId: references.factionId, angle: 90 }],
      troops: [],
      highlights: [],
      annotations: [],
    };
    const side = {
      factionId: references.factionId,
      role: 'Aggressor',
      revealed: false,
      dial: 0,
      spice: 0,
      cards: [],
      troops: [],
    };
    const example = { step: '', title: 'Tie', caption: 'Compare these plans.', left: side, right: side };
    contents.pagesById.SCEN = {
      id: 'SCEN',
      anchor: 'illustrated-scenes',
      title: 'Illustrated scenes',
      layoutId: 'sequence',
      showHeading: true,
      controlValues: {},
      blockOrderByRegion: { content: ['BRDD', 'MVMT', 'CMPR'] },
      blocksById: {
        BRDD: { id: 'BRDD', kind: 'board-scene', ...scene },
        MVMT: {
          id: 'MVMT',
          kind: 'piece-movement',
          step: '11',
          title: 'Move pieces',
          caption: '',
          left: {
            label: 'Before',
            pieces: [{ id: 'piece', kind: 'source', source: { kind: 'asset', assetId: references.assetId }, count: 1 }],
          },
          right: { label: 'After', pieces: [] },
          board: scene,
        },
        CMPR: { id: 'CMPR', kind: 'battle-comparison', examples: [example, example] },
      },
    };
    contents.pageOrder.push('SCEN');
    await owner.mutation(api.rulebooks.save, { rulebook_id: created.rulebook._id, expected_revision: 1, contents });
    const saved = await owner.query(api.rulebooks.editorPage, locator);
    expect(saved).toMatchObject({
      draft: {
        contents: {
          pagesById: {
            SCEN: {
              blocksById: {
                BRDD: { kind: 'board-scene', boardId: 'arrakis' },
                MVMT: { kind: 'piece-movement', board: { boardId: 'arrakis' } },
                CMPR: { kind: 'battle-comparison', examples: [example, example] },
              },
            },
          },
        },
      },
      assetsById: { [references.assetId]: { assetId: references.assetId } },
      factionsById: { [references.factionId]: { factionId: references.factionId } },
    });
  });

  test('Cover footer factions resolve live across reader and publication while disabled selections stay dormant', async () => {
    const fixture = await referenceFixture();
    const { t, owner, contents, references, locator, created } = fixture;
    const page = contents.pagesById.RULE;
    const cover = contents.pagesById.CVVR;
    if (page.layoutId !== 'single-column' || cover.layoutId !== 'cover') {
      throw new Error('Expected the Cover and interior fixture');
    }
    delete page.blocksById.HEAD;
    page.blockOrderByRegion.content.shift();
    const rightFactionId = await t.run(async (ctx) => {
      const faction = await ctx.db.get('factions', references.factionId);
      if (!faction) {
        throw new Error('Expected the fixture faction');
      }
      const { _id, _creationTime, ...fields } = faction;
      return await ctx.db.insert('factions', {
        ...fields,
        slug: 'right-footer-faction',
        data: { ...assetPublishingFaction, name: 'Right faction', logo: '/vector/logo/fremen.svg' },
      });
    });
    cover.controlValues.cover.footer = {
      enabled: true,
      title: 'Two Houses',
      label: 'Expansion rules',
      leftFactionId: references.factionId,
      rightFactionId,
    };
    for (const work of await t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'html' })) {
      await t.mutation(internal.rulebookEditionArtifactWork.complete, {
        artifactKind: 'html',
        artifactId: work.artifactId,
      });
    }
    for (const work of await t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'pdf' })) {
      await t.mutation(internal.rulebookEditionArtifactWork.complete, {
        artifactKind: 'pdf',
        artifactId: work.artifactId,
      });
    }
    await publishReferences(fixture);
    const changedBackground = { ...assetPublishingFaction.background, influence: 0.3 };
    await t.run((ctx) =>
      ctx.db.patch('factions', references.factionId, {
        data: { ...assetPublishingFaction, logo: '/vector/logo/ixian.svg', background: changedBackground },
      })
    );
    const liveLeft = {
      emblemUrl: '/vector/logo/ixian.svg',
      token: { logo: '/vector/logo/ixian.svg', background: changedBackground },
    };
    const liveRight = {
      emblemUrl: '/vector/logo/fremen.svg',
      token: { logo: '/vector/logo/fremen.svg', background: assetPublishingFaction.background },
    };
    const reader = await t.query(api.rulebooks.readerPage, locator);
    expect(reader?.factionsById).toMatchObject({
      [references.factionId]: liveLeft,
      [rightFactionId]: liveRight,
    });
    const work = [
      ...(await t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'html' })),
      ...(await t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'pdf' })),
    ];
    expect(work).toHaveLength(2);
    for (const item of work) {
      expect(item.document.pagesById.CVVR).toMatchObject({
        controlValues: {
          cover: {
            footer: {
              title: 'Two Houses',
              label: 'Expansion rules',
              leftFaction: { status: 'ready', ...liveLeft },
              rightFaction: { status: 'ready', ...liveRight },
            },
          },
        },
      });
    }
    const jobs = await t.run((ctx) => ctx.db.query('publication_jobs').collect());
    expect(jobs.find((job) => job.asset_id !== created.edition._id)?.asset_data).toMatchObject({
      page: {
        controlValues: {
          cover: {
            footer: {
              leftFaction: {
                status: 'ready',
                token: { logo: assetPublishingFaction.logo, background: assetPublishingFaction.background },
              },
              rightFaction: { status: 'ready', ...liveRight },
            },
          },
        },
      },
    });
    cover.controlValues.cover.footer.enabled = false;
    await owner.mutation(api.rulebooks.save, { rulebook_id: created.rulebook._id, expected_revision: 2, contents });
    expect(await owner.query(api.rulebooks.editorPage, locator)).toMatchObject({ factionsById: {} });
    expect((await t.query(api.rulebooks.readerPage, locator))?.factionsById).toEqual(reader?.factionsById);
    await t.run((ctx) => ctx.db.patch('factions', rightFactionId, { is_deleted: true }));
    expect((await t.query(api.rulebooks.readerPage, locator))?.factionsById).not.toHaveProperty(rightFactionId);
  });

  test('resolves newly picked references before Save and preserves them in every publication projection', async () => {
    const fixture = await referenceFixture();
    const { t, owner, locator, references, created } = fixture;
    const { assetId, factionId } = references;
    expect(await owner.query(api.rulebooks.editorPage, locator)).toMatchObject({ assetsById: {}, factionsById: {} });
    expect(
      await owner.query(api.rulebooks.editorPage, {
        ...locator,
        reference_asset_ids: [assetId],
        reference_faction_ids: [factionId],
      })
    ).toMatchObject({
      assetsById: { [assetId]: { imageUrl: publishedHref('token-disc', assetId, 'initial') } },
      factionsById: {
        [factionId]: {
          factionId,
          name: assetPublishingFaction.name,
          color: assetPublishingFaction.background.colors[0],
        },
      },
    });
    for (const work of await t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'html' })) {
      await t.mutation(internal.rulebookEditionArtifactWork.complete, {
        artifactKind: 'html',
        artifactId: work.artifactId,
      });
    }
    for (const work of await t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'pdf' })) {
      await t.mutation(internal.rulebookEditionArtifactWork.complete, {
        artifactKind: 'pdf',
        artifactId: work.artifactId,
      });
    }
    await publishReferences(fixture);
    const reader = await t.query(api.rulebooks.readerPage, locator);
    expect(reader?.edition.contents).toEqual(fixture.contents);
    const [html, pdf] = await Promise.all([
      t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'html' }),
      t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'pdf' }),
    ]);
    for (const document of [
      html.find((work) => work.editionNumber === 2)?.document,
      pdf.find((work) => work.editionNumber === 2)?.document,
    ]) {
      expect(document?.pagesById.CVVR).toMatchObject({
        controlValues: {
          cover: {
            artwork: { status: 'ready', assetId, imageUrl: publishedHref('token-disc', assetId, 'initial') },
            subtitle: 'Table reference',
            supportingText: '',
          },
        },
      });
      expect(document?.pagesById.RULE.regions[0]?.blocks[0]).toMatchObject({
        title: 'Movement advantages',
        faction: { status: 'ready', factionId, name: assetPublishingFaction.name },
      });
    }
    const jobs = await t.run((ctx) => ctx.db.query('publication_jobs').collect());
    expect(jobs.find((job) => job.asset_id !== created.edition._id)?.asset_data).toMatchObject({
      page: { layoutId: 'cover', controlValues: { cover: { artwork: { status: 'ready', assetId } } } },
    });
  });

  test('cleared draft references stop loading sources while the published Edition keeps its selections', async () => {
    const fixture = await referenceFixture();
    const { t, owner, locator, created, references } = fixture;
    await publishReferences(fixture);
    const cleared = structuredClone(fixture.contents);
    const cover = cleared.pagesById.CVVR;
    const heading = cleared.pagesById.RULE.blocksById.HEAD;
    if (cover.layoutId !== 'cover' || heading.kind !== 'section-heading') {
      throw new Error('Expected the selected Cover and heading');
    }
    delete cover.controlValues.cover.artworkAssetId;
    delete heading.factionId;
    await owner.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 2,
      contents: cleared,
    });
    expect(await owner.query(api.rulebooks.editorPage, locator)).toMatchObject({
      kind: 'editable',
      assetsById: {},
      factionsById: {},
    });
    expect(await t.query(api.rulebooks.readerPage, locator)).toMatchObject({
      edition: { contents: fixture.contents },
      assetsById: { [references.assetId]: { assetId: references.assetId } },
      factionsById: { [references.factionId]: { factionId: references.factionId } },
    });
  });

  test('reads changed and unavailable live sources without changing the saved Edition or authored labels', async () => {
    const fixture = await referenceFixture();
    const { t, owner, locator, references } = fixture;
    const { assetId, factionId, publicationId } = references;
    await publishReferences(fixture);
    await t.run(async (ctx) => {
      await ctx.db.patch('factions', factionId, {
        data: {
          ...assetPublishingFaction,
          name: 'Updated faction',
          background: { ...assetPublishingFaction.background, colors: ['#112233', '#eeeeee'] },
        },
      });
      await ctx.db.patch('assets', assetId, { data: { name: 'Revised artwork' } });
      await ctx.db.patch('publication_assets', publicationId, { cache_token: 'updated', published_at: 2 });
    });
    const reader = await t.query(api.rulebooks.readerPage, locator);
    expect(reader).toMatchObject({
      edition: { edition_number: 2, contents: fixture.contents },
      assetsById: { [assetId]: { name: 'Revised artwork', imageUrl: publishedHref('token-disc', assetId, 'updated') } },
      factionsById: { [factionId]: { name: 'Updated faction', color: '#112233' } },
    });
    expect(await owner.query(api.rulebooks.editorPage, locator)).toMatchObject({
      factionsById: reader?.factionsById,
      assetsById: reader?.assetsById,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch('factions', factionId, { is_deleted: true });
      await ctx.db.delete('publication_assets', publicationId);
    });
    const unavailable = await t.query(api.rulebooks.readerPage, locator);
    if (!unavailable) {
      throw new Error('Expected the published Rulebook');
    }
    expect(unavailable.edition.contents).toEqual(fixture.contents);
    const document = projectRulebookRenderDocument(
      unavailable.edition.contents,
      unavailable.assetsById,
      unavailable.edition.settings,
      unavailable.factionsById
    );
    expect(document.pagesById.RULE.regions[0]?.blocks[0]).toMatchObject({
      title: 'Movement advantages',
      faction: { status: 'unavailable', factionId },
    });
    expect(document.pagesById.CVVR).toMatchObject({
      controlValues: {
        cover: {
          artwork: { status: 'unavailable', assetId },
          subtitle: 'Table reference',
          supportingText: '',
        },
      },
    });
    await t.run((ctx) => ctx.db.patch('assets', assetId, { is_deleted: true }));
    expect(await t.query(api.rulebooks.readerPage, locator)).toMatchObject({ assetsById: {}, factionsById: {} });
  });
});
