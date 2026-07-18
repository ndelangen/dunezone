import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { type GroupEntry, useUpdateGroup } from '@db/groups';
import { FormField } from '@app/components/form/FormField';
import { TextField } from '@app/components/form/TextField';
import { ButtonGroup, Stack } from '@app/components/generic/layout';
import { UIButton } from '@app/components/generic/ui/UIButton';
import { groupInputSchema } from '@app/groups/validation';

export function GroupSettingsForm({ initial }: { initial: GroupEntry }) {
  const navigate = useNavigate();
  const updateGroup = useUpdateGroup();
  const [name, setName] = useState(initial.name);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setName(initial.name);
  }, [initial.name]);

  const mutationError =
    updateGroup.isError && updateGroup.error instanceof Error ? updateGroup.error.message : null;
  const fieldError = submitError ?? mutationError;
  const canSave = !updateGroup.isPending && name.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const parsed = groupInputSchema.safeParse({ name: name.trim() });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(' ');
      setSubmitError(msg || 'Invalid group name');
      return;
    }
    const prevSlug = initial.slug;
    updateGroup.mutate(
      { id: initial.id, input: parsed.data },
      {
        onSuccess: (entry) => {
          setSubmitError(null);
          if (prevSlug !== entry.slug) {
            navigate({
              to: '/groups/$groupSlug/edit',
              params: { groupSlug: entry.slug },
              replace: true,
            });
          }
        },
        onError: (err) => setSubmitError(err.message),
      }
    );
  };

  return (
    <Stack as="form" gap={3} onSubmit={handleSubmit}>
      <FormField
        label="Group name"
        htmlFor="group-settings-name"
        error={fieldError}
        hint="Renaming may change this group's URL slug. Bookmarks and shared links that use the old address may stop working until updated."
      >
        <TextField
          id="group-settings-name"
          name="name"
          required
          minLength={1}
          title="Group name may only contain letters and numbers"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (submitError) setSubmitError(null);
          }}
        />
      </FormField>
      <ButtonGroup>
        <UIButton type="submit" iconOnly={false} disabled={!canSave}>
          {updateGroup.isPending ? 'Saving…' : 'Save group'}
        </UIButton>
      </ButtonGroup>
    </Stack>
  );
}
