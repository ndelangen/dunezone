/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test } from 'vite-plus/test';

import { publishingSpiceCard } from '../src/shared/assets/fixtures/publishingSpiceCard';
import { publishingTokenFace } from '../src/shared/assets/fixtures/publishingTokenFace';
import { publishingTreacheryCard } from '../src/shared/assets/fixtures/publishingTreacheryCard';
import { parseRawAsset, readRawAuthoringJson } from '../src/shared/authoring/raw';
import { arrakisBoard } from '../src/shared/boards/geometry';
import { contentImportPackageSchema } from '../src/shared/contentImports/package';
import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

const target = { rulesetSlug: 'rulebook-test-rules', groupSlug: 'rulebook-authors' };
const styledFace = {
  ...publishingTokenFace,
  symbolFill: '#07120f',
  symbolStroke: '#f3edbf80',
  symbolStrokeWidth: 5.5,
  symbolShadow: false,
};

test('native component fields survive read-only raw preflight, normal Save and authenticated export', async () => {
  const { t, owner, outsider, ids } = await rulebookFixture();
  const token = await owner.mutation(api.assets.create, {
    type: 'token-disc',
    group_id: ids.groupId,
    data: { name: 'Native marker', about: '', front: publishingTokenFace, back: { mode: 'same' } },
  });
  const board = await owner.mutation(api.assets.create, {
    type: 'board',
    data: { name: 'Native board', about: '', board: arrakisBoard() },
  });
  const cases = [
    {
      type: 'token-disc',
      created: token,
      data: { name: 'Native marker', about: '', front: styledFace, back: { mode: 'custom', face: styledFace } },
    },
    {
      type: 'card-treachery',
      data: { ...publishingTreacheryCard, text: 'Keep the *complete* instruction.', bodyLayout: 'text-only' },
    },
    {
      type: 'card-spice',
      data: {
        ...publishingSpiceCard,
        board: {
          asset_id: board.id,
          typeToken: { asset_id: token.id },
          look: { style: 'textured-burn', strength: 0.8 },
          tokens: [],
          tints: [],
        },
      },
    },
  ];
  for (const entry of cases) {
    const created =
      entry.created ??
      (await owner.mutation(api.assets.create, {
        type: entry.type,
        group_id: ids.groupId,
        data: entry.type === 'card-spice' ? publishingSpiceCard : publishingTreacheryCard,
      }));
    const before = await t.run(async (ctx) => ({
      row: await ctx.db.get(created.id),
      jobs: await ctx.db.query('publication_jobs').collect(),
      ingest: await ctx.db.query('user_image_ingest_tokens').collect(),
      relations: await ctx.db.query('asset_relations').collect(),
    }));
    const text = JSON.stringify(entry.data);
    expect(parseRawAsset(entry.type, readRawAuthoringJson(text)).data).toEqual(entry.data);
    await expect(
      owner.query(api.authoringValidation.raw, {
        kind: 'asset',
        type: entry.type,
        targetId: created.id,
        text,
      })
    ).resolves.toBeNull();
    expect(
      await t.run(async (ctx) => ({
        row: await ctx.db.get(created.id),
        jobs: await ctx.db.query('publication_jobs').collect(),
        ingest: await ctx.db.query('user_image_ingest_tokens').collect(),
        relations: await ctx.db.query('asset_relations').collect(),
      }))
    ).toEqual(before);
    await expect(outsider.mutation(api.assets.update, { id: created.id, data: entry.data })).rejects.toThrow(
      'Not authorized'
    );
    await owner.mutation(api.assets.update, { id: created.id, data: entry.data });
    const exported = await owner.mutation(api.contentImports.exportRecord, {
      target,
      kind: 'asset',
      type: entry.type,
      slug: created.slug,
    });
    const item = contentImportPackageSchema.parse(exported.package).items[0]!;
    expect(item.data).toEqual(entry.data);
    expect(parseRawAsset(entry.type, readRawAuthoringJson(JSON.stringify(item.data))).data).toEqual(entry.data);
    expect(await t.run((ctx) => ctx.db.get(created.id))).toMatchObject({
      _id: created.id,
      owner_id: ids.ownerId,
      group_id: ids.groupId,
      data: entry.data,
    });
    await expect(
      outsider.mutation(api.contentImports.exportRecord, {
        target,
        kind: 'asset',
        type: entry.type,
        slug: created.slug,
      })
    ).rejects.toThrow();
  }
}, 30_000);

test('raw native Spice rejects a wrong-type fixed token or board before Load without changing its target', async () => {
  const { t, owner } = await rulebookFixture();
  const card = await owner.mutation(api.assets.create, { type: 'card-spice', data: publishingSpiceCard });
  const board = await owner.mutation(api.assets.create, {
    type: 'board',
    data: { name: 'Native board', about: '', board: arrakisBoard() },
  });
  const before = await t.run((ctx) => ctx.db.get(card.id));
  for (const link of [
    { asset_id: board.id, typeToken: { asset_id: card.id }, tokens: [], tints: [] },
    { asset_id: card.id, tokens: [], tints: [] },
  ]) {
    await expect(
      owner.query(api.authoringValidation.raw, {
        kind: 'asset',
        type: 'card-spice',
        targetId: card.id,
        text: JSON.stringify({ ...publishingSpiceCard, board: link }),
      })
    ).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.get(card.id))).toEqual(before);
  }
});
