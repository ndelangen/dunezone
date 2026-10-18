import { useAuthActions } from '@convex-dev/auth/react';
import { signInReturnFrom } from '@shared/authDestination';
import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

import { refusedAsInactiveAccount, settleStartedSignIn } from '@db/accounts';
import { storedOAuthVerifierKey } from '@db/playTables';
import type { SignInFailure } from '@app/routes/_app/auth/signInFailure';

/* One page load holds at most one sign-in result; Strict Mode's second effect must not spend the code again. */
let handled = false;

function takePendingSignIn(): boolean {
  try {
    const pending = localStorage.getItem(storedOAuthVerifierKey()) !== null;
    localStorage.removeItem(storedOAuthVerifierKey());
    return pending;
  } catch {
    return false;
  }
}

function failureOf(error: unknown): SignInFailure {
  return refusedAsInactiveAccount(error) ? 'inactive' : 'failed';
}

/** A connect page explains its own unfinished sign-in, so it keeps the reader instead of sending them to sign in. */
const explainsItsOwnResult = (pathname: string) => /^\/profiles\/[^/]+\/connect$/.test(pathname);

/**
 * Finishes a Google or Discord sign-in when the provider sends the reader back, in place of Convex Auth's own handler, which leaves a refused sign-in loading forever and says nothing when the reader cancelled at the provider.
 * Either way the reader lands on the sign-in page with the reason, and signing in from there returns to the page they were on.
 */
export function SignInCallback() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  useEffect(() => {
    if (handled) {
      return;
    }
    handled = true;
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    /* With a code, Convex Auth still needs the verifier to finish; without one, a verifier is a sign-in that never came back. */
    if (!code && !takePendingSignIn()) {
      return;
    }
    url.searchParams.delete('code');
    const page = url.pathname + url.search + url.hash;
    const fail = (failed: SignInFailure) => {
      settleStartedSignIn(false);
      if (!explainsItsOwnResult(url.pathname)) {
        void router.navigate({ to: '/auth/login', search: { ...signInReturnFrom(page), failed }, replace: true });
      }
    };
    if (!code) {
      fail('unfinished');
      return;
    }
    router.history.replace(page);
    /* Convex Auth's own handler finishes the round trip the same way: no provider, just the code the provider sent back. */
    (signIn as unknown as (provider: undefined, params: { code: string }) => ReturnType<typeof signIn>)(undefined, {
      code,
    }).then(
      ({ signingIn }) => (signingIn ? settleStartedSignIn(!explainsItsOwnResult(url.pathname)) : fail('failed')),
      (error: unknown) => fail(failureOf(error))
    );
  }, [signIn, router]);
  return null;
}
