import { Box, Center, Image, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core';
import { profileSlugBaseFromName, profileUserEditFormSchema } from '@shared/profiles/validation';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { SlugRenameNotice } from '@ui/content/SlugRenameNotice';
import { IconAction } from '@ui/control/IconAction';
import { SubmitAction } from '@ui/control/SubmitAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, CircleUserRound, Palette, User, UsersRound } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { useCurrentProfile, useUpdateCurrentProfile } from '@db/profiles';
import type { CurrentProfileEntry, ProfileUserEditInput } from '@db/profiles';
import { setSchemePreference, useSchemePreference } from '@app/styles/colorScheme';
import type { SchemePreference } from '@app/styles/colorScheme';
import { setMotionOverride, useMotionPreference } from '@app/styles/motion';
import type { MotionPreference } from '@app/styles/motion';

type ProfileTab = 'profile' | 'defaults' | 'appearance';
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
  const labelId = useId();
  const noteId = useId();

  return (
    <Stack gap={4}>
      <Text fw={650} id={labelId}>
        {label}
      </Text>
      <Text c="dimmed" id={noteId} size="sm">
        {note}
      </Text>
      <SegmentedControl
        aria-labelledby={labelId}
        aria-describedby={noteId}
        data={[...options]}
        value={value}
        onChange={(next) => onChange(next as Value)}
        fullWidth
      />
    </Stack>
  );
}

function EditableProfilePage({ initial }: { initial: CurrentProfileEntry }) {
  const navigate = useNavigate();
  const update = useUpdateCurrentProfile();
  const formId = 'profile-settings-' + useId().replaceAll(':', '');
  const usernameRef = useRef<HTMLInputElement>(null);
  const avatarUrlRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [username, setUsername] = useState(initial.username ?? '');
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url ?? '');
  const [defaultGroupId, setDefaultGroupId] = useState<string | null>(initial.default_group_id);
  const [defaultGroupChanged, setDefaultGroupChanged] = useState(false);
  const [savedProfile, setSavedProfile] = useState({
    username: initial.username ?? '',
    avatarUrl: initial.avatar_url ?? '',
  });
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const motion = useMotionPreference();
  const scheme = useSchemePreference();

  useEffect(() => {
    if (defaultGroupId && !initial.default_group_options.some((group) => group.id === defaultGroupId)) {
      setDefaultGroupId(null);
    }
  }, [defaultGroupId, initial.default_group_options]);

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
    setActiveTab('profile');
    requestAnimationFrame(() => {
      (field === 'avatar_url' ? avatarUrlRef.current : usernameRef.current)?.focus();
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
          <TextInput
            ref={usernameRef}
            label="Display name"
            required
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
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="nickname"
            maxLength={30}
          />
          <TextInput
            ref={avatarUrlRef}
            label="Avatar image URL"
            required
            description={
              <>
                Must be a full <code>https://</code> URL.
              </>
            }
            type="url"
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://…"
            autoComplete="off"
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
          <Select
            label="Default Group"
            description="New rulesets and factions use this Group when it is still available. You can change an item’s Group after its first save."
            value={defaultGroupId ?? ''}
            onChange={(value) => {
              setDefaultGroupId(value || null);
              setDefaultGroupChanged(true);
            }}
            data={[
              { value: '', label: 'No default Group' },
              ...initial.default_group_options.map((group) => ({ value: group.id, label: group.name })),
            ]}
            clearable
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
          color="dune"
          size="lg"
          renderRoot={(rootProps) => (
            <Link {...rootProps} to="/profiles/$profileSlug" params={{ profileSlug: initial.slug }} />
          )}
          icon={<User size={16} aria-hidden />}
        />
      </Toolbar.Left>
      <Toolbar.Right>
        <SubmitAction form={formId} pending={update.isPending} disabled={!isDirty} size="lg">
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
      <PageLayout>
        <PageLayout.Content>
          <Surface padding="lg">
            <p>
              <Link to="/auth/login">Log in</Link> to edit your profile.
            </p>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  if (profile.data.slug !== profileSlug) {
    return (
      <PageLayout>
        <PageLayout.Content>
          <Surface padding="lg">
            <p>You can only edit your own profile.</p>
            <p>
              <Link to="/profiles/$profileSlug/edit" params={{ profileSlug: profile.data.slug }}>
                Go to your profile settings
              </Link>
            </p>
          </Surface>
        </PageLayout.Content>
      </PageLayout>
    );
  }

  return <EditableProfilePage key={profile.data.slug} initial={profile.data} />;
}
