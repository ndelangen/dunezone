import { useAuthActions } from '@convex-dev/auth/react';
import { signInReturnFrom } from '@shared/authDestination';
import { steamAssertionFrom } from '@shared/steamOpenId';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { PageState } from '@ui/block/PageState';
import { useEffect, useRef } from 'react';

import { refusedAsInactiveAccount, settleStartedSignIn } from '@db/accounts';
import { takeSteamSignIn } from '@db/steamSignIn';
import { pageHead } from '@app/routes/pageTitle';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import type { SignInFailure } from './signInFailure';

export const Route = createFileRoute('/_app/auth/steam')({
  head: () => ({
    meta: [...pageHead('Signing in with Steam', { noindex: true }).meta!, { name: 'referrer', content: 'no-referrer' }],
  }),
  component: SteamReturnPage,
});

/** A connect page explains its own unfinished sign-in, so it keeps the reader instead of sending them to sign in. */
const explainsItsOwnResult = (pathname: string) => /^\/profiles\/[^/]+\/connect$/.test(pathname);

/**
 * Where Steam sends the reader back.
 * The tab must be the one that left for Steam, and the backend asks Steam to confirm the answer before signing in;
 * either way the reader moves on to where they were going, or to the sign-in page with the reason.
 */
function SteamReturnPage() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  /* One return holds one Steam answer; Strict Mode's second effect must not spend it again. */
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) {
      return;
    }
    handled.current = true;
    /* The router's history holds the address Steam returned to, in the browser and in a story's memory history alike. */
    const { pathname, search: returnedSearch } = router.history.location;
    const search = new URLSearchParams(returnedSearch);
    const destination = takeSteamSignIn(search.get('state'));
    const assertion = steamAssertionFrom(search);
    /* Steam's answer is single-use, and the address bar should not keep it. */
    router.history.replace(pathname);
    const fail = (failed: SignInFailure) => {
      settleStartedSignIn(false);
      if (destination && explainsItsOwnResult(new URL(destination, window.location.origin).pathname)) {
        void router.navigate({ href: destination, replace: true });
        return;
      }
      void router.navigate({
        to: '/auth/login',
        search: { ...signInReturnFrom(destination ?? undefined), failed },
        replace: true,
      });
    };
    if (!destination || assertion['openid.mode'] !== 'id_res') {
      fail('unfinished');
      return;
    }
    signIn('steam', assertion).then(
      ({ signingIn }) => {
        if (!signingIn) {
          fail('failed');
          return;
        }
        settleStartedSignIn(!explainsItsOwnResult(new URL(destination, window.location.origin).pathname));
        void router.navigate({ href: destination, replace: true });
      },
      (error: unknown) => fail(refusedAsInactiveAccount(error) ? 'inactive' : 'failed')
    );
  }, [signIn, router]);
  return (
    <PageMessage title="Sign in" size="immersive">
      <PageState kind="pending" title="Signing you in with Steam">
        Steam sent you back. Checking your sign-in with Steam.
      </PageState>
    </PageMessage>
  );
}
