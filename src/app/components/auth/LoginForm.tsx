import { useAuthActions } from '@convex-dev/auth/react';
import { Stack } from '@mantine/core';
import { useState } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { SiDiscord } from 'react-icons/si';

import { GoogleColoredMark } from './GoogleColoredMark';
import styles from './LoginForm.module.css';

export function LoginForm(props: ComponentPropsWithoutRef<'div'>) {
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
    <div className={styles.root} {...props}>
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
                aria-label={
                  loadingProvider === 'discord'
                    ? 'Signing in with Discord…'
                    : 'Continue with Discord'
                }
                onClick={(e) => void handleSocialLogin(e, 'discord')}
              >
                <SiDiscord size={26} aria-hidden />
              </button>
              <button
                type="button"
                className={`${styles.providerButton} ${styles.google}`}
                disabled={loadingProvider !== null}
                aria-label={
                  loadingProvider === 'google' ? 'Signing in with Google…' : 'Continue with Google'
                }
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
