/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const ABOUT = 'A test ruleset with a description long enough to satisfy the fifty character floor.';
const SOURCE_URL = 'https://images.example/cover.png';
const DELIVERY_URL = `https://dune.zone/user-images/${'a'.repeat(64)}.jpg`;
const DELIVERY_THUMB_URL = `https://dune.zone/user-images/${'b'.repeat(64)}.jpg`;
const STORED_COVER = {
  url: DELIVERY_URL,
  thumb_url: DELIVERY_THUMB_URL,
  source_url: SOURCE_URL,
  width: 800,
  height: 600,
};

async function coverFixture() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Cover owner' });
    const strangerId = await ctx.db.insert('users', { name: 'Cover stranger' });
    return { ownerId, strangerId };
  });
  const owner = t.withIdentity({ subject: ids.ownerId });
  const stranger = t.withIdentity({ subject: ids.strangerId });
  const ruleset = await owner.mutation(api.rulesets.create, {
    name: 'CoverRuleset',
    about: ABOUT,
    image_cover: null,
  });
  return { t, owner, stranger, ruleset };
}

function stubIngestEnvironment() {
  vi.stubEnv('USER_IMAGE_INGEST_BASE_URL', 'https://worker.test');
  vi.stubEnv('USER_IMAGE_INGEST_SECRET', 'test-ingest-secret');
}

function ingestSuccess() {
  return vi.fn(
    async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          url: DELIVERY_URL,
          key: `${'a'.repeat(64)}.jpg`,
          thumb_url: DELIVERY_THUMB_URL,
          thumb_key: `${'b'.repeat(64)}.jpg`,
          width: 800,
          height: 600,
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('ruleset cover rehosting', () => {
  test('rehost stores the cover and dual-writes the legacy channel', async () => {
    const { t, owner, ruleset } = await coverFixture();
    stubIngestEnvironment();
    const fetchMock = ingestSuccess();
    vi.stubGlobal('fetch', fetchMock);

    await owner.action(api.rulesetCovers.rehost, { id: ruleset._id, source_url: SOURCE_URL });

    const [request, init] = fetchMock.mock.calls[0] ?? [];
    expect(request).toBe('https://worker.test/__user-images/ingest');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-ingest-secret');

    const row = await t.run(async (ctx) => await ctx.db.get(ruleset._id));
    expect(row?.cover).toEqual(STORED_COVER);
    expect(row?.image_cover).toBe(DELIVERY_URL);
  });

  test('rehost refuses a non-https source before any fetch', async () => {
    const { owner, ruleset } = await coverFixture();
    stubIngestEnvironment();
    const fetchMock = ingestSuccess();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      owner.action(api.rulesetCovers.rehost, { id: ruleset._id, source_url: 'http://images.example/cover.png' })
    ).rejects.toThrow('https');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('rehost refuses a viewer without edit before any fetch', async () => {
    const { stranger, ruleset } = await coverFixture();
    stubIngestEnvironment();
    const fetchMock = ingestSuccess();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      stranger.action(api.rulesetCovers.rehost, { id: ruleset._id, source_url: SOURCE_URL })
    ).rejects.toThrow('Not authorized');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('the author sees the ingest refusal as the error message', async () => {
    const { owner, ruleset } = await coverFixture();
    stubIngestEnvironment();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'The URL did not return an image' }), {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    );

    await expect(owner.action(api.rulesetCovers.rehost, { id: ruleset._id, source_url: SOURCE_URL })).rejects.toThrow(
      'The URL did not return an image'
    );
  });

  test('a legacy update clears the stored cover and clearing wipes both channels', async () => {
    const { t, owner, ruleset } = await coverFixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(ruleset._id, { cover: STORED_COVER, image_cover: DELIVERY_URL });
    });

    await owner.mutation(api.rulesets.update, {
      id: ruleset._id,
      name: ruleset.name,
      about: ABOUT,
      image_cover: 'https://elsewhere.example/other.jpg',
    });
    const afterLegacyWrite = await t.run(async (ctx) => await ctx.db.get(ruleset._id));
    expect(afterLegacyWrite?.cover).toBeNull();
    expect(afterLegacyWrite?.image_cover).toBe('https://elsewhere.example/other.jpg');

    await owner.mutation(api.rulesets.update, {
      id: ruleset._id,
      name: ruleset.name,
      about: ABOUT,
      image_cover: null,
    });
    const afterClear = await t.run(async (ctx) => await ctx.db.get(ruleset._id));
    expect(afterClear?.cover).toBeNull();
    expect(afterClear?.image_cover).toBeNull();
  });

  test('a legacy echo of the delivery URL leaves the stored cover and its provenance alone', async () => {
    const { t, owner, ruleset } = await coverFixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(ruleset._id, { cover: STORED_COVER, image_cover: DELIVERY_URL });
    });

    await owner.mutation(api.rulesets.update, {
      id: ruleset._id,
      name: ruleset.name,
      about: ABOUT,
      image_cover: DELIVERY_URL,
    });

    const row = await t.run(async (ctx) => await ctx.db.get(ruleset._id));
    expect(row?.cover).toEqual(STORED_COVER);
    expect(row?.image_cover).toBe(DELIVERY_URL);
  });

  test('an update without the legacy argument leaves the stored cover alone', async () => {
    const { t, owner, ruleset } = await coverFixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(ruleset._id, { cover: STORED_COVER, image_cover: DELIVERY_URL });
    });

    await owner.mutation(api.rulesets.update, { id: ruleset._id, name: ruleset.name, about: ABOUT });

    const row = await t.run(async (ctx) => await ctx.db.get(ruleset._id));
    expect(row?.cover).toEqual(STORED_COVER);
    expect(row?.image_cover).toBe(DELIVERY_URL);
  });

  test('the backfill rehosts legacy rows and reports rows whose source fails', async () => {
    const { t, owner, ruleset } = await coverFixture();
    stubIngestEnvironment();
    await t.run(async (ctx) => {
      await ctx.db.patch(ruleset._id, { image_cover: SOURCE_URL });
    });
    const failing = await owner.mutation(api.rulesets.create, {
      name: 'FailingCoverRuleset',
      about: ABOUT,
      image_cover: null,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(failing._id, { image_cover: 'https://gone.example/dead.png' });
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { source_url: string };
        if (body.source_url === SOURCE_URL) {
          return new Response(
            JSON.stringify({
              url: DELIVERY_URL,
              key: `${'a'.repeat(64)}.jpg`,
              thumb_url: DELIVERY_THUMB_URL,
              thumb_key: `${'b'.repeat(64)}.jpg`,
              width: 800,
              height: 600,
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ error: 'The image host answered with status 404' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );

    const summary = await t.action(internal.rulesetCovers.backfillLegacyCovers, {});

    expect(summary.rehosted).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(summary.failed).toEqual([
      { slug: 'failingcoverruleset', message: 'The image host answered with status 404' },
    ]);
    expect(summary.truncated).toBe(false);
    const rehosted = await t.run(async (ctx) => await ctx.db.get(ruleset._id));
    expect(rehosted?.cover).toEqual(STORED_COVER);
    const untouched = await t.run(async (ctx) => await ctx.db.get(failing._id));
    expect(untouched?.cover).toBeNull();
    expect(untouched?.image_cover).toBe('https://gone.example/dead.png');
  });

  test('the backfill skips a row the author changed while it was fetching', async () => {
    const { t, ruleset } = await coverFixture();
    stubIngestEnvironment();
    await t.run(async (ctx) => {
      await ctx.db.patch(ruleset._id, { image_cover: SOURCE_URL });
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        /* The author edits while the backfill is fetching, so the scan's snapshot is stale by commit time. */
        await t.run(async (ctx) => {
          await ctx.db.patch(ruleset._id, { image_cover: 'https://elsewhere.example/new.png' });
        });
        return new Response(
          JSON.stringify({
            url: DELIVERY_URL,
            key: `${'a'.repeat(64)}.jpg`,
            thumb_url: DELIVERY_THUMB_URL,
            thumb_key: `${'b'.repeat(64)}.jpg`,
            width: 800,
            height: 600,
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );

    const summary = await t.action(internal.rulesetCovers.backfillLegacyCovers, {});

    expect(summary.rehosted).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toEqual([]);
    const row = await t.run(async (ctx) => await ctx.db.get(ruleset._id));
    expect(row?.cover).toBeNull();
    expect(row?.image_cover).toBe('https://elsewhere.example/new.png');
  });
});
