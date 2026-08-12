import { Button, Group, Stack } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { FormField } from '@ui/control/FormField';
import { TextField } from '@ui/control/TextField';
import { useState } from 'react';

import { useUpdateCurrentProfile } from '@db/profiles';
import type { ProfileEntry } from '@db/profiles';
import { profileSlugBaseFromName } from '@app/profile/validation';

export function ProfileSettingsForm({ initial }: { initial: ProfileEntry }) {
  const navigate = useNavigate();
  const update = useUpdateCurrentProfile();

  const [username, setUsername] = useState(initial.username ?? '');
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url ?? '');

  const basePreview = profileSlugBaseFromName(username);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const prevSlug = initial.slug;
    update.mutate(
      { input: { username, avatar_url: avatarUrl } },
      {
        onSuccess: (entry) => {
          if (prevSlug !== entry.slug) {
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

  const mutationError =
    update.isError && update.error instanceof Error ? update.error.message : null;

  return (
    <Stack component="form" gap="sm" onSubmit={handleSubmit}>
      <FormField
        label="Display name"
        htmlFor="profile-display-name"
        hint={
          <>
            Letters and numbers only, 5–30 characters, not all capitals. Your public profile URL
            uses an id derived from this name (e.g. <code>…/profiles/{basePreview}</code>, with a
            number suffix if needed). If you rename, that id and the URL can change, so older links
            may break—including bookmarks and pasted links.
          </>
        }
      >
        <TextField
          id="profile-display-name"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="nickname"
          maxLength={30}
        />
      </FormField>

      <FormField
        label="Avatar image URL"
        htmlFor="profile-avatar-url"
        hint={
          <>
            Must be a full <code>https://</code> URL. Avatar URL is required.
          </>
        }
      >
        <TextField
          id="profile-avatar-url"
          type="url"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://…"
          autoComplete="off"
        />
      </FormField>

      {mutationError && <p role="alert">{mutationError}</p>}
      <Group gap="xs" wrap="nowrap">
        <Button variant="filled" color="confirm" type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save profile'}
        </Button>
      </Group>
    </Stack>
  );
}
