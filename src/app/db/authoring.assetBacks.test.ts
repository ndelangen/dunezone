// @vitest-environment edge-runtime
import { describe, expect, test, vi } from 'vite-plus/test';

import { api } from '../../../convex/_generated/api';
import { applicationTest } from '../../../convex/application.test.fixture';
import { publishingDeckCardback } from '../../shared/assets/fixtures/publishingDeckCardback';
import { publishingRectangleTokenFace } from '../../shared/assets/fixtures/publishingRectangleTokenFace';
import { publishingTokenFace } from '../../shared/assets/fixtures/publishingTokenFace';
import { prepareRawAsset } from './authoring';

describe('raw linked-back display reads', () => {
  test.each(['token-disc', 'token-enhance', 'deck'])(
    '%s retains the authenticated authored back without membership or writes',
    async (type) => {
      const t = applicationTest();
      const face = type === 'token-enhance' ? publishingRectangleTokenFace : publishingTokenFace;
      const data =
        type === 'deck'
          ? { name: 'Source', about: '', cardback: publishingDeckCardback }
          : { name: 'Source', about: '', front: face, back: { mode: 'custom', face } };
      const ids = await t.run(async (ctx) => {
        const ownerId = await ctx.db.insert('users', { name: 'Author' });
        const common = {
          owner_id: ownerId,
          type,
          group_id: null,
          is_deleted: false,
          created_at: '2026-10-20',
          updated_at: '2026-10-20',
        };
        const source = await ctx.db.insert('assets', { ...common, slug: 'source', data });
        const destination = await ctx.db.insert('assets', {
          ...common,
          slug: 'destination',
          data: { ...data, name: 'Destination' },
        });
        return { ownerId, source, destination };
      });
      const args = { type, targetId: ids.destination, referenceId: ids.source };
      await expect(t.query(api.assets.linkedBack, args)).rejects.toThrow();
      const viewer = t.withIdentity({ subject: ids.ownerId });
      const raw = { ...data, [type === 'deck' ? 'cardback' : 'back']: { mode: 'reference', asset_id: ids.source } };
      reads.query.mockImplementation((fn, args) => viewer.query(fn, args));
      await expect(
        prepareRawAsset({ type, targetId: ids.destination, text: JSON.stringify(raw) })
      ).resolves.toMatchObject({ data: raw });
      await expect(viewer.query(api.assets.linkedBack, args)).resolves.toEqual({
        id: ids.source,
        name: 'Source',
        data,
        previewHref: expect.stringContaining('/published/'),
      });
      await expect(viewer.query(api.assets.linkedBack, { ...args, targetId: ids.source })).rejects.toThrow(
        /itself|own cardback/
      );
      await t.run(async (ctx) => {
        expect((await ctx.db.get('assets', ids.destination))!.data).toEqual({ ...data, name: 'Destination' });
        expect(await ctx.db.query('asset_relations').collect()).toEqual([]);
        expect(await ctx.db.query('publication_jobs').collect()).toEqual([]);
        expect(await ctx.db.query('user_image_ingest_tokens').collect()).toEqual([]);
        await ctx.db.patch('assets', ids.source, {
          data: { ...data, [type === 'deck' ? 'cardback' : 'back']: { mode: 'reference', asset_id: ids.destination } },
        });
      });
      await expect(viewer.query(api.assets.linkedBack, args)).rejects.toThrow(/authored/);
      await t.run((ctx) => ctx.db.patch('assets', ids.source, { data, type: 'bundle' }));
      await expect(viewer.query(api.assets.linkedBack, args)).rejects.toThrow(/must also|must name/);
      await t.run((ctx) => ctx.db.patch('assets', ids.source, { type, is_deleted: true }));
      await expect(viewer.query(api.assets.linkedBack, args)).rejects.toThrow(/no longer exists/);
    }
  );
});

const reads = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@db/core', () => ({ db: reads }));
vi.mock('@db/profiles', () => ({ useSessionViewer: vi.fn() }));
