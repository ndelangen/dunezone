import { Box, Button, Center, Image, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core';
import { profileSlugBaseFromName, profileUserEditFormSchema } from '@shared/profiles/validation';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { SlugRenameNotice } from '@ui/content/SlugRenameNotice';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { SubmitAction } from '@ui/control/SubmitAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, CircleUserRound, Palette, Save, Trash2, User, UsersRound } from 'lucide-react';
import { useId, useReducer, useRef, useState } from 'react';

import { useDefaultGroupPreference, useSessionViewer, useUpdateCurrentProfile } from '@db/profiles';
import type { CurrentProfileEntry, ProfileUserEditInput } from '@db/profiles';
import { setSchemePreference, useSchemePreference } from '@app/styles/colorScheme';
import type { SchemePreference } from '@app/styles/colorScheme';
import { setMotionOverride, useMotionPreference } from '@app/styles/motion';
import type { MotionPreference } from '@app/styles/motion';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

type ProfileTab = 'profile' | 'defaults' | 'appearance' | 'account';

type ProfileDraft = {
  username: string;
  avatarUrl: string;
  /* The raw column now, not the sanitized projection: `session` no longer joins memberships.
     A default pointing at a Group the viewer left is corrected by derivation once the options land. */
  defaultGroupId: string | null;
  /* Declared intent (D4): the id alone cannot say whether an unchanged value was chosen or inherited. */
  defaultGroupChanged: boolean;
};

type ProfileEditState = {
  data: ProfileDraft;
  baseline: { username: string; avatarUrl: string };
};

type ProfileEditEvent =
  | { kind: 'patch'; update: Partial<ProfileDraft> }
  | { kind: 'saved'; entry: { username: string; avatarUrl: string; defaultGroupId: string | null } };

function openingState(initial: {
  username: string;
  avatarUrl: string;
  defaultGroupId: string | null;
}): ProfileEditState {
  return {
    data: { ...initial, defaultGroupChanged: false },
    baseline: { username: initial.username, avatarUrl: initial.avatarUrl },
  };
}

function reduceProfileEdit(state: ProfileEditState, event: ProfileEditEvent): ProfileEditState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'saved':
      return openingState(event.entry);
  }
}
type LoadedAvatarPreview = { url: string; status: 'ready' | 'unavailable' };

function parseAvatarPreviewUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function AvatarPreview({ avatarUrl, username }: { avatarUrl: string; username: string }) {
  const [loaded, setLoaded] = useState<LoadedAvatarPreview | null>(null);
  const trimmed = avatarUrl.trim();
  const previewUrl = parseAvatarPreviewUrl(avatarUrl);
  const status =
    trimmed.length === 0
      ? 'empty'
      : previewUrl === null
        ? 'invalid'
        : loaded?.url === previewUrl
          ? loaded.status
          : 'loading';

  const message =
    status === 'empty'
      ? 'Enter an avatar URL to see a preview.'
      : status === 'invalid'
        ? 'Enter a valid https:// image URL.'
        : status === 'loading'
          ? 'Loading avatar preview...'
          : status === 'unavailable'
            ? 'This image could not be loaded.'
            : null;

  return (
    <Stack gap="xs">
      <Text fw={650}>Avatar preview</Text>
      <Box pos="relative" mih={220}>
        {previewUrl ? (
          <Image
            key={previewUrl}
            src={previewUrl}
            alt={status === 'ready' ? 'Avatar preview for ' + (username || 'this profile') : ''}
            fit="contain"
            h={220}
            w="100%"
            radius="sm"
            style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }}
            onLoad={() => setLoaded({ url: previewUrl, status: 'ready' })}
            onError={() => setLoaded({ url: previewUrl, status: 'unavailable' })}
          />
        ) : null}
        {message ? (
          <Center pos="absolute" style={{ inset: 0 }}>
            <Text
              c={status === 'invalid' || status === 'unavailable' ? 'red' : 'dimmed'}
              role={status === 'invalid' || status === 'unavailable' ? 'alert' : 'status'}
              ta="center"
            >
              {message}
            </Text>
          </Center>
        ) : null}
      </Box>
    </Stack>
  );
}

function PreferenceSegments<Value extends string>({
  label,
  note,
  options,
  value,
  onChange,
}: {
  label: string;
  note: string;
  options: readonly { value: Value; label: string }[];
  value: Value;
  onChange: (next: Value) => void;
}) {
  return (
    <ControlBlock
      title={label}
      description={note}
      input={
        <SegmentedControl
          aria-label={label}
          data={[...options]}
          value={value}
          onChange={(next) => onChange(next as Value)}
          fullWidth
        />
      }
    />
  );
}

function EditableProfilePage({ initial }: { initial: CurrentProfileEntry }) {
  const navigate = useNavigate();
  const update = useUpdateCurrentProfile();
  const formId = 'profile-settings-' + useId().replaceAll(':', '');
  const usernameRef = useRef<HTMLInputElement>(null);
  const avatarUrlRef = useRef<HTMLInputElement>(null);
  const defaultGroupRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [state, dispatch] = useReducer(
    reduceProfileEdit,
    {
      username: initial.username ?? '',
      avatarUrl: initial.avatar_url ?? '',
      defaultGroupId: initial.default_group_id ?? null,
    },
    openingState
  );
  const { username, avatarUrl, defaultGroupChanged } = state.data;
  const defaultGroupOptions = useDefaultGroupPreference().data?.default_group_options;
  /* Derived, not resynced: a default pointing at a Group the viewer left reads as none once the
     options land, and the same derivation is what a save submits. Until the options land the stored
     value stands, since not-yet-loaded is not the same as "you are in no Groups". */
  const defaultGroupId =
    defaultGroupOptions === undefined ||
    state.data.defaultGroupId === null ||
    defaultGroupOptions.some((group) => group.id === state.data.defaultGroupId)
      ? state.data.defaultGroupId
      : null;
  const motion = useMotionPreference();
  const scheme = useSchemePreference();

  const mutationError = update.isError && update.error instanceof Error ? update.error.message : null;
  const isDirty = username !== state.baseline.username || avatarUrl !== state.baseline.avatarUrl || defaultGroupChanged;

  const slugPreview = (() => {
    try {
      return profileSlugBaseFromName(username);
    } catch {
      return null;
    }
  })();

  const draftInput: ProfileUserEditInput = {
    username,
    avatar_url: avatarUrl,
    ...(defaultGroupChanged ? { default_group_id: defaultGroupId } : {}),
  };
  const draftCheck = profileUserEditFormSchema.safeParse(draftInput);
  const warnings = draftCheck.success
    ? []
    : draftCheck.error.issues.map((issue) => {
        const field = issue.path[0] as keyof ProfileUserEditInput | undefined;
        const source =
          field === 'default_group_id' ? 'Default Group' : field === 'avatar_url' ? 'Avatar image URL' : 'Display name';
        return { source, complaint: issue.message, field };
      });

  const focusInvalidField = (field: keyof ProfileUserEditInput | undefined) => {
    setActiveTab(field === 'default_group_id' ? 'defaults' : 'profile');
    requestAnimationFrame(() => {
      const fieldRef =
        field === 'default_group_id' ? defaultGroupRef : field === 'avatar_url' ? avatarUrlRef : usernameRef;
      fieldRef.current?.focus();
    });
  };

  const header = useEditPageHeader({
    warnings,
    onFocusWarning: (warning) => focusInvalidField(warning.field),
  });
  const commitSaved = header.releasing(
    (entry: { username: string; avatarUrl: string; defaultGroupId: string | null }) =>
      dispatch({ kind: 'saved', entry })
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draftCheck.success) {
      focusInvalidField(warnings[0]?.field);
      return;
    }

    const previousSlug = initial.slug;
    update.mutate(
      { input: draftCheck.data },
      {
        onSuccess: (entry, _variables, defaultGroupUnavailable) => {
          commitSaved({
            username: entry.username ?? '',
            avatarUrl: entry.avatar_url ?? '',
            defaultGroupId: entry.default_group_id ?? null,
          });

          if (defaultGroupUnavailable) {
            window.alert('Profile saved, but the selected default Group was no longer available.');
          }
          if (previousSlug !== entry.slug) {
            navigate({
              to: '/profiles/$profileSlug',
              params: { profileSlug: entry.slug },
              replace: true,
            });
          }
        },
      }
    );
  };

  const panelError = mutationError ? <FormError title="Profile could not be saved">{mutationError}</FormError> : null;

  const tabs = [
    {
      value: 'profile',
      label: 'Profile',
      icon: <CircleUserRound size={20} />,
      panel: (
        <Stack gap="md">
          {panelError}
          <ControlBlock
            title="Display name *"
            description={
              <>
                Letters and numbers only, 5–30 characters, not all capitals.
                {slugPreview ? (
                  <>
                    {' '}
                    <SlugRenameNotice
                      noun="profile"
                      url={'…/profiles/' + slugPreview}
                      note="A number is appended when the derived id is already taken."
                    />
                  </>
                ) : null}
              </>
            }
            input={
              <TextInput
                ref={usernameRef}
                aria-label="Display name"
                required
                value={username}
                onChange={(event) => dispatch({ kind: 'patch', update: { username: event.target.value } })}
                autoComplete="nickname"
                maxLength={30}
              />
            }
          />
          <ControlBlock
            title="Avatar image URL *"
            description={
              <>
                Must be a full <code>https://</code> URL.
              </>
            }
            input={
              <TextInput
                ref={avatarUrlRef}
                aria-label="Avatar image URL"
                required
                type="url"
                value={avatarUrl}
                onChange={(event) => dispatch({ kind: 'patch', update: { avatarUrl: event.target.value } })}
                placeholder="https://…"
                autoComplete="off"
              />
            }
          />
          <AvatarPreview avatarUrl={avatarUrl} username={username} />
        </Stack>
      ),
    },
    {
      value: 'defaults',
      label: 'Creation defaults',
      icon: <UsersRound size={20} />,
      panel: (
        <Stack gap="md">
          {panelError}
          <ControlBlock
            title="Default Group"
            description="New rulesets and factions use this Group when it is still available. You can change an item’s Group after its first save."
            input={
              <Select
                ref={defaultGroupRef}
                aria-label="Default Group"
                /* Not yet loaded is not the same as "you are in no Groups", and an enabled control
                   offering only "No default Group" says the second. The derivation above gates on
                   the same distinction; this is the other half of it. */
                disabled={defaultGroupOptions === undefined}
                value={defaultGroupId ?? ''}
                onChange={(value) =>
                  dispatch({ kind: 'patch', update: { defaultGroupId: value || null, defaultGroupChanged: true } })
                }
                data={[
                  { value: '', label: 'No default Group' },
                  ...(defaultGroupOptions ?? []).map((group) => ({ value: group.id, label: group.name })),
                ]}
                clearable
              />
            }
          />
        </Stack>
      ),
    },
    {
      value: 'appearance',
      label: 'Appearance',
      icon: <Palette size={20} />,
      panel: (
        <Stack gap="xl">
          {panelError}
          <PreferenceSegments<MotionPreference>
            label="Ambient motion"
            note="The masthead video and the turning dice"
            options={[
              { value: 'system', label: 'System' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
            value={motion}
            onChange={(next) => setMotionOverride(next === 'system' ? null : next)}
          />
          <PreferenceSegments<SchemePreference>
            label="Color scheme"
            note="Follow the system, or pin light or dark"
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            value={scheme}
            onChange={setSchemePreference}
          />
        </Stack>
      ),
    },
    {
      value: 'account',
      label: 'Account',
      icon: <Trash2 size={20} />,
      panel: (
        <Stack gap="md" align="flex-start">
          {/* Save is reachable from every tab through the toolbar, so its failure must be visible on every tab too. */}
          {panelError}
          <div>
            <Text fw={650}>Delete account</Text>
            <Text c="dimmed" size="sm">
              Review your direct ownership and choose what happens to it on a dedicated page.
            </Text>
          </div>
          <Button
            color="red"
            variant="light"
            renderRoot={(rootProps) => (
              <Link {...rootProps} to="/profiles/$profileSlug/delete" params={{ profileSlug: initial.slug }} />
            )}
          >
            Delete account
          </Button>
        </Stack>
      ),
    },
  ] as const;

  const toolbar = (
    <Toolbar>
      <Toolbar.Left>
        <IconAction
          label="Back to profiles"
          emphasis="standard"
          intent="neutral"
          size="lg"
          renderRoot={(rootProps) => <Link {...rootProps} to="/profiles" />}
          icon={<ArrowLeft size={16} aria-hidden />}
        />
        <IconAction
          label="View public profile"
          emphasis="standard"
          intent="neutral"
          size="lg"
          renderRoot={(rootProps) => (
            <Link {...rootProps} to="/profiles/$profileSlug" params={{ profileSlug: initial.slug }} />
          )}
          icon={<User size={16} aria-hidden />}
        />
      </Toolbar.Left>
      <Toolbar.Right>
        <SubmitAction
          form={formId}
          pending={update.isPending}
          disabled={!isDirty}
          icon={<Save size={17} aria-hidden />}
        >
          Save profile
        </SubmitAction>
      </Toolbar.Right>
    </Toolbar>
  );

  return (
    <PageLayout>
      {header.slot}
      <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
      <PageLayout.Content>
        <form id={formId} onSubmit={handleSubmit} onBlurCapture={header.settle}>
          <ConnectedTabs
            value={activeTab}
            onValueChange={(next) => {
              setActiveTab(next);
              header.settle();
            }}
            ariaLabel="Profile settings sections"
            items={tabs}
          />
        </form>
      </PageLayout.Content>
    </PageLayout>
  );
}

export const Route = createFileRoute('/_app/profiles/$profileSlug/edit')({
  component: ProfileSettingsPage,
});

function ProfileSettingsPage() {
  const { profileSlug } = Route.useParams();
  const viewer = useSessionViewer();

  switch (viewer.kind) {
    case 'pending':
      return (
        <PageMessage
          title="Profile settings"
          back={<PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>}
        >
          <LoadPending title="Loading your profile">Checking whether you are signed in.</LoadPending>
        </PageMessage>
      );
    case 'signed-out':
      return (
        <PageMessage
          title="Profile settings"
          back={<PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>}
        >
          <LoginGate action="edit your profile" />
        </PageMessage>
      );
    default:
      break;
  }

  if (viewer.profile.slug !== profileSlug) {
    /* The way out is the reader's own settings rather than a step backwards: they asked for this
       page and there is a version of it that is theirs. */
    return (
      <PageMessage
        title="Profile settings"
        back={
          <PageMessage.Back to="/profiles/$profileSlug/edit" params={{ profileSlug: viewer.profile.slug }}>
            Go to your profile settings
          </PageMessage.Back>
        }
      >
        <NotAvailable title="This is not your profile">You can only edit your own profile.</NotAvailable>
      </PageMessage>
    );
  }

  return <EditableProfilePage key={viewer.profile.slug} initial={viewer.profile} />;
}
