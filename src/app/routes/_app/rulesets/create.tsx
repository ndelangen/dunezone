import { Button, Group, Stack, Textarea, TextInput } from '@mantine/core';
import { rulesetDescriptionSchema } from '@shared/rulesets/validation';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { rulesetDescriptionHint } from '@ui/content/rulesetDescriptionHint';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';

import { useCurrentProfile } from '@db/profiles';
import { useCreateRuleset } from '@db/rulesets';

export const Route = createFileRoute('/_app/rulesets/create')({
  component: CreateRulesetPage,
});

function CreateRulesetForm() {
  const navigate = useNavigate();
  const createRuleset = useCreateRuleset();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

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
          { input: { name: nextName, description: descriptionCheck.data } },
          {
            onSuccess: (entry) => {
              if (entry.default_group_unavailable) {
                window.alert('Ruleset saved, but its default Group was no longer available.');
              }
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
        name="name"
        required
        minLength={1}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Textarea
        label="Description"
        name="description"
        description={rulesetDescriptionHint(description)}
        error={descriptionError}
        required
        autosize
        minRows={4}
        value={description}
        onChange={(event) => setDescription(event.currentTarget.value)}
      />
      {createRuleset.error ? (
        <FormError title="Ruleset could not be created">{createRuleset.error.message}</FormError>
      ) : null}
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
            <CreateRulesetForm />
          </Surface>
        )}
      </PageLayout.Content>
    </PageLayout>
  );
}
