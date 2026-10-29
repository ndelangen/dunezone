// @vitest-environment edge-runtime

import { afterEach, describe, expect, test, vi } from 'vite-plus/test';

import { RULEBOOK_CATALOGUE_VERSION, rulebookContentsV1Schema } from '../src/shared/rulebooks/contents';
import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import type { RulebookCoverImage } from '../src/shared/rulebooks/coverImage';
import { rulebookCoverPresetCatalogue } from '../src/shared/rulebooks/coverPresets';
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

type CoverControls = Extract<RulebookContentsV1['pagesById'][string], { layoutId: 'cover' }>['controlValues']['cover'];

async function publishedCoverFixture(overrides: Partial<CoverControls> = {}) {
  const f = await fixture();
  const signedSource = `${SOURCE_URL}?signature=private-cover-secret&expires=9999999999`;
  const contents = rulebookContentsV1Schema.parse(f.created.draft.contents);
  const cover: CoverControls = {
    subtitle: '',
    supportingText: '',
    showDuneLogo: true,
    backgroundImageUrl: signedSource,
    backgroundImage: { ...IMAGE, sourceUrl: signedSource },
    ...overrides,
  };
  contents.pagesById.CVER = {
    id: 'CVER',
    anchor: 'cover',
    title: 'Cover manual',
    layoutId: 'cover',
    showHeading: true,
    controlValues: { cover },
    blocksById: {},
    blockOrderByRegion: {},
  };
  contents.pageOrder.unshift('CVER');
  await f.owner.mutation(api.rulebooks.save, {
    rulebook_id: f.created.rulebook._id,
    expected_revision: 1,
    contents,
  });
  await f.owner.mutation(api.rulebooks.publish, {
    rulebook_id: f.created.rulebook._id,
    expected_revision: 2,
    confirmed: true,
  });
  const locator = { ruleset_slug: 'rulebook-test-rules', rulebook_slug: f.created.rulebook.slug };
  return { f, contents, cover, locator };
}

async function completeInitialPublication(f: Awaited<ReturnType<typeof fixture>>) {
  const htmlWork = await f.t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'html' });
  expect(htmlWork).toHaveLength(1);
  expect(htmlWork[0]).toMatchObject({ editionNumber: 1 });
  await f.t.mutation(internal.rulebookEditionArtifactWork.complete, {
    artifactKind: 'html',
    artifactId: htmlWork[0]!.artifactId,
  });
  const pdfWork = await f.t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'pdf' });
  expect(pdfWork).toHaveLength(1);
  expect(pdfWork[0]).toMatchObject({ editionNumber: 1 });
  await f.t.mutation(internal.rulebookEditionArtifactWork.complete, {
    artifactKind: 'pdf',
    artifactId: pdfWork[0]!.artifactId,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Rulebook cover image staging', () => {
  test('a retained 3000-pixel cover remains readable and can be replaced through normal Save', async () => {
    const image = {
      width: 1560,
      height: 3000,
      sourceUrl:
        'https://raw.githubusercontent.com/ndelangen/dunezone/8f932fcbbf538ecbfa66aefe4d45308cc3158f5f/content/gf9/artwork/originals/ixian-cover.png',
      url: 'http://127.0.0.1:31656/user-images/cfce5d1a2aa33d1eab50184ba23389efb830cae621ea911096cd51507ba66242.jpg',
    };
    vi.stubEnv('USER_IMAGE_INGEST_BASE_URL', 'http://host.docker.internal:31660');
    vi.stubEnv('USER_IMAGE_PUBLIC_BASE_URL', 'http://127.0.0.1:31656');
    const { f, contents, locator, cover } = await publishedCoverFixture({
      backgroundSource: { kind: 'url' },
      backgroundImageUrl: image.sourceUrl,
      backgroundImage: { ...image, height: 1600 },
    });
    cover.backgroundImage = image;
    /* Reproduce data saved by an earlier encoder, independently of today's Save validator. */
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.created.draft._id, { contents, contents_hash: undefined, authored_hash: undefined });
      const edition = await ctx.db
        .query('rulebook_editions')
        .withIndex('by_rulebook_and_edition_number', (q) =>
          q.eq('rulebook_id', f.created.rulebook._id).eq('edition_number', 2)
        )
        .unique();
      if (!edition) {
        throw new Error('Missing published Edition');
      }
      const stored = await ctx.db
        .query('rulebook_edition_contents')
        .withIndex('by_edition_id', (q) => q.eq('edition_id', edition._id))
        .unique();
      if (!stored) {
        throw new Error('Missing published Contents');
      }
      await ctx.db.patch(stored._id, { contents });
      await ctx.db.patch(edition._id, { contents_hash: undefined, authored_hash: undefined });
    });

    const editor = await f.owner.query(api.rulebooks.editorPage, locator);
    expect(editor).toMatchObject({ kind: 'editable', draft: { contents, settings: f.created.draft.settings } });
    const saved = await f.owner.mutation(api.rulebooks.save, {
      rulebook_id: f.created.rulebook._id,
      expected_revision: 2,
      contents,
    });
    expect(saved).toMatchObject({
      kind: 'saved',
      draft: { revision: 3, contents, settings: f.created.draft.settings },
    });

    const replacement = structuredClone(contents);
    const page = replacement.pagesById.CVER!;
    if (page.layoutId !== 'cover') {
      throw new Error('Expected Cover');
    }
    page.controlValues.cover = {
      ...cover,
      backgroundSource: { kind: 'preset', presetId: 'sandworm' },
    };
    delete page.controlValues.cover.backgroundImage;
    delete page.controlValues.cover.backgroundImageUrl;
    await expect(
      f.owner.mutation(api.rulebooks.save, {
        rulebook_id: f.created.rulebook._id,
        expected_revision: 3,
        contents: replacement,
      })
    ).resolves.toMatchObject({ kind: 'saved', draft: { revision: 4, contents: replacement } });
    const reader = await f.t.query(api.rulebooks.readerPage, locator);
    expect(reader?.edition.contents.pagesById.CVER).toHaveProperty('controlValues.cover.backgroundImage', {
      ...image,
      sourceUrl: image.url,
    });
  });

  test('stored covers with historical IP source metadata remain editable and readable', async () => {
    const sourceUrl = 'https://8.8.8.8/cover.png';
    const { f, contents, locator } = await publishedCoverFixture({
      backgroundImageUrl: sourceUrl,
      backgroundImage: { ...IMAGE, sourceUrl },
    });
    const editor = await f.owner.query(api.rulebooks.editorPage, locator);
    expect(editor).toMatchObject({ kind: 'editable', draft: { contents } });
    const reader = await f.t.query(api.rulebooks.readerPage, locator);
    expect(reader?.edition.contents.pagesById.CVER).toHaveProperty('controlValues.cover.backgroundImageUrl', IMAGE.url);
    await expect(
      f.owner.mutation(api.rulebooks.save, {
        rulebook_id: f.created.rulebook._id,
        expected_revision: 2,
        contents,
      })
    ).resolves.toMatchObject({ kind: 'saved' });
    await completeInitialPublication(f);
    const work = await f.t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'html' });
    expect(work.find((item) => item.editionNumber === 2)?.document.pagesById.CVER).toHaveProperty(
      'controlValues.cover.backgroundImageUrl',
      IMAGE.url
    );
  });

  test('presets keep inactive sources private and require rehosting again when URL mode is selected', async () => {
    const preset = rulebookCoverPresetCatalogue[0];
    const { f, contents, locator, cover } = await publishedCoverFixture({
      backgroundSource: { kind: 'preset', presetId: preset.id },
      backgroundImageUrl: `${SOURCE_URL}?signature=inactive-cover-secret`,
    });
    const reader = await f.t.query(api.rulebooks.readerPage, locator);
    const publicCover = reader?.edition.contents.pagesById.CVER;
    expect(JSON.stringify(reader)).not.toContain('cover-secret');
    expect(publicCover).toMatchObject({ layoutId: 'cover' });
    expect(publicCover).toHaveProperty('controlValues.cover.backgroundSource', cover.backgroundSource);
    expect(publicCover).not.toHaveProperty('controlValues.cover.backgroundImage');
    expect(publicCover).not.toHaveProperty('controlValues.cover.backgroundImageUrl');

    await completeInitialPublication(f);
    const work = [
      ...(await f.t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'html' })),
      ...(await f.t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'pdf' })),
    ];
    expect(work).toHaveLength(2);
    for (const item of work) {
      const renderedPage = item.document.pagesById.CVER;
      expect(JSON.stringify(item.document)).not.toContain('cover-secret');
      expect(renderedPage).toMatchObject({
        layoutId: 'cover',
        controlValues: { cover: { backgroundImageUrl: preset.imageUrl } },
      });
      expect(renderedPage).not.toHaveProperty('controlValues.cover.backgroundImage');
    }

    const editor = await f.owner.query(api.rulebooks.editorPage, locator);
    expect(editor).toMatchObject({ kind: 'editable', draft: { contents } });
    const clone = await f.owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: f.ids.rulesetId,
      name: 'Preset clone',
      source: { kind: 'clone', rulebook_id: f.created.rulebook._id },
    });
    const clonedCover = Object.values(rulebookContentsV1Schema.parse(clone.draft.contents).pagesById).find(
      (page) => page.layoutId === 'cover'
    );
    expect(clonedCover?.controlValues.cover).toEqual(cover);

    const args = { rulebook_id: f.created.rulebook._id, expected_revision: 2, contents };
    cover.backgroundImage = { ...IMAGE, url: `http://localhost:9999/user-images/${KEY}` };
    await expect(f.owner.mutation(api.rulebooks.save, args)).rejects.toThrow('Store the cover image');
    cover.backgroundImage = IMAGE;
    cover.backgroundSource = { kind: 'url' };
    await expect(f.owner.mutation(api.rulebooks.save, args)).rejects.toThrow('Store the cover image');
    cover.backgroundImageUrl = SOURCE_URL;
    expect(await f.owner.mutation(api.rulebooks.save, args)).toMatchObject({ kind: 'saved' });
  });

  test('public reading and publication omit signed cover sources', async () => {
    const { f, locator } = await publishedCoverFixture();
    const reader = await f.t.query(api.rulebooks.readerPage, locator);
    expect(JSON.stringify(reader)).not.toContain('private-cover-secret');
    expect(reader?.edition.contents.pagesById.CVER).toMatchObject({
      layoutId: 'cover',
      controlValues: {
        cover: {
          backgroundImageUrl: IMAGE.url,
          backgroundImage: { ...IMAGE, sourceUrl: IMAGE.url },
        },
      },
    });
    await completeInitialPublication(f);
    const htmlWork = await f.t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'html' });
    const pdfWork = await f.t.mutation(internal.rulebookEditionArtifactWork.take, { artifactKind: 'pdf' });
    for (const work of [htmlWork, pdfWork]) {
      const publication = work.find((item) => item.editionNumber === 2)!;
      expect(publication).toBeDefined();
      expect(JSON.stringify(publication.document)).not.toContain('private-cover-secret');
      const rendered = publication.document.pagesById.CVER;
      if (rendered.layoutId !== 'cover') {
        throw new Error('Expected the published Cover');
      }
      const renderedCover = rendered.controlValues.cover;
      expect(renderedCover.backgroundImageUrl).toBe(IMAGE.url);
      expect(renderedCover.backgroundImage).toEqual(RESULT);
    }
  });

  test('the stored Edition, editor, and clone retain signed cover sources', async () => {
    const { f, contents, cover, locator } = await publishedCoverFixture();
    const stored = await f.t.run(async (ctx) => {
      const edition = await ctx.db
        .query('rulebook_editions')
        .withIndex('by_rulebook_and_edition_number', (q) =>
          q.eq('rulebook_id', f.created.rulebook._id).eq('edition_number', 2)
        )
        .unique();
      return await ctx.db
        .query('rulebook_edition_contents')
        .withIndex('by_edition_id', (q) => q.eq('edition_id', edition!._id))
        .unique();
    });
    expect(stored?.contents).toEqual(contents);
    const editor = await f.owner.query(api.rulebooks.editorPage, locator);
    expect(editor).toMatchObject({ kind: 'editable', draft: { contents } });
    const clone = await f.owner.mutation(api.rulebooks.create, {
      catalogue_version: RULEBOOK_CATALOGUE_VERSION,
      ruleset_id: f.ids.rulesetId,
      name: 'Cover clone',
      source: { kind: 'clone', rulebook_id: f.created.rulebook._id },
    });
    const cloned = rulebookContentsV1Schema.parse(clone.draft.contents);
    const clonedCover = Object.values(cloned.pagesById).find((page) => page.layoutId === 'cover');
    expect(clonedCover?.controlValues.cover).toEqual(cover);
  });

  test('rehosts a full image through the ledger without changing the draft or Edition', async () => {
    const f = await fixture();
    vi.stubEnv('USER_IMAGE_INGEST_BASE_URL', 'https://worker.test');
    let token = '';
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { token: string; source_url: string };
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
    expect(await f.t.run(async (ctx) => await ctx.db.get(f.created.draft._id))).toEqual(
      Object.fromEntries(Object.entries(f.created.draft).filter(([key]) => key !== 'settings'))
    );
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
    /* A configured Worker means each refusal below comes from the guard it names, not from a missing ingest setting. */
    vi.stubEnv('USER_IMAGE_INGEST_BASE_URL', 'https://worker.test');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const args = { rulebookId: f.created.rulebook._id, sourceUrl: SOURCE_URL };
    await expect(f.outsider.action(api.rulebookCoverImages.rehost, args)).rejects.toThrow('Not authorized');
    await expect(f.t.action(api.rulebookCoverImages.rehost, args)).rejects.toThrow('Not authenticated');
    for (const [sourceUrl, message] of [
      ['http://images.example/a.png', 'Cover image must use a full https:// URL'],
      ['https://user:secret@images.example/a.png', 'Cover image URL must not carry credentials'],
      ['bad', 'Cover image must be a full https:// URL'],
    ]) {
      await expect(f.owner.action(api.rulebookCoverImages.rehost, { ...args, sourceUrl })).rejects.toThrow(message);
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
      expect(await f.t.run(async (ctx) => await ctx.db.get(f.created.draft._id))).toEqual(
        Object.fromEntries(Object.entries(f.created.draft).filter(([key]) => key !== 'settings'))
      );
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
      { ...RESULT, width: 1560, height: 3000 },
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

  test('a local Docker ingest can deliver through its configured browser proxy', async () => {
    const f = await fixture();
    vi.stubEnv('USER_IMAGE_INGEST_BASE_URL', 'http://host.docker.internal:7777');
    vi.stubEnv('USER_IMAGE_PUBLIC_BASE_URL', 'http://127.0.0.1:7778');
    const editor = await f.owner.query(api.rulebooks.editorPage, {
      ruleset_slug: 'rulebook-test-rules',
      rulebook_slug: f.created.rulebook.slug,
    });
    expect(editor?.kind === 'editable' && editor.coverImageOrigins).toEqual([
      'https://dune.zone',
      'http://host.docker.internal:7777',
      'http://127.0.0.1:7778',
    ]);
    const anonymous = await f.t.query(api.rulebooks.editorPage, {
      ruleset_slug: 'rulebook-test-rules',
      rulebook_slug: f.created.rulebook.slug,
    });
    expect(anonymous?.kind).toBe('sign-in-required');
    expect(anonymous).not.toHaveProperty('coverImageOrigins');
    const { token } = await mint(f);
    const result = { ...RESULT, url: `http://127.0.0.1:7778/user-images/${KEY}` };
    expect(await f.t.mutation(api.ingestTokens.consume, { token, result, r2_keys: [KEY] })).toEqual({ ok: true });
    expect(await f.t.query(internal.rulebookCoverImages.stagedImage, { token })).toEqual({ ...IMAGE, ...result });
  });

  test.each([
    ['https://worker.test', 'http://127.0.0.1:7778'],
    ['http://host.docker.internal:7777', 'https://elsewhere.example'],
    ['http://host.docker.internal:7777', 'http://user:password@127.0.0.1:7778'],
  ])('local delivery cannot widen a nonlocal or credential-bearing configuration', async (ingest, delivery) => {
    const f = await fixture();
    vi.stubEnv('USER_IMAGE_INGEST_BASE_URL', ingest);
    vi.stubEnv('USER_IMAGE_PUBLIC_BASE_URL', delivery);
    const { token } = await mint(f);
    const result = { ...RESULT, url: `${new URL(delivery).origin}/user-images/${KEY}` };
    expect(await f.t.mutation(api.ingestTokens.consume, { token, result, r2_keys: [KEY] })).toEqual({
      ok: false,
      reason: 'invalid_payload',
    });
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
