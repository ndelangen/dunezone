import { Alert, Button, Group, Stack, TextInput } from '@mantine/core';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { useUpdateRuleset } from '@db/rulesets';
import type { RulesetEntry } from '@db/rulesets';

export function RulesetSettingsForm({
  initial,
  canRename,
}: {
  initial: RulesetEntry;
  canRename: boolean;
}) {
  const navigate = useNavigate();
  const updateRuleset = useUpdateRuleset();

  const [name, setName] = useState(initial.name);
  const [coverUrl, setCoverUrl] = useState(initial.image_cover ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextName = name.trim();
    if (!nextName) {
      return;
    }
    const trimmedCover = coverUrl.trim();
    const prevSlug = initial.slug;
    try {
      const entry = await updateRuleset.mutateAsync({
        id: initial._id,
        input: { name: nextName },
        imageCover: trimmedCover === '' ? null : trimmedCover,
      });
      if (prevSlug !== entry.slug) {
        navigate({
          to: '/rulesets/$rulesetSlug/edit',
          params: { rulesetSlug: entry.slug },
          replace: true,
        });
      }
    } catch {
      /* mutation surfaces error via isError */
    }
  };

  const mutationError =
    updateRuleset.isError && updateRuleset.error instanceof Error
      ? updateRuleset.error.message
      : null;

  return (
    <Stack component="form" gap="md" onSubmit={handleSubmit}>
      <TextInput
        id="ruleset-settings-name"
        name="name"
        label="Name"
        description={
          canRename ? (
            <>
              Changing the name updates the URL slug (e.g. <code>…/rulesets/{initial.slug}</code>{' '}
              may change). Bookmarks and shared links to the old address will stop working.
            </>
          ) : (
            'Only the ruleset owner can rename it.'
          )
        }
        required
        minLength={1}
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        disabled={!canRename}
      />

      <TextInput
        id="ruleset-settings-cover"
        type="url"
        label="Cover image URL"
        description={
          <>
            Optional. Use a full <code>https://</code> URL. Leave empty to clear the cover.
          </>
        }
        value={coverUrl}
        onChange={(event) => setCoverUrl(event.currentTarget.value)}
        placeholder="https://…"
        autoComplete="off"
      />

      {mutationError ? (
        <Alert color="red" title="Ruleset could not be saved" role="alert">
          {mutationError}
        </Alert>
      ) : null}

      <Group justify="flex-end">
        <Button type="submit" loading={updateRuleset.isPending} disabled={name.trim().length === 0}>
          {updateRuleset.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </Group>
    </Stack>
  );
}
