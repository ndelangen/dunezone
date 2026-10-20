/// <reference types="vite/client" />
/* @vitest-environment edge-runtime */
import { expect, test, vi } from 'vite-plus/test';

import { publicationFaceId } from '../src/shared/asset-publishing/publicationTargets';
import { publishingCustomCard } from '../src/shared/assets/fixtures/publishingCustomCard';
import { publishingSpiceCard } from '../src/shared/assets/fixtures/publishingSpiceCard';
import { publishingTokenFace } from '../src/shared/assets/fixtures/publishingTokenFace';
import { publishingTreacheryCard } from '../src/shared/assets/fixtures/publishingTreacheryCard';
import {
  CUSTOM_CARD_STYLED_TOKEN_REVISION,
  ROUND_TOKEN_SYMBOL_STYLE_REVISION,
  SPICE_DISCOVERY_REVISION,
  STORM_CARD_STYLED_TOKEN_REVISION,
  TREACHERY_TEXT_ONLY_REVISION,
} from '../src/shared/assets/schema';
import { standardStormCard } from '../src/shared/assets/standardStormDeck';
import { arrakisBoard } from '../src/shared/boards/geometry';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';

const styled = {
  ...publishingTokenFace,
  symbolShadow: false,
  symbolFill: '#07120f',
  symbolStroke: '#f3edbf',
  symbolStrokeWidth: 5.5,
};

async function setup(revisions: Record<string, number>) {
  const t = applicationTest();
  const ownerId = await t.run(async (ctx) => {
    await ctx.db.insert('admin_settings', {
      key: 'publication',
      publication_pickup_enabled: true,
      renderer_revisions: revisions,
      updated_at: 1,
    });
    return await ctx.db.insert('users', { name: 'Owner' });
  });
  return { t, owner: t.withIdentity({ subject: ownerId }) };
}

const jobs = (t: ReturnType<typeof applicationTest>, type: string, id: string) =>
  t.run((ctx) =>
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', type).eq('asset_id', id))
      .take(10)
  );

async function activate(t: ReturnType<typeof applicationTest>, revisions: Record<string, number>) {
  await t.run(async (ctx) => {
    const settings = await ctx.db
      .query('admin_settings')
      .withIndex('by_key', (q) => q.eq('key', 'publication'))
      .unique();
    await ctx.db.patch(settings!._id, { renderer_revisions: revisions });
  });
}

test('text-only Treachery supersedes an unsupported pending capture while ordinary cards still publish', async () => {
  const { t, owner } = await setup({ 'card-treachery': TREACHERY_TEXT_ONLY_REVISION - 1 });
  const card = await owner.mutation(api.assets.create, { type: 'card-treachery', data: publishingTreacheryCard });
  expect(await jobs(t, 'card-treachery', card.id)).toHaveLength(1);
  const textOnly = { ...publishingTreacheryCard, bodyLayout: 'text-only' };
  await owner.mutation(api.assets.update, { id: card.id, data: textOnly });
  expect(await jobs(t, 'card-treachery', card.id)).toHaveLength(0);
  const ordinary = await owner.mutation(api.assets.create, {
    type: 'card-treachery',
    data: { ...publishingTreacheryCard, name: 'Ordinary card' },
  });
  expect(await jobs(t, 'card-treachery', ordinary.id)).toHaveLength(1);
  await activate(t, { 'card-treachery': TREACHERY_TEXT_ONLY_REVISION });
  await owner.mutation(api.assets.update, { id: card.id, data: textOnly });
  expect((await jobs(t, 'card-treachery', card.id))[0].asset_data.card.bodyLayout).toBe('text-only');
});

test.each(['token-disc', 'token-tech', 'token-pointer', 'token-plate'])(
  '%s holds only its styled face until activation',
  async (type) => {
    const { t, owner } = await setup({ [type]: ROUND_TOKEN_SYMBOL_STYLE_REVISION - 1 });
    const data = {
      name: 'Two faces',
      about: '',
      front: publishingTokenFace,
      back: { mode: 'custom', face: publishingTokenFace },
    };
    const token = await owner.mutation(api.assets.create, { type, data });
    const backId = publicationFaceId(token.id, 'back');
    expect(await jobs(t, type, token.id)).toHaveLength(1);
    expect(await jobs(t, type, backId)).toHaveLength(1);
    const changed = { ...data, back: { mode: 'custom', face: styled } };
    await owner.mutation(api.assets.update, { id: token.id, data: changed });
    expect(await jobs(t, type, token.id)).toHaveLength(1);
    expect(await jobs(t, type, backId)).toHaveLength(0);
    await activate(t, { [type]: ROUND_TOKEN_SYMBOL_STYLE_REVISION });
    await owner.mutation(api.assets.update, { id: token.id, data: changed });
    expect((await jobs(t, type, backId))[0].asset_data.face.symbolShadow).toBe(false);
  }
);

test('resolved token styling gates Spice, Custom and Storm dependency refreshes until their supporting renderers activate', async () => {
  vi.useFakeTimers();
  try {
    const revisions = {
      'card-spice': SPICE_DISCOVERY_REVISION - 1,
      'card-custom': CUSTOM_CARD_STYLED_TOKEN_REVISION - 1,
      'card-storm': STORM_CARD_STYLED_TOKEN_REVISION - 1,
      'token-disc': ROUND_TOKEN_SYMBOL_STYLE_REVISION,
    };
    const { t, owner } = await setup(revisions);
    const tokenData = { name: 'Shared token', about: '', front: publishingTokenFace, back: { mode: 'same' } };
    const token = await owner.mutation(api.assets.create, { type: 'token-disc', data: tokenData });
    const board = await owner.mutation(api.assets.create, {
      type: 'board',
      data: { name: 'Arrakis', about: '', board: arrakisBoard() },
    });
    const layer = {
      kind: 'token',
      layerId: crypto.randomUUID(),
      asset_id: token.id,
      offset: [0, 0],
      scale: 1,
      opacity: 1,
      rotation: 0,
    };
    const cards = [
      { type: 'card-custom', data: { ...publishingCustomCard, layers: [layer] } },
      { type: 'card-storm', data: { ...standardStormCard(3), layers: [layer] } },
      {
        type: 'card-spice',
        data: {
          ...publishingSpiceCard,
          board: {
            asset_id: board.id,
            tints: [],
            tokens: [{ layerId: 'placed', asset_id: token.id, x: 100, y: 100, size: 30, rotation: 0 }],
          },
        },
      },
    ];
    const saved = [];
    for (const card of cards) {
      const result = await owner.mutation(api.assets.create, card);
      saved.push({ ...card, id: result.id });
      expect(await jobs(t, card.type, result.id)).toHaveLength(1);
    }
    await owner.mutation(api.assets.update, { id: token.id, data: { ...tokenData, front: styled } });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    for (const card of saved) {
      expect(await jobs(t, card.type, card.id)).toHaveLength(0);
    }
    await activate(t, {
      'card-spice': SPICE_DISCOVERY_REVISION,
      'card-custom': CUSTOM_CARD_STYLED_TOKEN_REVISION,
      'card-storm': STORM_CARD_STYLED_TOKEN_REVISION,
      'token-disc': ROUND_TOKEN_SYMBOL_STYLE_REVISION,
    });
    for (const card of saved) {
      await owner.mutation(api.assets.update, { id: card.id, data: card.data });
      expect((await jobs(t, card.type, card.id))[0].asset_data.tokens[token.id].face.symbolStrokeWidth).toBe(5.5);
    }
  } finally {
    vi.useRealTimers();
  }
}, 30_000);
