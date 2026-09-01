// @vitest-environment edge-runtime

import { ConvexError } from 'convex/values';
import { describe, expect, test } from 'vitest';

import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import { rulebookEditionArtifactPath } from '../src/shared/rulebooks/editionArtifacts';
import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

async function readerFixture() {
  const fixture = await rulebookFixture();
  const created = await fixture.owner.mutation(api.rulebooks.create, {
    ruleset_id: fixture.ids.rulesetId,
    name: 'Reader manual',
    source: { kind: 'starter' },
  });
  return {
    ...fixture,
    created,
    locator: {
      ruleset_slug: 'rulebook-test-rules',
      rulebook_slug: created.rulebook.slug,
    },
  };
}

describe('Rulebook current-Edition reader', () => {
  test('allows public reading without exposing or depending on a draft', async () => {
    const { t, owner, outsider, created, locator } = await readerFixture();
    const contents = structuredClone(created.draft.contents) as RulebookContentsV1;
    contents.pagesById.RULE!.title = 'Unpublished draft title';
    await owner.mutation(api.rulebooks.save, {
      rulebook_id: created.rulebook._id,
      expected_revision: 1,
      contents,
    });

    for (const reader of [t, owner, outsider]) {
      const page = await reader.query(api.rulebooks.readerPage, locator);
      expect(page?.edition.contents).toEqual(created.edition.contents);
      expect(page).not.toHaveProperty('draft');
    }
    await t.run((ctx) => ctx.db.delete('rulebook_drafts', created.draft._id));
    expect((await t.query(api.rulebooks.readerPage, locator))?.edition.contents).toEqual(created.edition.contents);
  });

  test('reads current and selected historical Editions without falling back to another Edition or draft', async () => {
    const { t, created, locator } = await readerFixture();
    const contents = structuredClone(created.edition.contents) as RulebookContentsV1;
    contents.pagesById.RULE!.title = 'Second Edition movement';
    const editionId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('rulebook_editions', {
        rulebook_id: created.rulebook._id,
        edition_number: 2,
        created_at: '2026-08-31T00:00:00.000Z',
        created_by: created.edition.created_by,
      });
      await ctx.db.insert('rulebook_edition_contents', { edition_id: id, contents });
      await ctx.db.patch('rulebooks', created.rulebook._id, {
        current_edition_number: 2,
      });
      return id;
    });
    expect(await t.query(api.rulebooks.readerPage, locator)).toMatchObject({
      edition: { edition_number: 2, contents },
      editions: [{ edition_number: 2, created_at: '2026-08-31T00:00:00.000Z' }, { edition_number: 1 }],
    });
    expect(
      await t.query(api.rulebooks.readerPage, {
        ...locator,
        edition_number: 1,
      })
    ).toMatchObject({
      edition: { edition_number: 1, contents: created.edition.contents },
    });
    const refusal = t.query(api.rulebooks.readerPage, {
      ...locator,
      edition_number: 99,
    });
    await expect(refusal).rejects.toThrow('Rulebook Edition 99 does not exist');
    /* The kind matters as much as the words: a plain Error is redacted to "Server Error" outside dev, and the reader renders `error.message` verbatim. */
    await expect(refusal).rejects.toThrow(ConvexError);
    await t.run((ctx) => ctx.db.delete('rulebook_editions', editionId));
    await expect(t.query(api.rulebooks.readerPage, locator)).rejects.toThrow('Rulebook edition not found');
  });

  test('returns the complete metadata history while reading only the selected Edition Contents', async () => {
    const { t, created, locator } = await readerFixture();
    const total = 30;
    await t.run(async (ctx) => {
      for (let number = 2; number <= total; number += 1) {
        const editionId = await ctx.db.insert('rulebook_editions', {
          rulebook_id: created.rulebook._id,
          edition_number: number,
          created_at: `2026-08-${String(number).padStart(2, '0')}T00:00:00.000Z`,
          created_by: created.edition.created_by,
        });
        /*
         * Intermediate metadata rows deliberately have no Contents row.
         * If history joined their Contents, this query could not return the complete selector.
         */
        if (number === total) {
          await ctx.db.insert('rulebook_edition_contents', {
            edition_id: editionId,
            contents: created.edition.contents,
          });
        }
      }
      await ctx.db.patch('rulebooks', created.rulebook._id, {
        current_edition_number: total,
      });
    });

    const current = await t.query(api.rulebooks.readerPage, locator);
    expect(current?.edition.edition_number).toBe(total);
    expect(current?.editions).toHaveLength(total);
    expect(current?.editions.at(0)?.edition_number).toBe(total);
    expect(current?.editions.at(-1)?.edition_number).toBe(1);

    const oldest = await t.query(api.rulebooks.readerPage, { ...locator, edition_number: 1 });
    expect(oldest?.edition.edition_number).toBe(1);
    expect(oldest?.edition.contents).toEqual(created.edition.contents);
    expect(oldest?.editions.at(-1)?.edition_number).toBe(1);
    expect(oldest?.editions).toHaveLength(total);
  });

  test('exposes a permanent artifact link only after that artifact is ready', async () => {
    const { t, created, locator } = await readerFixture();
    const htmlPath = rulebookEditionArtifactPath(created.rulebook._id, 1, 'html');
    expect(await t.query(api.rulebooks.readerPage, locator)).toMatchObject({
      edition: {
        html: { status: 'preparing', href: null },
        pdf: { status: 'preparing', href: null },
      },
    });
    await t.run(async (ctx) => {
      const html = await ctx.db
        .query('rulebook_edition_artifacts')
        .withIndex('by_edition_and_kind', (query) => query.eq('edition_id', created.edition._id).eq('kind', 'html'))
        .unique();
      if (!html) {
        throw new Error('Reader fixture is missing the HTML artifact');
      }
      await ctx.db.patch('rulebook_edition_artifacts', html._id, { status: 'ready' });
    });
    expect(await t.query(api.rulebooks.readerPage, locator)).toMatchObject({
      edition: {
        html: { status: 'ready', href: htmlPath },
        pdf: { status: 'preparing', href: null },
      },
    });
  });

  test.each(['rulebook', 'ruleset'] as const)(
    'hides missing and deleted %s content from every reader',
    async (kind) => {
      const { t, owner, ids, created, locator } = await readerFixture();
      expect(
        await t.query(api.rulebooks.readerPage, {
          ...locator,
          rulebook_slug: 'missing',
        })
      ).toBeNull();
      expect(
        await t.query(api.rulebooks.readerPage, {
          ...locator,
          ruleset_slug: 'other-rulebook-test-rules',
        })
      ).toBeNull();
      await t.run(async (ctx) => {
        if (kind === 'rulebook') {
          await ctx.db.patch('rulebooks', created.rulebook._id, {
            is_deleted: true,
          });
        } else {
          await ctx.db.patch('rulesets', ids.rulesetId, { is_deleted: true });
        }
      });
      expect(await t.query(api.rulebooks.readerPage, locator)).toBeNull();
      expect(await owner.query(api.rulebooks.readerPage, locator)).toBeNull();
    }
  );

  test('resolves published images referenced by the Edition and omits deleted Assets', async () => {
    const { t, ids, created, locator } = await readerFixture();
    const assetId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('assets', {
        type: 'token-disc',
        slug: 'storm',
        owner_id: ids.ownerId,
        group_id: null,
        is_deleted: false,
        data: { name: 'Storm marker' },
        created_at: '2026-08-31',
        updated_at: '2026-08-31',
      });
      await ctx.db.insert('publication_assets', {
        asset_type: 'token-disc',
        asset_id: id,
        cache_token: 'ready',
        published_at: 1,
      });
      const contents = structuredClone(created.edition.contents) as RulebookContentsV1;
      for (const page of Object.values(contents.pagesById)) {
        for (const block of Object.values(page.blocksById)) {
          if (block.kind === 'asset-figure') {
            block.assetId = id;
          }
        }
      }
      const stored = await ctx.db
        .query('rulebook_edition_contents')
        .withIndex('by_edition_id', (query) => query.eq('edition_id', created.edition._id))
        .unique();
      if (!stored) {
        throw new Error('Reader fixture is missing Edition Contents');
      }
      await ctx.db.patch('rulebook_edition_contents', stored._id, { contents });
      return id;
    });
    expect(await t.query(api.rulebooks.readerPage, locator)).toMatchObject({
      assetsById: {
        [assetId]: {
          name: 'Storm marker',
          imageUrl: publishedHref('token-disc', assetId, 'ready'),
        },
      },
    });
    await t.run((ctx) => ctx.db.patch('assets', assetId, { is_deleted: true }));
    expect((await t.query(api.rulebooks.readerPage, locator))?.assetsById).toEqual({});
  });
});
