import { Stack } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Surface } from '@ui/surface';

import { useCurrentProfile } from '@db/profiles';
import { LoginForm } from '@app/components/auth/LoginForm';
import { PageLayout } from '@app/components/layout/PageLayout';

export const Route = createFileRoute('/_app/auth/login')({
  component: LoginPage,
});

function LoginPage() {
  const profile = useCurrentProfile();

  return (
    <PageLayout header={<h1>Sign in</h1>}>
      <Surface padding="lg">
        {profile.data ? (
          <Stack gap="sm">
            <h2>You're signed in</h2>
            <p>{profile.data.username ?? 'Player'}</p>
            <Link to="/">Go to home</Link>
          </Stack>
        ) : (
          <LoginForm />
        )}
      </Surface>
    </PageLayout>
  );
}
