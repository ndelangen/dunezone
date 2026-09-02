import { Alert, Button, Checkbox, Group, List, Popover, Stack, Text, Title } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { ConfirmDeleteButton } from '@ui/control/ConfirmDeleteButton';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, UserRoundSearch } from 'lucide-react';
import { useState } from 'react';

import { useAccountDeletionPage, useConfirmAccountDeletion } from '@db/accountDeletion';
import type { ReplacementProfile } from '@db/accountDeletion';
import { ProfilePicker } from '@app/pickers/ProfilePicker';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

const kindLabels = { group: 'Groups', faction: 'Factions', ruleset: 'Rulesets' } as const;

export const Route = createFileRoute('/_app/profiles/$profileSlug/delete')({
  component: AccountDeletionPage,
});

function AccountDeletionPage() {
  const { profileSlug } = Route.useParams();
  const page = useAccountDeletionPage(profileSlug);
  const confirm = useConfirmAccountDeletion();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replacement, setReplacement] = useState<ReplacementProfile | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const toolbar = (
    <Toolbar>
      <Toolbar.Left>
        <IconAction
          label="Back to profile settings"
          variant="light"
          intent="neutral"
          size="lg"
          renderRoot={(rootProps) => <Link {...rootProps} to="/profiles/$profileSlug/edit" params={{ profileSlug }} />}
          icon={<ArrowLeft size={16} aria-hidden />}
        />
      </Toolbar.Left>
    </Toolbar>
  );

  const backToSettings = (
    <PageMessage.Back to="/profiles/$profileSlug/edit" params={{ profileSlug }}>
      Back to profile settings
    </PageMessage.Back>
  );

  if (page.isPending) {
    return (
      <PageMessage title="Delete account" back={backToSettings}>
        <LoadPending title="Loading">Checking what deleting this account would affect.</LoadPending>
      </PageMessage>
    );
  }

  const data = page.data;
  /* The server already tells these two apart, sending `reason: 'signed_out'` or `'wrong_profile'`;
     this page used to collapse both into one sentence that offered a login link to a reader who was
     already logged in. The vocabulary makes keeping the distinction cheaper than losing it. */
  if (!data || (data.kind === 'denied' && data.reason === 'signed_out')) {
    return (
      <PageMessage title="Delete account" back={backToSettings}>
        <LoginGate action="delete your account" />
      </PageMessage>
    );
  }

  if (data.kind === 'denied') {
    return (
      <PageMessage title="Delete account" back={backToSettings}>
        <NotAvailable title="This is not your account">
          You must be signed in to the profile named in this address.
        </NotAvailable>
      </PageMessage>
    );
  }

  if (data.kind === 'pending') {
    const failed = data.operation?.state === 'failed';
    return (
      <PageMessage title="Delete account" back={backToSettings}>
        {failed ? (
          <LoadError title="Account deletion did not finish" stale={false}>
            {data.operation?.error ?? 'The operation needs administrative repair before it can continue.'}
          </LoadError>
        ) : (
          <LoadPending title="Account deletion is in progress">
            {`Current phase: ${data.operation?.phase ?? 'starting'}. This page updates automatically.`}
          </LoadPending>
        )}
      </PageMessage>
    );
  }

  if (data.kind === 'deleted') {
    /* The one state here with no block: a finished action is neither absent, pending nor failed, and
       the four bodies are all ways of saying a page has nothing to show. The frame still carries the
       name and the way out, which is what it was missing before. */
    return (
      <PageMessage title="Account deleted" back={<PageMessage.Back to="/">Return to Dune Zone</PageMessage.Back>}>
        <Text>Your account and direct ownership have been disposed according to your choice.</Text>
      </PageMessage>
    );
  }

  if (data.kind !== 'active') {
    return null;
  }

  const hasOwnership = data.summary.some((entry) => entry.hasActive || entry.hasDeleted);
  return (
    <PageLayout>
      <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
      <PageLayout.Content>
        <Surface padding="xl">
          <Stack gap="xl">
            <div>
              <Title order={1}>Delete account</Title>
              <Text c="dimmed">Review direct ownership before deleting {data.profile.username ?? 'this account'}.</Text>
            </div>

            <Stack gap="xs">
              <Title order={2} size="h3">
                Direct ownership
              </Title>
              {hasOwnership ? (
                <List>
                  {data.summary.map((entry) => (
                    <List.Item key={entry.kind}>
                      {kindLabels[entry.kind]}: {entry.hasActive ? 'active ownership' : 'no active ownership'}
                      {entry.hasDeleted ? '; deleted records also exist' : ''}
                    </List.Item>
                  ))}
                </List>
              ) : (
                <Text c="dimmed">This account directly owns no Groups, factions, or rulesets.</Text>
              )}
            </Stack>

            <Stack gap="sm">
              <Title order={2} size="h3">
                Choose the outcome
              </Title>
              <Text>
                Select one active profile to receive every directly owned Group, faction, and ruleset. If you leave the
                replacement empty, those records will be soft-deleted instead.
              </Text>
              <Popover
                opened={pickerOpen}
                onChange={setPickerOpen}
                width={420}
                position="bottom-start"
                trapFocus
                closeOnEscape
              >
                <Popover.Target>
                  <Button
                    type="button"
                    variant="light"
                    leftSection={<UserRoundSearch size={16} aria-hidden />}
                    onClick={() => setPickerOpen((open) => !open)}
                  >
                    {replacement ? 'Change replacement owner' : 'Choose a replacement owner'}
                  </Button>
                </Popover.Target>
                <Popover.Dropdown>
                  {pickerOpen ? (
                    <ProfilePicker
                      onPick={(profile) => {
                        setReplacement(profile);
                        setPickerOpen(false);
                        setAcknowledged(false);
                      }}
                      onCancel={() => setPickerOpen(false)}
                    />
                  ) : null}
                </Popover.Dropdown>
              </Popover>
              {replacement ? (
                <Group justify="space-between" wrap="wrap">
                  <Text>
                    New owner: <strong>{replacement.username}</strong>
                  </Text>
                  <Button
                    type="button"
                    variant="subtle"
                    color="gray"
                    onClick={() => {
                      setReplacement(null);
                      setAcknowledged(false);
                    }}
                  >
                    Use no replacement
                  </Button>
                </Group>
              ) : (
                <Alert color="orange" title="No replacement selected">
                  All directly owned records will be soft-deleted. Records you only authored, joined, or may edit are
                  not affected.
                </Alert>
              )}
            </Stack>

            {confirm.isError ? (
              <FormError title="Account deletion could not start">
                {confirm.error?.message ?? 'The operation could not be started.'}
              </FormError>
            ) : null}
            <Checkbox
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.currentTarget.checked)}
              label={
                replacement
                  ? `Transfer all direct ownership to ${replacement.username}, then delete my account.`
                  : 'Soft-delete all direct ownership, then delete my account.'
              }
            />
            {/* The checkbox states what will happen; the hold is the commitment. The heaviest delete in the application wears the same five seconds as every other (Norbert, 2026-08-21). */}
            <ConfirmDeleteButton
              label={replacement ? 'Transfer ownership and delete account' : 'Delete account'}
              disabled={!acknowledged}
              pending={confirm.isPending}
              onConfirm={() => confirm.mutate({ replacementUserId: replacement?.userId ?? null })}
            />
          </Stack>
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}
