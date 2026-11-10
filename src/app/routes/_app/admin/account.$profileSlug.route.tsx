import { Checkbox, Group, List, Popover, Stack, Text, Textarea } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { Notice } from '@ui/block/Notice';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { Breadcrumb } from '@ui/content/Breadcrumb';
import { ControlBlock } from '@ui/control/ControlBlock';
import { HoldAction } from '@ui/control/HoldAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { RotateCcw, ShieldCheck, UserRoundSearch, UserRoundX } from 'lucide-react';
import { useReducer } from 'react';

import {
  useAccountModerationPage,
  useBanAccount,
  useResumeAccountContentOperation,
  useUnbanAccount,
} from '@db/accountDeletion';
import type { ReplacementProfile } from '@db/accountDeletion';
import { useCurrentProfile } from '@db/profiles';
import { ProfilePicker } from '@app/pickers/ProfilePicker';
import { pageHead } from '@app/routes/pageTitle';
import { AdminPageLoading } from '@app/widgets/page-message/AdminGate';

export const Route = createFileRoute('/_app/admin/account/$profileSlug')({
  head: () => pageHead('Manage account', { noindex: true }),
  component: AccountModerationPage,
});

const kindLabels = { group: 'Groups', faction: 'Factions', ruleset: 'Rulesets', asset: 'Assets' } as const;
const phaseLabels = {
  snapshotting: 'Finding owned content',
  applying: 'Updating owned content',
  verifying: 'Checking ownership',
  finalizing: 'Removing games',
  restoring: 'Restoring content',
  complete: 'Complete',
} as const;
type Draft = {
  profileSlug: string;
  replacement: ReplacementProfile | null;
  pickerOpen: boolean;
  acknowledged: boolean;
  reason: string;
};
type Event =
  | { type: 'account'; profileSlug: string }
  | { type: 'pick'; profile: ReplacementProfile | null }
  | { type: 'picker'; open: boolean }
  | { type: 'acknowledge'; value: boolean }
  | { type: 'reason'; value: string };
function reduceDraft(state: Draft, event: Event): Draft {
  switch (event.type) {
    case 'account':
      return { profileSlug: event.profileSlug, replacement: null, pickerOpen: false, acknowledged: false, reason: '' };
    case 'pick':
      return { ...state, replacement: event.profile, pickerOpen: false, acknowledged: false };
    case 'picker':
      return { ...state, pickerOpen: event.open };
    case 'acknowledge':
      return { ...state, acknowledged: event.value };
    case 'reason':
      return { ...state, reason: event.value, acknowledged: false };
  }
}

function AccountModerationPage() {
  const { profileSlug } = Route.useParams();
  const page = useAccountModerationPage(profileSlug);
  const viewer = useCurrentProfile();
  const ban = useBanAccount();
  const unban = useUnbanAccount();
  const resume = useResumeAccountContentOperation();
  const [draft, dispatch] = useReducer(reduceDraft, {
    profileSlug,
    replacement: null,
    pickerOpen: false,
    acknowledged: false,
    reason: '',
  });
  if (draft.profileSlug !== profileSlug) {
    dispatch({ type: 'account', profileSlug });
  }
  if (page.isPending) {
    return <AdminPageLoading title="Manage account">Loading the account and its ownership.</AdminPageLoading>;
  }
  const data = page.data;
  const profileName = data?.profile.username ?? data?.profile.slug ?? 'this account';
  const error = ban.error ?? unban.error ?? resume.error;
  function banAccount() {
    if (!data) {
      return;
    }
    ban.mutate(
      {
        sourceUserId: data.profile.userId,
        replacementUserId: draft.replacement?.userId ?? null,
        ...(draft.reason.trim() ? { reason: draft.reason.trim() } : {}),
      },
      { onSuccess: () => dispatch({ type: 'account', profileSlug }) }
    );
  }
  return (
    <PageLayout>
      <PageLayout.Header size="compact" align="start">
        <PageTitle
          title={data ? `Manage ${profileName}` : 'Account not found'}
          breadcrumb={<Breadcrumb to="/admin/accounts">Accounts</Breadcrumb>}
        />
      </PageLayout.Header>
      <PageLayout.Content>
        {data ? (
          <Stack gap="lg">
            <BannedAccountSection
              data={data}
              pending={unban.isPending}
              onUnban={() =>
                unban.mutate(
                  { sourceUserId: data.profile.userId },
                  { onSuccess: () => dispatch({ type: 'account', profileSlug }) }
                )
              }
            />
            <ContentOperationSection
              data={data}
              pending={resume.isPending}
              onResume={(operationId) => resume.mutate({ operationId })}
            />
            <BanAccountSection
              data={data}
              profileName={profileName}
              isOwnAccount={viewer.data?.user_id === data.profile.userId}
              draft={draft}
              onDraft={dispatch}
              pending={ban.isPending}
              onBan={banAccount}
            />
            {error ? <FormError title="Account action failed">{error.message}</FormError> : null}
          </Stack>
        ) : (
          <Text>This account does not exist.</Text>
        )}
      </PageLayout.Content>
    </PageLayout>
  );
}

type ModerationData = NonNullable<ReturnType<typeof useAccountModerationPage>['data']>;
type DraftControls = Readonly<{ draft: Draft; onDraft: (event: Event) => void; pending: boolean }>;

function BannedAccountSection({
  data,
  pending,
  onUnban,
}: Readonly<{
  data: ModerationData;
  pending: boolean;
  onUnban: () => void;
}>) {
  if (data.accountState !== 'banned') {
    return null;
  }
  const unfinished = data.operation && data.operation.state !== 'completed';
  return (
    <Section title="Account banned">
      <Surface padding="lg">
        <Stack>
          <Text>This account can only see the banned page. Its linked sign-in methods remain attached.</Text>
          {data.bannedAt ? <Text size="sm">Banned at {data.bannedAt}</Text> : null}
          {data.bannedReason ? <Text>Admin reason: {data.bannedReason}</Text> : null}
          <Text size="sm">
            Lifting the ban lets this person sign in again. It does not return transferred content or restore removed
            content or games.
          </Text>
          <LabeledAction
            icon={<ShieldCheck size={16} />}
            intent="positive"
            busy={pending}
            disabledReason={unfinished ? 'Finish the content operation before lifting the ban.' : undefined}
            onClick={onUnban}
          >
            Lift ban
          </LabeledAction>
        </Stack>
      </Surface>
    </Section>
  );
}

function ContentOperationSection({
  data,
  pending,
  onResume,
}: Readonly<{
  data: ModerationData;
  pending: boolean;
  onResume: (operationId: NonNullable<ModerationData['operation']>['id']) => void;
}>) {
  const operation = data.operation;
  if (!operation) {
    return null;
  }
  let status = 'In progress';
  if (operation.state === 'completed') {
    status = 'Content operation completed';
  } else if (operation.state === 'failed') {
    status = 'Needs attention';
  }
  return (
    <Section title="Content operation">
      <Surface padding="lg">
        <Stack>
          <Text>{status}</Text>
          {operation.state !== 'completed' ? (
            <Text size="sm">{phaseLabels[operation.phase]}. This page updates automatically.</Text>
          ) : null}
          <DiscordCleanupStatus status={data.discordCleanup} completed={operation.state === 'completed'} />
          {operation.error ? <FormError title="Content operation did not finish">{operation.error}</FormError> : null}
          {operation.state === 'failed' ? (
            <LabeledAction icon={<RotateCcw size={16} />} busy={pending} onClick={() => onResume(operation.id)}>
              Resume content operation
            </LabeledAction>
          ) : null}
        </Stack>
      </Surface>
    </Section>
  );
}

function DiscordCleanupStatus({
  status,
  completed,
}: Readonly<{
  status: ModerationData['discordCleanup'];
  completed: boolean;
}>) {
  if (status === 'pending') {
    return (
      <Notice tone="caution" title="Discord cleanup pending">
        Discord channel deletion is still pending. Follow its progress in{' '}
        <Link to="/admin/discord">Discord voice administration</Link>.
      </Notice>
    );
  }
  if (!completed) {
    return null;
  }
  return (
    <Text size="sm">{status === 'complete' ? 'Discord channels deleted.' : 'No Discord channels need deletion.'}</Text>
  );
}

function BanAccountSection({
  data,
  profileName,
  isOwnAccount,
  draft,
  onDraft,
  pending,
  onBan,
}: DraftControls &
  Readonly<{
    data: ModerationData;
    profileName: string;
    isOwnAccount: boolean;
    onBan: () => void;
  }>) {
  if (data.accountState !== 'active') {
    return null;
  }
  return (
    <Section title="Ban account">
      <Surface padding="lg">
        <Stack gap="lg">
          <Text>
            Banning this account blocks access immediately. Its linked sign-in methods stay attached, so signing in
            again reaches the same banned account.
          </Text>
          <Section title="Direct ownership">
            <List>
              {data.summary.map((entry) => (
                <List.Item key={entry.kind}>
                  {kindLabels[entry.kind]}: {entry.hasActive ? 'active ownership' : 'no active ownership'}
                  {entry.hasDeleted ? '; deleted records also exist' : ''}
                </List.Item>
              ))}
            </List>
          </Section>
          <BanContentOutcome sourceUserId={data.profile.userId} draft={draft} onDraft={onDraft} pending={pending} />
          <ControlBlock
            title="Admin reason"
            description="Optional. Only administrators can see this reason."
            input={(fieldProps) => (
              <Textarea
                {...fieldProps}
                value={draft.reason}
                disabled={pending}
                maxLength={1000}
                onChange={(event) => onDraft({ type: 'reason', value: event.currentTarget.value })}
              />
            )}
          />
          <Checkbox
            disabled={pending}
            checked={draft.acknowledged}
            onChange={(event) => onDraft({ type: 'acknowledge', value: event.currentTarget.checked })}
            label={
              draft.replacement
                ? `Ban ${profileName}, transfer content to ${draft.replacement.username}, and remove all hosted games.`
                : `Ban ${profileName}, soft-delete its content, and remove all hosted games.`
            }
          />
          <HoldAction
            shape="button"
            verb="ban"
            label="Ban account"
            disabled={!draft.acknowledged}
            disabledReason={isOwnAccount ? 'You cannot ban your own account.' : undefined}
            pending={pending}
            onConfirm={onBan}
          />
        </Stack>
      </Surface>
    </Section>
  );
}

function BanContentOutcome({
  sourceUserId,
  draft,
  onDraft,
  pending,
}: DraftControls & Readonly<{ sourceUserId: string }>) {
  return (
    <Section title="Choose the content outcome">
      <Text>
        Choose a replacement owner for every directly owned Group, faction, ruleset and asset. With no replacement,
        those records are soft-deleted.
      </Text>
      <Popover
        opened={draft.pickerOpen}
        onChange={(open) => onDraft({ type: 'picker', open })}
        width={420}
        styles={{ dropdown: { maxWidth: 'calc(100vw - var(--space-md) * 2)' } }}
        position="bottom-start"
        trapFocus
        closeOnEscape
      >
        <Popover.Target>
          <LabeledAction
            icon={<UserRoundSearch size={16} />}
            disabledReason={pending ? 'The ban is starting.' : undefined}
            onClick={() => onDraft({ type: 'picker', open: !draft.pickerOpen })}
          >
            {draft.replacement ? 'Change replacement owner' : 'Choose a replacement owner'}
          </LabeledAction>
        </Popover.Target>
        <Popover.Dropdown>
          {draft.pickerOpen ? (
            <ProfilePicker
              adminSourceUserId={sourceUserId}
              onPick={(profile) => onDraft({ type: 'pick', profile })}
              onCancel={() => onDraft({ type: 'picker', open: false })}
            />
          ) : null}
        </Popover.Dropdown>
      </Popover>
      {draft.replacement ? (
        <Group justify="space-between">
          <Text>
            New owner: <strong>{draft.replacement.username}</strong>
          </Text>
          <LabeledAction
            icon={<UserRoundX size={16} />}
            disabledReason={pending ? 'The ban is starting.' : undefined}
            onClick={() => onDraft({ type: 'pick', profile: null })}
          >
            Use no replacement
          </LabeledAction>
        </Group>
      ) : (
        <Notice tone="caution" title="No replacement selected">
          All directly owned Groups, factions, rulesets and assets will be soft-deleted.
        </Notice>
      )}
      <Notice tone="caution" title="Hosted games will be removed">
        Every game this account created will be removed, even if other people are playing. Its Discord voice channel
        will be deleted. Games are removed even when content transfers to another owner.
      </Notice>
    </Section>
  );
}
