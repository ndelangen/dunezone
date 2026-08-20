import { Group, Select, Stack, TextInput } from '@mantine/core';
import { profileSlugBaseFromName } from '@shared/profiles/validation';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { SlugRenameNotice } from '@ui/content/SlugRenameNotice';
import { IconAction } from '@ui/control/IconAction';
import { SubmitAction } from '@ui/control/SubmitAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, User } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useCurrentProfile, useUpdateCurrentProfile } from '@db/profiles';
import type { CurrentProfileEntry } from '@db/profiles';

function ProfileSettings({ initial }: { initial: CurrentProfileEntry }) {
  const navigate = useNavigate();
  const update = useUpdateCurrentProfile();
  const [username, setUsername] = useState(initial.username ?? '');
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url ?? '');
  const [defaultGroupId, setDefaultGroupId] = useState<string | null>(initial.default_group_id);
  const [defaultGroupChanged, setDefaultGroupChanged] = useState(false);

  useEffect(() => {
    if (defaultGroupId && !initial.default_group_options.some((group) => group.id === defaultGroupId)) {
      setDefaultGroupId(null);
    }
  }, [defaultGroupId, initial.default_group_options]);

  const mutationError = update.isError && update.error instanceof Error ? update.error.message : null;

  /* `profileSlugBaseFromName` throws when the name has no slug-able characters, and this field is
     controlled — so an empty or punctuation-only value would take the render down with it. There is
     nothing to preview in that case, which is also when the rename warning has nothing to warn
     about. */
  const slugPreview = (() => {
    try {
      return profileSlugBaseFromName(username);
    } catch {
      return null;
    }
  })();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const previousSlug = initial.slug;
    update.mutate(
      {
        input: {
          username,
          avatar_url: avatarUrl,
          ...(defaultGroupChanged ? { default_group_id: defaultGroupId } : {}),
        },
      },
      {
        onSuccess: (entry, _variables, defaultGroupUnavailable) => {
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

  return (
    <Stack component="form" gap="sm" onSubmit={handleSubmit}>
      <TextInput
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
                  url={`…/profiles/${slugPreview}`}
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

      <TextInput
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

      {mutationError ? <FormError title="Profile could not be saved">{mutationError}</FormError> : null}
      <Group gap="xs" wrap="nowrap">
        <SubmitAction pending={update.isPending}>Save profile</SubmitAction>
      </Group>
    </Stack>
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

  /* Hoisted: narrowing on `profile.data` does not survive into the renderRoot closure. */
  const ownSlug = profile.data.slug;

  const toolbar = (
    <Toolbar>
      <Toolbar.Left>
        <Group gap="xs" wrap="nowrap">
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
              <Link {...rootProps} to="/profiles/$profileSlug" params={{ profileSlug: ownSlug }} />
            )}
            icon={<User size={16} aria-hidden />}
          />
        </Group>
      </Toolbar.Left>
    </Toolbar>
  );

  return (
    <PageLayout>
      <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
      <PageLayout.Content>
        <Surface padding="lg">
          <ProfileSettings key={profile.data.slug} initial={profile.data} />
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}
