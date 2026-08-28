import { v } from 'convex/values';

import {
  userImageAvatarIngestCallbackSchema,
  userImageIngestCallbackSchema,
  userImageIngestTokenSchema,
} from '../src/shared/user-images/contract';
import { internal } from './_generated/api';
import { query } from './_generated/server';
import { internalMutation, mutation } from './functions';
import {
  INGEST_TOKEN_TTL_MS,
  ingestTokenCapabilityKindValidator,
  ingestTokenCapabilityValidator,
} from './lib/ingestTokens';
import { patchStoredAvatar } from './lib/profileAvatar';
import { patchStoredCover } from './lib/rulesetCover';
import type { QueryCtx } from './types';

/**
 * The user-image ingest token ledger.
 *
 * The Worker does expensive work on command (fetch, encode, store), so commanding it is the guarded privilege.
 * Instead of a shared secret, each cover or avatar save mints a single-use token here;
 * the Worker holds nothing and asks this ledger two questions over Convex's built-in HTTP API.
 * `check` is the cheap pre-flight that unlocks the expensive work, and `consume` is the one write path for the result, burning the token in the same transaction.
 * Both are public and assume hostile callers: possession of an unguessable token id is the entire credential, and a stranger's knock costs one indexed point read answering no.
 */

/** Mints 256 bits from the runtime's crypto source, the only acceptable randomness for a bearer credential. */
function generateTokenId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function tokenRow(ctx: QueryCtx, tokenId: string) {
  return await ctx.db
    .query('user_image_ingest_tokens')
    .withIndex('by_token_id', (q) => q.eq('token_id', tokenId))
    .unique();
}

/**
 * Mints one ingest token for the capability the caller already authorized.
 * The row and its own deletion are created atomically: scheduling from a mutation is exactly-once and commits with the insert, so no cron has to sweep this table.
 * Internal on purpose;
 * the public surface of the ledger is only `check` and `consume`.
 */
export const mint = internalMutation({
  args: { capability: ingestTokenCapabilityValidator, source_url: v.string() },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    const token = generateTokenId();
    const expires = Date.now() + INGEST_TOKEN_TTL_MS;
    await ctx.db.insert('user_image_ingest_tokens', {
      token_id: token,
      capability: args.capability,
      source_url: args.source_url,
      expires,
      consumed: false,
    });
    await ctx.scheduler.runAt(expires, internal.ingestTokens.expire, { token_id: token });
    return { token };
  },
});

/**
 * The mint-scheduled cleanup for one token.
 * Deletes only an unconsumed row: a consumed row is the tombstone that records the ingest's R2 keys for GC, so it stays.
 */
export const expire = internalMutation({
  args: { token_id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await tokenRow(ctx, args.token_id);
    if (row && !row.consumed) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});

/**
 * The public pre-flight: is this token live, and what recipe was it minted for?
 * Never consumes, and a dead token reveals nothing but the boolean, so replaying it is free and useless.
 * `kind` rides along on a live answer so the Worker's rendition recipe comes from the ledger rather than the request body;
 * it names a recipe, not an entity, so a stranger presenting a stolen live token learns nothing they could aim.
 * `expires` is authoritative regardless of whether the scheduled deletion has run yet.
 * `now` comes from the caller because queries must not read the wall clock;
 * a hostile caller lying about the time only lies to itself, since this answer gates nothing.
 * The `consume` mutation re-checks expiry against the server clock and is the only gate that counts.
 */
export const check = query({
  args: { token: v.string(), now: v.number() },
  returns: v.object({ valid: v.boolean(), kind: v.optional(ingestTokenCapabilityKindValidator) }),
  handler: async (ctx, args) => {
    if (!userImageIngestTokenSchema.safeParse(args.token).success || !Number.isFinite(args.now)) {
      return { valid: false };
    }
    const row = await tokenRow(ctx, args.token);
    if (!row || row.consumed || args.now > row.expires) {
      return { valid: false };
    }
    return { valid: true, kind: row.capability.kind };
  },
});

const consumeRefusalReasons = v.union(
  v.literal('invalid_payload'),
  v.literal('unknown_token'),
  v.literal('expired'),
  v.literal('consumed'),
  v.literal('entity_gone'),
  v.literal('superseded')
);

/**
 * The one write path for an ingest result: validate against the capability's own floor, write where the capability points, record the R2 keys and burn the token, all in one transaction.
 * The token row is read before the payload parse because the row's capability decides which floor applies;
 * a refused payload still does not burn the token.
 * Convex mutations are serializable, so two racing consume calls cannot both pass the `consumed` read;
 * the loser is retried, sees the tombstone and bounces.
 * That serializability is the whole double-consume defense, deliberately with no locks beside it.
 * A refusal is a structured return rather than a throw so the Worker can relay an honest reason without parsing error strings.
 */
export const consume = mutation({
  args: {
    token: v.string(),
    result: v.object({
      url: v.string(),
      /** Present on a cover callback, absent on an avatar one; each arm's Zod floor holds the distinction strictly. */
      thumb_url: v.optional(v.string()),
      width: v.number(),
      height: v.number(),
    }),
    r2_keys: v.array(v.string()),
  },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), reason: consumeRefusalReasons })
  ),
  handler: async (ctx, args) => {
    if (!userImageIngestTokenSchema.safeParse(args.token).success) {
      return { ok: false as const, reason: 'unknown_token' as const };
    }
    const row = await tokenRow(ctx, args.token);
    if (!row) {
      return { ok: false as const, reason: 'unknown_token' as const };
    }
    if (row.consumed) {
      return { ok: false as const, reason: 'consumed' as const };
    }
    if (Date.now() > row.expires) {
      return { ok: false as const, reason: 'expired' as const };
    }
    switch (row.capability.kind) {
      case 'ruleset_cover': {
        const payload = userImageIngestCallbackSchema.safeParse({ ...args.result, r2_keys: args.r2_keys });
        if (!payload.success) {
          return { ok: false as const, reason: 'invalid_payload' as const };
        }
        /* The tombstone lands even when the target row is gone, so the bucket objects this ingest produced stay on the GC record either way. */
        await ctx.db.patch(row._id, { consumed: true, r2_keys: payload.data.r2_keys });
        const target = await ctx.db.get(row.capability.ruleset_id);
        if (!target) {
          return { ok: false as const, reason: 'entity_gone' as const };
        }
        /*
         * The expected-echo recheck, enforced only for a mint that carried an expectation.
         * The operator backfill pins the legacy string its scan saw, so a result landing after an author rehosted bounces here rather than overwriting the newer cover.
         * An author's own save pins nothing, because the rehost runs before the update and the document has never held the pasted URL; the avatar arm compares against `source_url` instead, which its mutation writes first.
         * The tombstone above still records the keys this ingest produced for the GC pass.
         */
        if (row.capability.expected_echo !== undefined && target.image_cover !== row.capability.expected_echo) {
          return { ok: false as const, reason: 'superseded' as const };
        }
        await patchStoredCover(ctx, row.capability.ruleset_id, {
          url: payload.data.url,
          thumb_url: payload.data.thumb_url,
          source_url: row.source_url,
          width: payload.data.width,
          height: payload.data.height,
        });
        return { ok: true as const };
      }
      case 'profile_avatar': {
        const payload = userImageAvatarIngestCallbackSchema.safeParse({ ...args.result, r2_keys: args.r2_keys });
        if (!payload.success) {
          return { ok: false as const, reason: 'invalid_payload' as const };
        }
        await ctx.db.patch(row._id, { consumed: true, r2_keys: payload.data.r2_keys });
        const target = await ctx.db.get(row.capability.profile_id);
        if (!target) {
          return { ok: false as const, reason: 'entity_gone' as const };
        }
        /*
         * The expected-echo recheck: the avatar path is async, so by the time this callback lands the profile may carry a newer external URL, or a newer rehost's delivery URL.
         * The mint pinned the source, so a mismatch means this result is stale and the newer write wins.
         * The tombstone above still records the keys this ingest produced for the GC pass.
         */
        if (target.avatar_url !== row.source_url) {
          return { ok: false as const, reason: 'superseded' as const };
        }
        await patchStoredAvatar(ctx, row.capability.profile_id, {
          url: payload.data.url,
          source_url: row.source_url,
          width: payload.data.width,
          height: payload.data.height,
        });
        return { ok: true as const };
      }
    }
  },
});
