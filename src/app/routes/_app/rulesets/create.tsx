import { Button, Group, NativeSelect, Stack, Textarea, TextInput } from '@mantine/core';
import { RULESET_DESCRIPTION_MIN_LENGTH, rulesetDescriptionSchema } from '@shared/rulesets/validation';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';

import { useGroupsByCreator } from '@db/groups';
import { useCurrentProfile } from '@db/profiles';
import { useCreateRuleset } from '@db/rulesets';

export const Route = createFileRoute('/_app/rulesets/create')({
  component: CreateRulesetPage,
});

function CreateRulesetForm({ ownerUserId }: { ownerUserId: string }) {
  const navigate = useNavigate();
  const createRuleset = useCreateRuleset();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const groups = useGroupsByCreator(ownerUserId);

  const descriptionCheck = rulesetDescriptionSchema.safeParse(description);
  /** Only complain about a description that has been started and left short; an empty one is covered by the requirement line. */
  const descriptionError =
    description.trim().length > 0 && !descriptionCheck.success ? descriptionCheck.error.issues[0]?.message : undefined;

  return (
    <Stack
      component="form"
      gap="sm"
      onSubmit={(e) => {
        e.preventDefault();
        const nextName = name.trim();
        if (!nextName || !descriptionCheck.success) {
          return;
        }
        createRuleset.mutate(
          { input: { name: nextName, description: descriptionCheck.data }, groupId: groupId ?? null },
          {
            onSuccess: (entry) => {
              navigate({
                to: '/rulesets/$rulesetSlug',
                params: { rulesetSlug: entry.slug },
              });
            },
          }
        );
      }}
    >
      <TextInput
        label="Name"
        error={createRuleset.error?.message}
        name="name"
        required
        minLength={1}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Textarea
        label="Description"
        name="description"
        description={`What this ruleset is for, and how it differs from the base game. At least ${RULESET_DESCRIPTION_MIN_LENGTH} characters — ${description.trim().length} so far.`}
        error={descriptionError}
        required
        autosize
        minRows={4}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <NativeSelect
        label="Group"
        name="group"
        value={groupId ?? ''}
        onChange={(event) => setGroupId(event.target.value === '' ? null : event.target.value)}
        data={[
          { value: '', label: 'No group' },
          ...(groups.data?.map((group) => ({ value: group.id, label: group.name })) ?? []),
        ]}
      />
      <Group gap="xs" wrap="nowrap">
        <Button
          variant="filled"
          color="confirm"
          type="submit"
          disabled={createRuleset.isPending || name.trim().length === 0 || !descriptionCheck.success}
        >
          <Plus size={16} aria-hidden />
          <span>{createRuleset.isPending ? 'Creating…' : 'Create'}</span>
        </Button>
      </Group>
    </Stack>
  );
}

function CreateRulesetPage() {
  const profile = useCurrentProfile();

  return (
    <PageLayout>
      <PageLayout.Header>
        <h1>Create ruleset</h1>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <IconAction
              label="Back to rulesets"
              variant="light"
              color="gray"
              size="lg"
              renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}
              icon={<ArrowLeft size={16} aria-hidden />}
            />
          </Toolbar.Left>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        {!profile.data?.user_id ? (
          <Surface padding="lg">
            <p>
              <Link to="/auth/login">Log in</Link> to create a ruleset.
            </p>
            <p>
              <Link to="/rulesets">Back to rulesets</Link>
            </p>
          </Surface>
        ) : (
          <Surface padding="lg">
            <CreateRulesetForm ownerUserId={profile.data.user_id} />
          </Surface>
        )}
      </PageLayout.Content>
    </PageLayout>
  );
}
