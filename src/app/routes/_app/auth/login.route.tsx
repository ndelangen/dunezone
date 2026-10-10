import { useAuthActions } from '@convex-dev/auth/react';
import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { useReducer } from 'react';
import type { SVGProps } from 'react';
import { SiDiscord, SiReddit } from 'react-icons/si';

import { authProviderNames, useSignInProviders } from '@db/accounts';
import type { AuthProvider } from '@db/accounts';
import { useCurrentProfile } from '@db/profiles';
import { pageHead } from '@app/routes/pageTitle';

export const Route = createFileRoute('/_app/auth/login')({
  head: () => pageHead('Sign in'),
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

type SignInState = { busy: AuthProvider | 'password' | null; error: string | null; email: string; password: string };
type SignInEvent =
  | { kind: 'started'; provider: AuthProvider | 'password' }
  | { kind: 'failed'; message: string }
  | { kind: 'settled' }
  | { kind: 'emailChanged'; value: string }
  | { kind: 'passwordChanged'; value: string };

function reduceSignIn(state: SignInState, event: SignInEvent): SignInState {
  switch (event.kind) {
    case 'started':
      return { ...state, busy: event.provider, error: null };
    case 'failed':
      return { ...state, error: event.message };
    case 'settled':
      return { ...state, busy: null };
    case 'emailChanged':
      return { ...state, email: event.value };
    case 'passwordChanged':
      return { ...state, password: event.value };
  }
}

function SignInPanel({ providers }: { providers: ReturnType<typeof useSignInProviders> }) {
  const { signIn } = useAuthActions();
  const [state, dispatch] = useReducer(reduceSignIn, { busy: null, error: null, email: '', password: '' });
  const localAuthEnabled = import.meta.env.VITE_E2E_LOCAL_AUTH === 'true';
  const socialLogin = async (provider: AuthProvider) => {
    dispatch({ kind: 'started', provider });
    try {
      await signIn(provider, { redirectTo: '/' });
    } catch (error) {
      dispatch({ kind: 'failed', message: error instanceof Error ? error.message : 'Sign-in could not start.' });
    } finally {
      dispatch({ kind: 'settled' });
    }
  };
  const localLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    dispatch({ kind: 'started', provider: 'password' });
    const email = state.email.trim().toLowerCase();
    try {
      if (!email || !state.password) {
        throw new Error('Email and password are required.');
      }
      try {
        await signIn('password', { flow: 'signIn', email, password: state.password });
      } catch {
        await signIn('password', { flow: 'signUp', email, password: state.password });
      }
    } catch (error) {
      dispatch({ kind: 'failed', message: error instanceof Error ? error.message : 'Sign-in could not start.' });
    } finally {
      dispatch({ kind: 'settled' });
    }
  };
  return (
    <Section title="Welcome" description="Sign in with your preferred account to continue.">
      <Stack gap="md">
        {state.error && <FormError title="Sign-in could not start">{state.error}</FormError>}
        {localAuthEnabled ? (
          <Stack component="form" gap="sm" onSubmit={(event) => void localLogin(event)}>
            <TextInput
              label="Email"
              type="email"
              autoComplete="username"
              value={state.email}
              onChange={(event) => dispatch({ kind: 'emailChanged', value: event.currentTarget.value })}
              disabled={state.busy !== null}
            />
            <TextInput
              label="Password"
              type="password"
              autoComplete="current-password"
              value={state.password}
              onChange={(event) => dispatch({ kind: 'passwordChanged', value: event.currentTarget.value })}
              disabled={state.busy !== null}
            />
            <Button
              type="submit"
              data-testid="local-auth-submit"
              loading={state.busy === 'password'}
              disabled={state.busy !== null}
            >
              Continue with local auth
            </Button>
          </Stack>
        ) : providers ? (
          providers.map((method) => {
            const name = authProviderNames[method.provider];
            const icon =
              method.provider === 'google' ? (
                <GoogleColoredMark width={24} height={24} />
              ) : method.provider === 'discord' ? (
                <SiDiscord size={24} aria-hidden />
              ) : (
                <SiReddit size={24} aria-hidden />
              );
            return (
              <ControlBlock
                key={method.provider}
                title={name}
                input={
                  <Group justify="space-between">
                    <StatusBadge tone="neutral">{method.available ? 'Available' : 'Currently unavailable'}</StatusBadge>
                    <IconAction
                      label={`Continue with ${name}`}
                      icon={icon}
                      size="xl"
                      intent="neutral"
                      emphasis="standard"
                      loading={state.busy === method.provider}
                      disabled={state.busy !== null || !method.available}
                      onClick={() => void socialLogin(method.provider)}
                    />
                  </Group>
                }
              />
            );
          })
        ) : (
          <StatusBadge tone="progress" live>
            Loading sign-in methods
          </StatusBadge>
        )}
      </Stack>
    </Section>
  );
}

function LoginPage() {
  const profile = useCurrentProfile();
  const providers = useSignInProviders();
  return (
    <PageLayout>
      <PageLayout.Header>
        <PageTitle title="Sign in" />
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="lg">
          {profile.data ? (
            <Section title="You're signed in">
              <Stack gap="sm">
                <Text>{profile.data.username ?? 'Player'}</Text>
                <Link to="/">Go to home</Link>
              </Stack>
            </Section>
          ) : (
            <SignInPanel providers={providers} />
          )}
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}
