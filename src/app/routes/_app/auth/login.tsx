import { useAuthActions } from '@convex-dev/auth/react';
import { Stack } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { useState } from 'react';
import type { SVGProps } from 'react';
import { SiDiscord } from 'react-icons/si';

import { useCurrentProfile } from '@db/profiles';

import styles from './login.module.css';

export const Route = createFileRoute('/_app/auth/login')({
  component: LoginPage,
});

/** Google's mark has to keep its own four brand colours, so it cannot be a themed icon. */
function GoogleColoredMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable={false} {...props}>
      <title>Google</title>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function SignInPanel() {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const localAuthEnabled = import.meta.env.VITE_E2E_LOCAL_AUTH === 'true';

  const handleSocialLogin = async (e: React.SyntheticEvent, provider: 'discord' | 'google') => {
    e.preventDefault();
    setLoadingProvider(provider);
    setError(null);

    try {
      await signIn(provider, { redirectTo: '/' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoadingProvider(null);
    }
  };

  const handleLocalLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingProvider('password');
    setError(null);
    const nextEmail = email.trim().toLowerCase();
    const nextPassword = password;

    if (nextEmail.length === 0 || nextPassword.length === 0) {
      setError('Email and password are required.');
      setLoadingProvider(null);
      return;
    }

    try {
      await signIn('password', { flow: 'signIn', email: nextEmail, password: nextPassword });
      return;
    } catch {
      try {
        await signIn('password', { flow: 'signUp', email: nextEmail, password: nextPassword });
        return;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setLoadingProvider(null);
      }
    }
  };

  return (
    <div className={styles.root}>
      <Stack
        component="form"
        gap="sm"
        onSubmit={(e) => {
          if (localAuthEnabled) {
            void handleLocalLogin(e);
            return;
          }
          e.preventDefault();
        }}
      >
        <h2 className={styles.title}>Welcome</h2>
        <p className={styles.lede}>Sign in with your preferred account to continue.</p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        {localAuthEnabled ? (
          <div className={styles.localCredentials}>
            <input
              type="email"
              name="email"
              aria-label="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="e2e-user@example.com"
              autoComplete="username"
              className={styles.input}
              disabled={loadingProvider !== null}
            />
            <input
              type="password"
              name="password"
              aria-label="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="password"
              autoComplete="current-password"
              className={styles.input}
              disabled={loadingProvider !== null}
            />
            <button
              type="submit"
              className={styles.localSubmit}
              disabled={loadingProvider !== null}
              data-testid="local-auth-submit"
            >
              {loadingProvider === 'password' ? 'Signing in…' : 'Continue with local auth'}
            </button>
          </div>
        ) : (
          <>
            <div className={styles.providers}>
              <button
                type="button"
                className={`${styles.providerButton} ${styles.discord}`}
                disabled={loadingProvider !== null}
                aria-label={loadingProvider === 'discord' ? 'Signing in with Discord…' : 'Continue with Discord'}
                onClick={(e) => void handleSocialLogin(e, 'discord')}
              >
                <SiDiscord size={26} aria-hidden />
              </button>
              <button
                type="button"
                className={`${styles.providerButton} ${styles.google}`}
                disabled={loadingProvider !== null}
                aria-label={loadingProvider === 'google' ? 'Signing in with Google…' : 'Continue with Google'}
                onClick={(e) => void handleSocialLogin(e, 'google')}
              >
                <GoogleColoredMark width={26} height={26} />
              </button>
            </div>
            <p className={styles.hint}>Discord and Google are the supported sign-in options.</p>
          </>
        )}
      </Stack>
    </div>
  );
}

function LoginPage() {
  const profile = useCurrentProfile();

  return (
    <PageLayout>
      <PageLayout.Header>
        <h1>Sign in</h1>
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="lg">
          {profile.data ? (
            <Stack gap="sm">
              <h2>You're signed in</h2>
              <p>{profile.data.username ?? 'Player'}</p>
              <Link to="/">Go to home</Link>
            </Stack>
          ) : (
            <SignInPanel />
          )}
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}
