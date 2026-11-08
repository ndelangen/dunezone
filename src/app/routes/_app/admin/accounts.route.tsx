import { Group, Select, Stack, Table, Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ActionError } from '@ui/block/ActionError';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { Breadcrumb } from '@ui/content/Breadcrumb';
import { ControlBlock } from '@ui/control/ControlBlock';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ChevronLeft, ChevronRight, Eye, Merge, RotateCcw, X } from 'lucide-react';
import { useReducer } from 'react';

import { authProviderNames } from '@db/accounts';
import { useAccountManagementPage, useMergeAccounts, useResumeAccountMerge } from '@db/accounts';
import { pageHead } from '@app/routes/pageTitle';
import { AdminPageLoading } from '@app/widgets/page-message/AdminGate';

export const Route = createFileRoute('/_app/admin/accounts')({
  head: () => pageHead('Accounts'),
  component: AccountManagement,
});

type AccountPage = NonNullable<ReturnType<typeof useAccountManagementPage>>;
type ManagedProfile = AccountPage['profiles']['page'][number];
type MergeOperation = AccountPage['operations'][number];
type AccountManagementState = {
  failedCursors: (string | null)[];
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
    {
      failedCursors: [null],
      cursor: null,
      previous: [],
      source: null,
      target: null,
      review: false,
      busy: false,
      error: null,
    }
  );
  const page = useAccountManagementPage(
    state.cursor,
    [state.source, state.target].filter((id): id is string => id !== null),
    state.failedCursors.at(-1) ?? null
  );
  const merge = useMergeAccounts();
  const resume = useResumeAccountMerge();
  if (!page) {
    return <AdminPageLoading title="Accounts">The account list is loading.</AdminPageLoading>;
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
    }
    dispatch({ busy: false });
  };
  return (
    <PageLayout>
      <PageLayout.Header size="compact" align="start">
        <PageTitle
          breadcrumb={<Breadcrumb to="/admin">Admin tools</Breadcrumb>}
          title="Accounts"
          lede="Combine profiles and keep their sign-in methods, content and access."
        />
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
            isRefreshing={page.isRefreshing}
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
          <Section title="Failed merges">
            <Surface padding="lg">
              <Stack>
                <MergeOperations
                  operations={page.failedOperations.page}
                  empty="No failed merges on this page."
                  onRetry={(operationId) =>
                    void resume({ operationId }).catch((error) => dispatch({ error: error.message }))
                  }
                />
                <Group justify="space-between">
                  <LabeledAction
                    icon={<ChevronLeft size={16} />}
                    disabledReason={
                      page.isRefreshing
                        ? 'The page is loading.'
                        : state.failedCursors.length === 1
                          ? 'These are the first failed merges.'
                          : undefined
                    }
                    onClick={() => dispatch({ failedCursors: state.failedCursors.slice(0, -1) })}
                  >
                    Previous failed merges
                  </LabeledAction>
                  <LabeledAction
                    icon={<ChevronRight size={16} />}
                    disabledReason={
                      page.isRefreshing
                        ? 'The page is loading.'
                        : page.failedOperations.isDone
                          ? 'These are the last failed merges.'
                          : undefined
                    }
                    onClick={() =>
                      dispatch({ failedCursors: [...state.failedCursors, page.failedOperations.continueCursor] })
                    }
                  >
                    Next failed merges
                  </LabeledAction>
                </Group>
              </Stack>
            </Surface>
          </Section>
          <Section title="Recent merges">
            <Surface padding="lg">
              <MergeOperations
                operations={page.operations.filter((operation) => operation.state !== 'failed')}
                empty="No recent running or completed merges."
                onRetry={(operationId) =>
                  void resume({ operationId }).catch((error) => dispatch({ error: error.message }))
                }
              />
            </Surface>
          </Section>
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
          <ControlBlock
            title="Profile to keep"
            input={(fieldProps) => (
              <Select
                {...fieldProps}
                placeholder="Choose the profile to keep"
                searchable
                data={options}
                value={state.target}
                onChange={(target) => onUpdate({ target, review: false, error: null })}
                disabled={state.busy}
              />
            )}
          />
          <ControlBlock
            title="Profile to merge into it"
            input={(fieldProps) => (
              <Select
                {...fieldProps}
                placeholder="Choose the other profile"
                searchable
                data={options.filter((option) => option.value !== state.target)}
                value={state.source}
                onChange={(source) => onUpdate({ source, review: false, error: null })}
                disabled={state.busy}
              />
            )}
          />
          <ActionError subject="Profiles" verb="merge" error={state.error} />
          {state.review && source && target ? (
            <>
              <Text>
                <strong>{target.name}</strong> keeps its name, avatar and profile address. Content, Group memberships
                and every sign-in method from <strong>{source.name}</strong> will move to it. Old profile links will
                open the kept profile.
              </Text>
              <Text size="sm">This merge cannot be undone. The other profile will be signed out.</Text>
              <Group>
                <LabeledAction
                  intent="negative"
                  emphasis="strong"
                  icon={<Merge size={16} />}
                  busy={state.busy}
                  onClick={onSubmit}
                >
                  {`Merge into ${target.name}`}
                </LabeledAction>
                <LabeledAction
                  icon={<X size={16} />}
                  disabledReason={state.busy ? 'The merge is running.' : undefined}
                  onClick={() => onUpdate({ review: false })}
                >
                  Cancel
                </LabeledAction>
              </Group>
            </>
          ) : (
            <LabeledAction
              emphasis="strong"
              icon={<Eye size={16} />}
              disabledReason={
                !source || !target || source.userId === target.userId
                  ? 'Choose two different profiles first.'
                  : undefined
              }
              onClick={() => onUpdate({ review: true })}
            >
              Review merge
            </LabeledAction>
          )}
        </Stack>
      </Surface>
    </Section>
  );
}

function ProfilesTable({
  profiles,
  isRefreshing,
  canGoBack,
  onPrevious,
  onNext,
}: {
  profiles: AccountPage['profiles'];
  isRefreshing: boolean;
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
            <LabeledAction
              icon={<ChevronLeft size={16} />}
              disabledReason={isRefreshing ? 'The page is loading.' : canGoBack ? undefined : 'This is the first page.'}
              onClick={onPrevious}
            >
              Previous
            </LabeledAction>
            <LabeledAction
              icon={<ChevronRight size={16} />}
              disabledReason={
                isRefreshing ? 'The page is loading.' : profiles.isDone ? 'This is the last page.' : undefined
              }
              onClick={onNext}
            >
              Next
            </LabeledAction>
          </Group>
        </Stack>
      </Surface>
    </Section>
  );
}

function MergeOperations({
  empty,
  operations,
  onRetry,
}: {
  empty: string;
  operations: MergeOperation[];
  onRetry: (operationId: MergeOperation['_id']) => void;
}) {
  return (
    <Stack>
      {operations.length === 0 ? (
        <Text c="dimmed">{empty}</Text>
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
              <LabeledAction icon={<RotateCcw size={16} />} onClick={() => onRetry(operation._id)}>
                Retry merge
              </LabeledAction>
            )}
          </Group>
        ))
      )}
    </Stack>
  );
}
