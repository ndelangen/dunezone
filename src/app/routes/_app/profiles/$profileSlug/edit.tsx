import { Box, Button, Center, Image, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core';
import { profileSlugBaseFromName, profileUserEditFormSchema } from '@shared/profiles/validation';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
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
import { useEffect, useId, useRef, useState } from 'react';

import { useCurrentProfile, useDefaultGroupPreference, useUpdateCurrentProfile } from '@db/profiles';
import type { CurrentProfileEntry, ProfileUserEditInput } from '@db/profiles';
import { setSchemePreference, useSchemePreference } from '@app/styles/colorScheme';
import type { SchemePreference } from '@app/styles/colorScheme';
import { setMotionOverride, useMotionPreference } from '@app/styles/motion';
import type { MotionPreference } from '@app/styles/motion';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

type ProfileTab = 'profile' | 'defaults' | 'appearance' | 'account';
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
  const [username, setUsername] = useState(initial.username ?? '');
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url ?? '');
  /* The raw column now, not the sanitized projection: `session` no longer joins memberships.
     The effect below corrects a default pointing at a Group the viewer left, once the options land. */
  const [defaultGroupId, setDefaultGroupId] = useState<string | null>(initial.default_group_id ?? null);
  const defaultGroupOptions = useDefaultGroupPreference().data?.default_group_options;
  const [defaultGroupChanged, setDefaultGroupChanged] = useState(false);
  const [savedProfile, setSavedProfile] = useState({
    username: initial.username ?? '',
    avatarUrl: initial.avatar_url ?? '',
  });
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const motion = useMotionPreference();
  const scheme = useSchemePreference();

  useEffect(() => {
    if (!defaultGroupOptions) {
      return;
    }
    if (defaultGroupId && !defaultGroupOptions.some((group) => group.id === defaultGroupId)) {
      setDefaultGroupId(null);
    }
  }, [defaultGroupId, defaultGroupOptions]);

  const mutationError = update.isError && update.error instanceof Error ? update.error.message : null;
  const visibleError = submissionError ?? mutationError;
  const isDirty = username !== savedProfile.username || avatarUrl !== savedProfile.avatarUrl || defaultGroupChanged;

  const slugPreview = (() => {
    try {
      return profileSlugBaseFromName(username);
    } catch {
      return null;
    }
  })();

  const focusInvalidField = (field: keyof ProfileUserEditInput | undefined) => {
    setActiveTab(field === 'default_group_id' ? 'defaults' : 'profile');
    requestAnimationFrame(() => {
      const fieldRef =
        field === 'default_group_id' ? defaultGroupRef : field === 'avatar_url' ? avatarUrlRef : usernameRef;
      fieldRef.current?.focus();
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmissionError(null);

    const input: ProfileUserEditInput = {
      username,
      avatar_url: avatarUrl,
      ...(defaultGroupChanged ? { default_group_id: defaultGroupId } : {}),
    };
    const parsed = profileUserEditFormSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setSubmissionError(parsed.error.issues.map((entry) => entry.message).join(' '));
      focusInvalidField(issue?.path[0] as keyof ProfileUserEditInput | undefined);
      return;
    }

    const previousSlug = initial.slug;
    update.mutate(
      { input: parsed.data },
      {
        onSuccess: (entry, _variables, defaultGroupUnavailable) => {
          const savedUsername = entry.username ?? '';
          const savedAvatarUrl = entry.avatar_url ?? '';
          setUsername(savedUsername);
          setAvatarUrl(savedAvatarUrl);
          setDefaultGroupId(entry.default_group_id ?? null);
          setDefaultGroupChanged(false);
          setSavedProfile({ username: savedUsername, avatarUrl: savedAvatarUrl });
          setSubmissionError(null);

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
        onError: (error) => {
          setSubmissionError(error.message);
          focusInvalidField(undefined);
        },
      }
    );
  };

  const panelError = visibleError ? <FormError title="Profile could not be saved">{visibleError}</FormError> : null;

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
                onChange={(event) => setUsername(event.target.value)}
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
                onChange={(event) => setAvatarUrl(event.target.value)}
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
                   offering only "No default Group" says the second. The effect above gates on the
                   same distinction; this is the other half of it. */
                disabled={defaultGroupOptions === undefined}
                value={defaultGroupId ?? ''}
                onChange={(value) => {
                  setDefaultGroupId(value || null);
                  setDefaultGroupChanged(true);
                }}
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
          variant="light"
          color="gray"
          size="lg"
          renderRoot={(rootProps) => <Link {...rootProps} to="/profiles" />}
          icon={<ArrowLeft size={16} aria-hidden />}
        />
        <IconAction
          label="View public profile"
          variant="light"
          color="gray"
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
      <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
      <PageLayout.Content>
        <form id={formId} onSubmit={handleSubmit}>
          <ConnectedTabs
            value={activeTab}
            onValueChange={setActiveTab}
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
  const profile = useCurrentProfile();

  if (!profile.data) {
    return (
      <PageMessage title="Profile settings" back={<PageMessage.Back to="/profiles">Back to profiles</PageMessage.Back>}>
        <LoginGate action="edit your profile" />
      </PageMessage>
    );
  }

  if (profile.data.slug !== profileSlug) {
    /* The way out is the reader's own settings rather than a step backwards: they asked for this
       page and there is a version of it that is theirs. */
    return (
      <PageMessage
        title="Profile settings"
        back={
          <PageMessage.Back to="/profiles/$profileSlug/edit" params={{ profileSlug: profile.data.slug }}>
            Go to your profile settings
          </PageMessage.Back>
        }
      >
        <NotAvailable title="This is not your profile">You can only edit your own profile.</NotAvailable>
      </PageMessage>
    );
  }

  return <EditableProfilePage key={profile.data.slug} initial={profile.data} />;
}
