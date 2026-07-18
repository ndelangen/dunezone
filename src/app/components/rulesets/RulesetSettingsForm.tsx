import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { type RulesetEntry, useUpdateRuleset } from '@db/rulesets';
import { FormField } from '@app/components/form/FormField';
import { TextField } from '@app/components/form/TextField';
import { ButtonGroup, Stack } from '@app/components/generic/layout';
import { UIButton } from '@app/components/generic/ui/UIButton';

export function RulesetSettingsForm({ initial }: { initial: RulesetEntry }) {
  const navigate = useNavigate();
  const updateRuleset = useUpdateRuleset();

  const [name, setName] = useState(initial.name);
  const [coverUrl, setCoverUrl] = useState(initial.image_cover ?? '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextName = name.trim();
    if (!nextName) return;
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
    <Stack as="form" gap={3} onSubmit={handleSubmit}>
      <FormField
        label="Name"
        htmlFor="ruleset-settings-name"
        hint={
          <>
            Changing the name updates the URL slug (e.g. <code>…/rulesets/{initial.slug}</code> may
            change). Bookmarks and shared links to the old address will stop working.
          </>
        }
      >
        <TextField
          id="ruleset-settings-name"
          name="name"
          required
          minLength={1}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>

      <FormField
        label="Cover image URL"
        htmlFor="ruleset-settings-cover"
        hint={
          <>
            Optional. Use a full <code>https://</code> URL. Leave empty to clear the cover.
          </>
        }
      >
        <TextField
          id="ruleset-settings-cover"
          type="url"
          value={coverUrl}
          onChange={(event) => setCoverUrl(event.target.value)}
          placeholder="https://…"
          autoComplete="off"
        />
      </FormField>

      {mutationError && <p role="alert">{mutationError}</p>}

      <ButtonGroup>
        <UIButton
          type="submit"
          iconOnly={false}
          disabled={updateRuleset.isPending || name.trim().length === 0}
        >
          {updateRuleset.isPending ? 'Saving…' : 'Save changes'}
        </UIButton>
      </ButtonGroup>
    </Stack>
  );
}
