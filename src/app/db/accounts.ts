import { INACTIVE_ACCOUNT_SIGN_IN } from '@shared/authDestination';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useState, useSyncExternalStore } from 'react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { AuthProvider } from '../../../convex/lib/accountMethods';
import { useLiveQuery } from './core/live';

export const authProviderNames = { google: 'Google', discord: 'Discord' } satisfies Record<AuthProvider, string>;

export function useSignInProviders() {
  return useLiveQuery(api.accounts.providers, {});
}

export type { AuthProvider } from '../../../convex/lib/accountMethods';
/** The admin accounts page. Choosing a profile or another page changes the arguments, so the last answer stays on screen until the next one arrives rather than the form unmounting into a loading state. */
export function useAccountManagementPage(cursor: string | null, selectedUserIds: string[]) {
  const page = useQuery(api.accounts.adminPage, {
    paginationOpts: { cursor, numItems: 40 },
    selectedUserIds: selectedUserIds as Id<'users'>[],
  });
  const [shown, setShown] = useState(page);
  if (page !== undefined && page !== shown) {
    setShown(page);
  }
  return page ?? shown;
}
export function useMergeAccounts() {
  const mutate = useMutation(api.accounts.merge);
  return (sourceUserId: string, targetUserId: string) =>
    mutate({ sourceUserId: sourceUserId as Id<'users'>, targetUserId: targetUserId as Id<'users'> });
}
export function useResumeAccountMerge() {
  return useMutation(api.accounts.resumeMerge);
}
export function useBeginAuthConnection() {
  return useMutation(api.accounts.beginConnection);
}
export function useDisconnectAuthMethod() {
  return useMutation(api.accounts.disconnect);
}
export function useSignOutEverywhere() {
  return useMutation(api.accounts.signOutEverywhere);
}

const subscribeToNothing = () => () => {};

/*
 * The sign-in page remembers which provider this browser last finished signing in with, because choosing the other one quietly starts a second account.
 * The choice is noted when the reader leaves for the provider and kept only once the sign-in it started succeeds.
 * Signing out keeps it, since that is exactly when the reader next needs it.
 */
const STARTED_SIGN_IN_KEY = 'dunezone-sign-in-started';
const LAST_SIGN_IN_KEY = 'dunezone-last-sign-in';

function storedProvider(key: string): AuthProvider | null {
  try {
    const value = localStorage.getItem(key);
    return value !== null && Object.hasOwn(authProviderNames, value) ? (value as AuthProvider) : null;
  } catch {
    return null;
  }
}

/** Notes the provider a sign-in is leaving for; storage the browser refuses only loses the hint. */
export function noteSignInStarted(provider: AuthProvider) {
  try {
    localStorage.setItem(STARTED_SIGN_IN_KEY, provider);
  } catch {
    /* The hint is a convenience, and sign-in goes ahead without it. */
  }
}

/** Ends the noted sign-in, keeping its provider as the last one used only when it succeeded. */
export function settleStartedSignIn(succeeded: boolean) {
  const provider = storedProvider(STARTED_SIGN_IN_KEY);
  try {
    localStorage.removeItem(STARTED_SIGN_IN_KEY);
    if (succeeded && provider) {
      localStorage.setItem(LAST_SIGN_IN_KEY, provider);
    }
  } catch {
    /* Storage that cannot be written holds no hint to update. */
  }
}

const lastSignInMethod = () => storedProvider(LAST_SIGN_IN_KEY);

/** The provider this browser last signed in with, or `null` when it has none or the page renders on the server. */
export function useLastSignInMethod(): AuthProvider | null {
  return useSyncExternalStore(subscribeToNothing, lastSignInMethod, () => null);
}
/* The tab that starts a connection holds its token; an address never carries it, so a shared or leaked link cannot confirm someone else's connection. */
const HELD_CONNECTION_KEY = 'dunezone-account-connection';

/** Keeps the token `beginConnection` returned for this tab's sign-in round trip; throws when the browser refuses storage, since the connection could not finish. */
export function holdAuthConnection(token: string) {
  sessionStorage.setItem(HELD_CONNECTION_KEY, token);
}

function heldConnection(): string {
  try {
    return sessionStorage.getItem(HELD_CONNECTION_KEY) ?? '';
  } catch {
    return '';
  }
}


/** The connection this tab started, `''` when it started none, or `undefined` while the page renders on the server. */
export function useHeldAuthConnection(): string | undefined {
  return useSyncExternalStore(subscribeToNothing, heldConnection, () => undefined);
}

export function useAuthConnection(token: string) {
  return useQuery(api.accounts.connection, { token });
}
export function useConfirmAuthConnection() {
  return useMutation(api.accounts.confirmConnection);
}

/** Whether a sign-in was refused because its account is being deleted or merged. */
export function refusedAsInactiveAccount(error: unknown): boolean {
  return error instanceof ConvexError && error.data === INACTIVE_ACCOUNT_SIGN_IN;
}
