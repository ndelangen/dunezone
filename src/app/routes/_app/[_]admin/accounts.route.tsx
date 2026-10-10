import { Alert, Button, Group, Select, Stack, Table, Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { useReducer } from 'react';

import { authProviderNames } from '@db/accounts';
import { useAccountManagementPage, useMergeAccounts, useResumeAccountMerge } from '@db/accounts';
import { useSessionViewer } from '@db/profiles';
import { pageHead } from '@app/routes/pageTitle';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

export const Route = createFileRoute('/_app/_admin/accounts')({
  head: () => pageHead('Accounts'),
  component: AccountsPage,
});

function AccountsPage() {
  const viewer = useSessionViewer();
  if (viewer.kind === 'pending') {
    return (
      <PageMessage title="Accounts">
        <LoadPending title="Loading accounts">The account list is loading.</LoadPending>
      </PageMessage>
    );
  }
  if (viewer.kind === 'signed-out') {
    return (
      <PageMessage title="Accounts">
        <LoginGate action="manage accounts" />
      </PageMessage>
    );
  }
  if (!viewer.isAdmin) {
    return (
      <PageMessage title="Accounts">
        <NotAvailable title="Admin access required">Only administrators can manage accounts.</NotAvailable>
      </PageMessage>
    );
  }
  return <AccountManagement />;
}

type AccountPage = NonNullable<ReturnType<typeof useAccountManagementPage>>;
type ManagedProfile = AccountPage['profiles']['page'][number];
type MergeOperation = AccountPage['operations'][number];
type AccountManagementState = {
  cursor: string | null;
  previous: (string | null)[];
  source: string | null;
  target: string | null;
  review: boolean;
  busy: boolean;
  error: string | null;
};

function AccountManagement() {
  const [state, dispatch] = useReducer(
    (state: AccountManagementState, update: Partial<typeof state>) => ({ ...state, ...update }),
    { cursor: null, previous: [], source: null, target: null, review: false, busy: false, error: null }
  );
  const page = useAccountManagementPage(
    state.cursor,
    [state.source, state.target].filter((id): id is string => id !== null)
  );
  const merge = useMergeAccounts();
  const resume = useResumeAccountMerge();
  if (!page) {
    return (
      <PageMessage title="Accounts">
        <LoadPending title="Loading accounts">The account list is loading.</LoadPending>
      </PageMessage>
    );
  }
  const profiles = [
    ...new Map([...page.profiles.page, ...page.selected].map((profile) => [profile.userId, profile])).values(),
  ];
  const options = profiles.map((profile) => ({
    value: profile.userId,
    label: `${profile.name} · ${profile.slug}`,
  }));
  const source = profiles.find((profile) => profile.userId === state.source);
  const target = profiles.find((profile) => profile.userId === state.target);
  const submit = async () => {
    if (!source || !target) {
      return;
    }
    dispatch({ busy: true, error: null });
    try {
      await merge(source.userId, target.userId);
      dispatch({ source: null, target: null, review: false });
    } catch (error) {
      dispatch({ error: error instanceof Error ? error.message : 'The merge could not start.' });
    } finally {
      dispatch({ busy: false });
    }
  };
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle title="Accounts" subtitle="Combine profiles and keep their sign-in methods, content and access." />
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="lg">
          <MergeProfiles
            options={options}
            state={state}
            source={source}
            target={target}
            onUpdate={dispatch}
            onSubmit={() => void submit()}
          />
          <ProfilesTable
            profiles={page.profiles}
            canGoBack={state.previous.length > 0}
            onPrevious={() =>
              dispatch({ cursor: state.previous.at(-1) ?? null, previous: state.previous.slice(0, -1), review: false })
            }
            onNext={() =>
              dispatch({
                cursor: page.profiles.continueCursor,
                previous: [...state.previous, state.cursor],
                review: false,
              })
            }
          />
          <RecentMerges
            operations={page.operations}
            onRetry={(operationId) => void resume({ operationId }).catch((error) => dispatch({ error: error.message }))}
          />
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

function MergeProfiles({
  options,
  state,
  source,
  target,
  onUpdate,
  onSubmit,
}: {
  options: { value: string; label: string }[];
  state: AccountManagementState;
  source: ManagedProfile | undefined;
  target: ManagedProfile | undefined;
  onUpdate: (update: Partial<AccountManagementState>) => void;
  onSubmit: () => void;
}) {
  return (
    <Section title="Merge profiles">
      <Surface padding="lg">
        <Stack>
          <Select
            label="Profile to keep"
            placeholder="Choose the profile to keep"
            searchable
            data={options}
            value={state.target}
            onChange={(target) => onUpdate({ target, review: false, error: null })}
            disabled={state.busy}
          />
          <Select
            label="Profile to merge into it"
            placeholder="Choose the other profile"
            searchable
            data={options.filter((option) => option.value !== state.target)}
            value={state.source}
            onChange={(source) => onUpdate({ source, review: false, error: null })}
            disabled={state.busy}
          />
          {state.error && (
            <Alert color="red" role="alert">
              {state.error}
            </Alert>
          )}
          {state.review && source && target ? (
            <>
              <Text>
                <strong>{target.name}</strong> keeps its name, avatar and profile address. Content, Group memberships
                and every sign-in method from <strong>{source.name}</strong> will move to it. Old profile links will
                open the kept profile.
              </Text>
              <Text size="sm">This merge cannot be undone. The other profile will be signed out.</Text>
              <Group>
                <Button color="red" loading={state.busy} onClick={onSubmit}>
                  Merge into {target.name}
                </Button>
                <Button variant="default" disabled={state.busy} onClick={() => onUpdate({ review: false })}>
                  Cancel
                </Button>
              </Group>
            </>
          ) : (
            <Button
              disabled={!source || !target || source.userId === target.userId}
              onClick={() => onUpdate({ review: true })}
            >
              Review merge
            </Button>
          )}
        </Stack>
      </Surface>
    </Section>
  );
}

function ProfilesTable({
  profiles,
  canGoBack,
  onPrevious,
  onNext,
}: {
  profiles: AccountPage['profiles'];
  canGoBack: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <Section title="Profiles">
      <Surface padding="lg">
        <Stack>
          <Table.ScrollContainer minWidth={500}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Profile</Table.Th>
                  <Table.Th>Sign-in methods</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {profiles.page.map((profile) => (
                  <Table.Tr key={profile.userId}>
                    <Table.Td>
                      <Link to="/profiles/$profileSlug" params={{ profileSlug: profile.slug }}>
                        {profile.name}
                      </Link>
                      <Text size="xs" c="dimmed">
                        {profile.slug}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {profile.methods
                        .filter((method) => method.connected)
                        .map((method) => authProviderNames[method.provider])
                        .join(', ') || 'No connected provider'}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Group>
            <Button variant="default" disabled={!canGoBack} onClick={onPrevious}>
              Previous
            </Button>
            <Button variant="default" disabled={profiles.isDone} onClick={onNext}>
              Next
            </Button>
          </Group>
        </Stack>
      </Surface>
    </Section>
  );
}

function RecentMerges({
  operations,
  onRetry,
}: {
  operations: MergeOperation[];
  onRetry: (operationId: MergeOperation['_id']) => void;
}) {
  return (
    <Section title="Recent merges">
      <Surface padding="lg">
        <Stack>
          {operations.length === 0 ? (
            <Text c="dimmed">No merges yet.</Text>
          ) : (
            operations.map((operation) => (
              <Group key={operation._id} justify="space-between">
                <Stack gap={2}>
                  <Text>
                    {operation.source_name} → {operation.target_name}
                  </Text>
                  <Text size="sm" c={operation.state === 'failed' ? 'red' : 'dimmed'}>
                    {operation.state === 'running'
                      ? 'Merging profiles…'
                      : operation.state === 'completed'
                        ? 'Completed'
                        : operation.error}
                  </Text>
                </Stack>
                {operation.state === 'failed' && (
                  <Button variant="default" onClick={() => onRetry(operation._id)}>
                    Retry merge
                  </Button>
                )}
              </Group>
            ))
          )}
        </Stack>
      </Surface>
    </Section>
  );
}
