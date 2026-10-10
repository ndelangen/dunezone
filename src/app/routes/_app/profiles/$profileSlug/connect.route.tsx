import { useAuthActions } from '@convex-dev/auth/react';
import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { useReducer } from 'react';

import { useAuthConnection, useConfirmAuthConnection } from '@db/accounts';
import { pageHead } from '@app/routes/pageTitle';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

export const Route = createFileRoute('/_app/profiles/$profileSlug/connect')({
  validateSearch: (search: Record<string, unknown>) => ({
    connection: typeof search.connection === 'string' ? search.connection : '',
  }),
  head: () => ({
    meta: [
      ...pageHead('Connect sign-in method', { noindex: true }).meta!,
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  component: ConnectAccountPage,
});

function ConnectAccountPage() {
  const { connection: token } = Route.useSearch();
  const connection = useAuthConnection(token);
  const confirm = useConfirmAuthConnection();
  const { signIn } = useAuthActions();
  const [state, dispatch] = useReducer(
    (state: { busy: boolean; error: string | null }, update: Partial<typeof state>) => ({ ...state, ...update }),
    { busy: false, error: null }
  );
  const accept = async () => {
    dispatch({ busy: true, error: null });
    try {
      await confirm({ token });
    } catch (error) {
      dispatch({ error: error instanceof Error ? error.message : 'The connection could not be completed.' });
    } finally {
      dispatch({ busy: false });
    }
  };
  if (connection === undefined) {
    return (
      <PageMessage title="Connect sign-in method">
        <LoadPending title="Checking the connection">The sign-in result is loading.</LoadPending>
      </PageMessage>
    );
  }
  if (!connection) {
    return (
      <PageMessage title="Connect sign-in method">
        <NotAvailable title="Connection unavailable">
          This connection expired or the sign-in did not finish. Start again from your profile.
        </NotAvailable>
      </PageMessage>
    );
  }
  const provider = connection.provider === 'google' ? 'Google' : 'Discord';
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle title={`Connect ${provider}`} />
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="lg">
          <Stack>
            {state.error && (
              <Alert color="red" role="alert">
                {state.error}
              </Alert>
            )}
            <ConnectionStatus
              connection={connection}
              provider={provider}
              busy={state.busy}
              onAccept={() => void accept()}
              onContinue={() =>
                void signIn(connection.provider, {
                  redirectTo: `/profiles/${encodeURIComponent(connection.targetSlug)}`,
                }).catch((error) => dispatch({ error: error.message }))
              }
            />
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}

type AuthConnection = NonNullable<ReturnType<typeof useAuthConnection>>;

function ConnectionStatus({
  connection,
  provider,
  busy,
  onAccept,
  onContinue,
}: {
  connection: AuthConnection;
  provider: string;
  busy: boolean;
  onAccept: () => void;
  onContinue: () => void;
}) {
  switch (connection.state) {
    case 'review':
      return <ConnectionReview connection={connection} provider={provider} busy={busy} onAccept={onAccept} />;
    case 'running':
      return (
        <>
          <Text>Merging into {connection.targetName}…</Text>
          <Text size="sm" c="dimmed">
            You can leave this page. The merge will keep running.
          </Text>
        </>
      );
    case 'failed':
      return (
        <Alert color="red" role="alert">
          The merge paused. An administrator can resume it from Accounts. {connection.error}
        </Alert>
      );
    case 'completed':
      return (
        <>
          <Text>
            {provider} is now connected to {connection.targetName}. Your content and access have been combined.
          </Text>
          <Button onClick={onContinue}>Continue with {provider}</Button>
        </>
      );
  }
}

function ConnectionReview({
  connection,
  provider,
  busy,
  onAccept,
}: {
  connection: AuthConnection;
  provider: string;
  busy: boolean;
  onAccept: () => void;
}) {
  if (connection.sameAccount) {
    return (
      <>
        <Text>{provider} is already connected to this profile.</Text>
        <Link to="/profiles/$profileSlug" params={{ profileSlug: connection.targetSlug }}>
          Return to profile
        </Link>
      </>
    );
  }
  return (
    <>
      <Text>
        You signed in as <strong>{connection.sourceName}</strong>. Connect this account to{' '}
        <strong>{connection.targetName}</strong>?
      </Text>
      <Text>
        The kept profile stays at /profiles/{connection.targetSlug}. Its name and avatar stay the same. Both profiles’
        content, Group memberships, game access and sign-in methods will be combined.
      </Text>
      <Text size="sm">This merge cannot be undone. You will sign in once more when it finishes.</Text>
      <Group>
        <Button loading={busy} onClick={onAccept}>
          Connect and merge profiles
        </Button>
        <Link to="/profiles">Cancel</Link>
      </Group>
    </>
  );
}
