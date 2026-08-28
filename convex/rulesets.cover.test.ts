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

/**
 * Plays the Worker's side of the token flow: reads the token out of the ingest request, stores the result through the public consuming mutation, and answers with the completion signal only.
 * The response body deliberately carries no image data, because the callback is the write path under test.
 */
function ingestWorkerSimulation(t: ReturnType<typeof convexTest>) {
  return vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { source_url: string; token: string };
    const answer = await t.mutation(api.ingestTokens.consume, {
      token: body.token,
      result: { url: DELIVERY_URL, thumb_url: DELIVERY_THUMB_URL, width: 800, height: 600 },
      r2_keys: [`${'a'.repeat(64)}.jpg`, `${'b'.repeat(64)}.jpg`],
    });
    /* The real Worker relays a bounced consume as a 409 rather than answering success; a simulation that swallowed it would let a refused write pass for a stored one. */
    if (!answer.ok) {
      return new Response(JSON.stringify({ error: `Consume refused: ${answer.reason}` }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('ruleset cover rehosting', () => {
  test('rehost mints a token, carries no secret, and the cover arrives through the consuming callback', async () => {
    const { t, owner, ruleset } = await coverFixture();
    stubIngestEnvironment();
    const fetchMock = ingestWorkerSimulation(t);
    vi.stubGlobal('fetch', fetchMock);

    await owner.action(api.rulesetCovers.rehost, { id: ruleset._id, source_url: SOURCE_URL });

    const [request, init] = fetchMock.mock.calls[0] ?? [];
    expect(request).toBe('https://worker.test/__user-images/ingest');
    expect(new Headers(init?.headers).get('Authorization')).toBeNull();
    const sent = JSON.parse(String(init?.body)) as { source_url: string; token: string };
    expect(sent.source_url).toBe(SOURCE_URL);
    expect(sent.token).toMatch(/^[0-9a-f]{64}$/);

    const row = await t.run(async (ctx) => await ctx.db.get(ruleset._id));
    expect(row?.cover).toEqual(STORED_COVER);
    expect(row?.image_cover).toBe(DELIVERY_URL);
    const tombstone = await t.run(
      async (ctx) =>
        await ctx.db
          .query('user_image_ingest_tokens')
          .withIndex('by_token_id', (q) => q.eq('token_id', sent.token))
          .unique()
    );
    expect(tombstone?.consumed).toBe(true);
  });

  /*
   * The other half of the expected-echo guard, and the reason it is optional rather than always on.
   * An author's rehost mints against a URL the document does not carry: the row still holds the previous cover, and the update that would record the new source runs after this action returns.
   * A guard that compared the stored echo to the mint's source unconditionally would refuse every save of this shape, which is exactly what the backfill's guard must not do.
   */
  test('an author rehost over an existing cover is not read as a stale backfill', async () => {
    const { t, owner, ruleset } = await coverFixture();
    stubIngestEnvironment();
    await t.run(async (ctx) => {
      await ctx.db.patch(ruleset._id, { image_cover: `https://dune.zone/user-images/${'c'.repeat(64)}.jpg` });
    });
    vi.stubGlobal('fetch', ingestWorkerSimulation(t));

    await owner.action(api.rulesetCovers.rehost, { id: ruleset._id, source_url: SOURCE_URL });

    const row = await t.run(async (ctx) => await ctx.db.get(ruleset._id));
    expect(row?.cover).toEqual(STORED_COVER);
    expect(row?.image_cover).toBe(DELIVERY_URL);
  });

  test('the ingest response body alone writes nothing', async () => {
    const { t, owner, ruleset } = await coverFixture();
    stubIngestEnvironment();
    /* A Worker answering the retired result shape without consuming proves the response stopped being a write path. */
    vi.stubGlobal('fetch', ingestSuccess());

    await expect(owner.action(api.rulesetCovers.rehost, { id: ruleset._id, source_url: SOURCE_URL })).rejects.toThrow(
      'unexpected shape'
    );

    const row = await t.run(async (ctx) => await ctx.db.get(ruleset._id));
    expect(row?.cover).toBeNull();
    expect(row?.image_cover).toBeNull();
  });

  test('rehost refuses a cleartext ingest endpoint outside local development', async () => {
    const { owner, ruleset } = await coverFixture();
    vi.stubEnv('USER_IMAGE_INGEST_BASE_URL', 'http://ingest.example');
    const fetchMock = ingestSuccess();
    vi.stubGlobal('fetch', fetchMock);

    await expect(owner.action(api.rulesetCovers.rehost, { id: ruleset._id, source_url: SOURCE_URL })).rejects.toThrow(
      'https'
    );
    expect(fetchMock).not.toHaveBeenCalled();
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

  test('rehost refuses a viewer without edit before any fetch or mint', async () => {
    const { t, stranger, ruleset } = await coverFixture();
    stubIngestEnvironment();
    const fetchMock = ingestSuccess();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      stranger.action(api.rulesetCovers.rehost, { id: ruleset._id, source_url: SOURCE_URL })
    ).rejects.toThrow('Not authorized');
    expect(fetchMock).not.toHaveBeenCalled();
    const tokens = await t.run(async (ctx) => await ctx.db.query('user_image_ingest_tokens').collect());
    expect(tokens).toEqual([]);
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

  /*
   * The scan used to read a fixed head window, so converted rows kept their slots and anything behind
   * them was unreachable no matter how often the backfill was rerun.
   * This asserts the property that fixes it: a page hands back a cursor, and the next page is the rows
   * behind the first rather than the same ones again.
   */
  test('the legacy scan walks past its first page instead of re-reading the head', async () => {
    const { t, owner, ruleset } = await coverFixture();
    const second = await owner.mutation(api.rulesets.create, { name: 'SecondCover', about: ABOUT, image_cover: null });
    const third = await owner.mutation(api.rulesets.create, { name: 'ThirdCover', about: ABOUT, image_cover: null });
    await t.run(async (ctx) => {
      for (const id of [ruleset._id, second._id, third._id]) {
        await ctx.db.patch(id, { image_cover: SOURCE_URL });
      }
    });

    const firstPage = await t.query(internal.rulesetCovers.listLegacyCovers, {
      paginationOpts: { cursor: null, numItems: 2 },
    });
    expect(firstPage.cursor).not.toBeNull();

    const secondPage = await t.query(internal.rulesetCovers.listLegacyCovers, {
      paginationOpts: { cursor: firstPage.cursor, numItems: 2 },
    });
    expect(secondPage.cursor).toBeNull();

    const firstIds = firstPage.rows.map((row) => row.id);
    const secondIds = secondPage.rows.map((row) => row.id);
    /* No overlap is the whole point: a head window would return the same rows twice. */
    expect(firstIds.some((id) => secondIds.includes(id))).toBe(false);
    expect([...firstIds, ...secondIds].sort()).toEqual([ruleset._id, second._id, third._id].sort());
  });

  /*
   * The Convex side bounds its own wait, so a Worker that has stopped answering cannot hold an author's
   * save open to the platform ceiling.
   * This asserts the wiring rather than the elapsed time: the deadline is real but waiting it out in a
   * unit test would cost the deadline itself.
   */
  test('the ingest call carries its own deadline', async () => {
    const { t, owner, ruleset } = await coverFixture();
    stubIngestEnvironment();
    const fetchMock = ingestWorkerSimulation(t);
    vi.stubGlobal('fetch', fetchMock);

    await owner.action(api.rulesetCovers.rehost, { id: ruleset._id, source_url: SOURCE_URL });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal?.aborted).toBe(false);
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
        const body = JSON.parse(String(init?.body)) as { source_url: string; token: string };
        if (body.source_url === SOURCE_URL) {
          await t.mutation(api.ingestTokens.consume, {
            token: body.token,
            result: { url: DELIVERY_URL, thumb_url: DELIVERY_THUMB_URL, width: 800, height: 600 },
            r2_keys: [`${'a'.repeat(64)}.jpg`, `${'b'.repeat(64)}.jpg`],
          });
          return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
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
    /* Null rather than false: the scan walked to the end of the table, so there is nothing to resume from. */
    expect(summary.next_cursor).toBeNull();
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
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { token: string };
        /* The author edits while the backfill is fetching, so the scan's snapshot is stale by the time the callback lands. */
        await t.run(async (ctx) => {
          await ctx.db.patch(ruleset._id, { image_cover: 'https://elsewhere.example/new.png' });
        });
        const answer = await t.mutation(api.ingestTokens.consume, {
          token: body.token,
          result: { url: DELIVERY_URL, thumb_url: DELIVERY_THUMB_URL, width: 800, height: 600 },
          r2_keys: [`${'a'.repeat(64)}.jpg`, `${'b'.repeat(64)}.jpg`],
        });
        /* The Worker relays a bounced consume as a 409, which is what turns this into a skip rather than a failure. */
        expect(answer).toEqual({ ok: false, reason: 'superseded' });
        return new Response(JSON.stringify({ error: 'The image was replaced while it was being stored' }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        });
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
