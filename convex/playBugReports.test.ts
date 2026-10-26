/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { signSeatPass } from '../src/shared/play/seatPass';
import { api } from './_generated/api';
import { playPerson, playRuleset, playTest } from './play.test.fixture';

async function world() {
  const t = playTest();
  const seeded = await t.run(async (ctx) => {
    const person = await playPerson(ctx, 'Reporter');
    const rulesetId = await playRuleset(ctx, person.userId);
    const secret = 'a'.repeat(64);
    const gameId = await ctx.db.insert('play_games', {
      name: 'Report test',
      slug: 'report-test',
      ruleset_id: rulesetId,
      state: 'ready',
      secret,
      attempt_id: 'test',
      provision_expires_at: Date.now() + 60_000,
      created_at: Date.now(),
    });
    return { person, secret, gameId };
  });
  const session = await t.run(async (ctx) => (await ctx.db.get(seeded.person.sessionId))!);
  const pass = await signSeatPass(seeded.secret, {
    v: 1,
    gameId: seeded.gameId,
    actorId: seeded.person.userId,
    principalId: seeded.person.userId,
    sessionId: seeded.person.sessionId,
    sessionCreatedAt: session._creationTime,
    issuedAt: Date.now(),
    exp: Date.now() + 60_000,
    displayName: 'Reporter',
    avatarUrl: null,
    profileSlug: null,
  });
  return { t, ...seeded, args: { gameId: seeded.gameId, secret: seeded.secret, pass } };
}

describe('report authorization', () => {
  test('only a signed game pass with a live real session grants access, and the read writes no report', async () => {
    const { t, args } = await world();
    const authorized = await t.query(api.playBugReports.authorize, args);
    expect(authorized?.authExpiresAt).toBeGreaterThan(Date.now());
    for (const invalid of [
      { ...args, secret: 'b'.repeat(64) },
      { ...args, pass: 'forged' },
      { ...args, gameId: 'unknown-game' },
    ]) {
      expect(await t.query(api.playBugReports.authorize, invalid)).toBeNull();
    }
    expect(await t.run(async (ctx) => await ctx.db.query('play_tickets').take(1))).toEqual([]);
  });

  test.each(['anonymous', 'deleted', 'signed-out', 'revoked', 'expired'] as const)(
    'refuses a session that is %s',
    async (kind) => {
      const { t, person, args } = await world();
      await t.run(async (ctx) => {
        if (kind === 'anonymous') {
          await ctx.db.patch(person.userId, { isAnonymous: true });
        }
        if (kind === 'deleted') {
          await ctx.db.patch(person.userId, { account_state: 'deleted' });
        }
        if (kind === 'signed-out') {
          await ctx.db.delete(person.sessionId);
        }
        if (kind === 'revoked') {
          await ctx.db.patch(person.userId, { auth_sessions_revoked_through: Date.now() + 1 });
        }
        if (kind === 'expired') {
          await ctx.db.patch(person.sessionId, { expirationTime: Date.now() - 1 });
        }
      });
      const result = await t.query(api.playBugReports.authorize, args);
      expect(result === null || result.authExpiresAt <= Date.now()).toBe(true);
    }
  );
});
