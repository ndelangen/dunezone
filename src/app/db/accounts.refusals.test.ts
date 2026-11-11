import { BANNED_ACCOUNT_SIGN_IN, INACTIVE_ACCOUNT_SIGN_IN, RECENT_SIGN_IN_REQUIRED } from '@shared/authDestination';
import { ConvexError } from 'convex/values';
import { expect, test } from 'vite-plus/test';

import { needsRecentSignIn, signInFailureReason } from './accounts';

test('a refusal for a stale sign-in is told apart by the words the backend sends as its data', () => {
  expect(needsRecentSignIn(new ConvexError(RECENT_SIGN_IN_REQUIRED))).toBe(true);
  expect(needsRecentSignIn(new ConvexError(INACTIVE_ACCOUNT_SIGN_IN))).toBe(false);
  /* The same words as a plain message are any other failure: only the backend's refusal carries them as data. */
  expect(needsRecentSignIn(new Error(RECENT_SIGN_IN_REQUIRED))).toBe(false);
  expect(needsRecentSignIn(RECENT_SIGN_IN_REQUIRED)).toBe(false);
  expect(needsRecentSignIn(undefined)).toBe(false);
});

test('reports bans and pending account changes from structured sign-in refusals', () => {
  expect(signInFailureReason(new ConvexError(BANNED_ACCOUNT_SIGN_IN))).toBe('banned');
  expect(signInFailureReason(new ConvexError(INACTIVE_ACCOUNT_SIGN_IN))).toBe('inactive');
  expect(signInFailureReason(new ConvexError(RECENT_SIGN_IN_REQUIRED))).toBe('failed');
  expect(signInFailureReason(new Error(INACTIVE_ACCOUNT_SIGN_IN))).toBe('failed');
});
