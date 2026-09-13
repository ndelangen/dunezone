// @vitest-environment edge-runtime

import { afterEach, describe, expect, test, vi } from 'vitest';

import { RULEBOOK_CATALOGUE_VERSION, rulebookContentsV1Schema } from '../src/shared/rulebooks/contents';
import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import type { RulebookCoverImage } from '../src/shared/rulebooks/coverImage';
import { api, internal } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

const SOURCE_URL = 'https://images.example/cover.png';
const KEY = `${'a'.repeat(64)}.jpg`;
const IMAGE: RulebookCoverImage = {
  url: `https://dune.zone/user-images/${KEY}`,
  sourceUrl: SOURCE_URL,
  width: 1100,
  height: 1600,
};
const RESULT = { url: IMAGE.url, width: IMAGE.width, height: IMAGE.height };

async function fixture() {
  const fixture = await rulebookFixture();
  const created = await fixture.owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: fixture.ids.rulesetId,
    name: 'Cover manual',
    source: { kind: 'starter' },
  });
  return { ...fixture, created };
}

async function mint(f: Awaited<ReturnType<typeof fixture>>) {
  return await f.t.mutation(internal.ingestTokens.mint, {
    capability: { kind: 'rulebook_cover', rulebook_id: f.created.rulebook._id },
    source_url: SOURCE_URL,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Rulebook cover image staging', () => {
  test('rehosts a full image through the ledger without changing the draft or Edition', async () => {
    const f = await fixture();
    vi.stubEnv('USER_IMAGE_INGEST_BASE_URL', 'https://worker.test');
    let token = '';
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { token: string; source_url: string };
      token = body.token;
      expect(body.source_url).toBe(SOURCE_URL);
      expect(await f.t.query(api.ingestTokens.check, { token, now: Date.now() })).toEqual({
        valid: true,
        kind: 'rulebook_cover',
      });
      expect(await f.t.mutation(api.ingestTokens.consume, { token, result: RESULT, r2_keys: [KEY] })).toEqual({
        ok: true,
      });
      return Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(
      await f.member.action(api.rulebookCoverImages.rehost, {
        rulebookId: f.created.rulebook._id,
        sourceUrl: ` ${SOURCE_URL} `,
      })
    ).toEqual(IMAGE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await f.t.run(async (ctx) => await ctx.db.get(f.created.draft._id))).toEqual(f.created.draft);
    const edition = await f.t.run(
      async (ctx) =>
        await ctx.db
          .query('rulebook_edition_contents')
          .withIndex('by_edition_id', (q) => q.eq('edition_id', f.created.edition._id))
          .unique()
    );
    expect(edition?.contents).toEqual(f.created.edition.contents);
    expect(await f.t.query(internal.rulebookCoverImages.stagedImage, { token })).toEqual(IMAGE);
    expect(await f.t.mutation(api.ingestTokens.consume, { token, result: RESULT, r2_keys: [KEY] })).toEqual({
      ok: false,
      reason: 'consumed',
    });
  });

  test('unauthorized authors and unsafe sources are refused before minting or fetching', async () => {
    const f = await fixture();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const args = { rulebookId: f.created.rulebook._id, sourceUrl: SOURCE_URL };
    await expect(f.outsider.action(api.rulebookCoverImages.rehost, args)).rejects.toThrow();
    await expect(f.t.action(api.rulebookCoverImages.rehost, args)).rejects.toThrow();
    for (const sourceUrl of ['http://images.example/a.png', 'https://user:secret@images.example/a.png', 'bad']) {
      await expect(f.owner.action(api.rulebookCoverImages.rehost, { ...args, sourceUrl })).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await f.t.run(async (ctx) => await ctx.db.query('user_image_ingest_tokens').take(1))).toEqual([]);
  });

  test.each(['rulebook', 'ruleset'] as const)(
    'a deleted %s rejects completion and retains produced keys',
    async (kind) => {
      const f = await fixture();
      const { token } = await mint(f);
      await f.t.run(async (ctx) => {
        if (kind === 'rulebook') {
          await ctx.db.patch(f.created.rulebook._id, { is_deleted: true });
        } else {
          await ctx.db.patch(f.ids.rulesetId, { is_deleted: true });
        }
      });
      expect(await f.t.mutation(api.ingestTokens.consume, { token, result: RESULT, r2_keys: [KEY] })).toEqual({
        ok: false,
        reason: 'entity_gone',
      });
      const row = await f.t.run(
        async (ctx) =>
          await ctx.db
            .query('user_image_ingest_tokens')
            .withIndex('by_token_id', (q) => q.eq('token_id', token))
            .unique()
      );
      expect(row).toMatchObject({ consumed: true, r2_keys: [KEY] });
      expect(row?.rulebook_cover_image).toBeUndefined();
      expect(await f.t.run(async (ctx) => await ctx.db.get(f.created.draft._id))).toEqual(f.created.draft);
    }
  );

  test('an untrusted host, mismatched key, or wrong recipe cannot consume the capability', async () => {
    const f = await fixture();
    const { token } = await mint(f);
    for (const result of [
      { ...RESULT, url: `https://elsewhere.example/user-images/${KEY}` },
      { ...RESULT, url: `http://localhost:9999/user-images/${KEY}` },
      { ...RESULT, url: `https://dune.zone/user-images/${'b'.repeat(64)}.jpg` },
      { ...RESULT, thumb_url: IMAGE.url },
      { ...RESULT, width: 1601 },
    ]) {
      expect(await f.t.mutation(api.ingestTokens.consume, { token, result, r2_keys: [KEY] })).toEqual({
        ok: false,
        reason: 'invalid_payload',
      });
    }
    expect(await f.t.mutation(api.ingestTokens.consume, { token, result: RESULT, r2_keys: [KEY] })).toEqual({
      ok: true,
    });
  });

  test('a successful HTTP response without a consumed image does not claim success', async () => {
    const f = await fixture();
    vi.stubEnv('USER_IMAGE_INGEST_BASE_URL', 'https://worker.test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: true }))
    );
    await expect(
      f.owner.action(api.rulebookCoverImages.rehost, {
        rulebookId: f.created.rulebook._id,
        sourceUrl: SOURCE_URL,
      })
    ).rejects.toThrow('could not be stored');
  });

  test('isolated development accepts only its configured local Worker origin', async () => {
    const f = await fixture();
    vi.stubEnv('USER_IMAGE_INGEST_BASE_URL', 'http://127.0.0.1:7777');
    const { token } = await mint(f);
    expect(
      await f.t.mutation(api.ingestTokens.consume, {
        token,
        result: { ...RESULT, url: `http://127.0.0.1:7778/user-images/${KEY}` },
        r2_keys: [KEY],
      })
    ).toEqual({ ok: false, reason: 'invalid_payload' });
    const result = { ...RESULT, url: `http://127.0.0.1:7777/user-images/${KEY}` };
    expect(await f.t.mutation(api.ingestTokens.consume, { token, result, r2_keys: [KEY] })).toEqual({ ok: true });
    expect(await f.t.query(internal.rulebookCoverImages.stagedImage, { token })).toEqual({ ...IMAGE, ...result });
  });

  test('Save accepts a matching stored image, rejects a raw source, and leaves the previous Edition intact', async () => {
    const f = await fixture();
    const contents = rulebookContentsV1Schema.parse(f.created.draft.contents);
    const page: Extract<RulebookContentsV1['pagesById'][string], { layoutId: 'cover' }> = {
      id: 'CVER',
      anchor: 'cover',
      title: 'Cover manual',
      layoutId: 'cover' as const,
      showHeading: true,
      controlValues: { cover: { subtitle: '', showSubtitle: true, supportingText: '', backgroundImageUrl: '' } },
      blocksById: {},
      blockOrderByRegion: {},
    };
    contents.pagesById[page.id] = page;
    contents.pageOrder.unshift(page.id);
    page.controlValues.cover.backgroundImageUrl = SOURCE_URL;
    const args = { rulebook_id: f.created.rulebook._id, expected_revision: f.created.draft.revision, contents };
    await expect(f.owner.mutation(api.rulebooks.save, args)).rejects.toThrow('Store the cover image');
    page.controlValues.cover.backgroundImage = { ...IMAGE, sourceUrl: `${SOURCE_URL}?other` };
    await expect(f.owner.mutation(api.rulebooks.save, args)).rejects.toThrow('Store the cover image');
    page.controlValues.cover.backgroundImage = { ...IMAGE, url: `http://localhost:9999/user-images/${KEY}` };
    await expect(f.owner.mutation(api.rulebooks.save, args)).rejects.toThrow('Store the cover image');
    page.controlValues.cover.backgroundImage = IMAGE;
    const saved = await f.owner.mutation(api.rulebooks.save, args);
    expect(saved.kind).toBe('saved');
    expect(saved.draft.contents).toEqual(contents);
    const edition = await f.t.run(
      async (ctx) =>
        await ctx.db
          .query('rulebook_edition_contents')
          .withIndex('by_edition_id', (q) => q.eq('edition_id', f.created.edition._id))
          .unique()
    );
    expect(edition?.contents).toEqual(f.created.edition.contents);
  });
});
