/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { expect, test } from 'vitest';

import { api } from './_generated/api';
import { applicationTriggers } from './lib/applicationTriggers';
import { rulesetTest } from './rulesets.test.fixture';

test('profile edits preserve a folded OAuth address and share collision allocation without changing validation', async () => {
  const t = rulesetTest();
  const userId = await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const id = await ctx.db.insert('users', { name: '𝓝𝓸𝓻𝓫𝓮𝓻𝓽' });
    const now = new Date().toISOString();
    await ctx.db.insert('profiles', {
      user_id: id,
      username: '𝓝𝓸𝓻𝓫𝓮𝓻𝓽',
      avatar_url: null,
      account_state: 'active',
      slug: 'norbert-900',
      created_at: now,
      updated_at: now,
    });
    const other = await ctx.db.insert('users', { name: 'Paulson' });
    await ctx.db.insert('profiles', {
      user_id: other,
      username: 'Paulson',
      avatar_url: null,
      account_state: 'active',
      slug: 'paulson',
      created_at: now,
      updated_at: now,
    });
    return id;
  });
  const owner = t.withIdentity({ subject: userId });
  const update = async (username: string) =>
    await owner.mutation(api.profiles.updateCurrent, {
      username,
      avatar_url: 'https://example.com/avatar.png',
    });
  expect((await update('Norbert')).profile.slug).toBe('norbert-900');
  expect((await update('Paulson')).profile.slug).toBe('paulson-1');
  expect((await update('Paulson')).profile.slug).toBe('paulson-1');
  await expect(update('王')).rejects.toThrow();
});
