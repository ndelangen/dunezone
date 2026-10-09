/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { expect, test } from 'vitest';

import { api } from './_generated/api';
import { rulesetOwner } from './rulesets.test.fixture';

test('Group collisions retain deleted and legacy addresses while genuine renames allocate a new address', async () => {
  const { t, owner } = await rulesetOwner();
  expect((await owner.mutation(api.groups.create, { name: 'Create' })).slug).toBe('create-1');
  const first = await owner.mutation(api.groups.create, { name: 'DesertFriends' });
  await owner.mutation(api.groups.softDelete, { id: first._id });
  const copy = await owner.mutation(api.groups.create, { name: 'desertFriends' });
  expect(copy.slug).toBe('desertfriends-1');
  await t.run(async (ctx) => await ctx.db.patch(copy._id, { slug: 'desertfriends-999' }));
  expect((await owner.mutation(api.groups.update, { id: copy._id, name: 'DesertFRiends' })).slug).toBe(
    'desertfriends-999'
  );
  expect((await owner.mutation(api.groups.update, { id: copy._id, name: 'SietchFriends' })).slug).toBe('sietchfriends');
  await expect(owner.mutation(api.groups.create, { name: 'DesertFriends' })).rejects.toThrow(
    'Group name already exists'
  );
});
