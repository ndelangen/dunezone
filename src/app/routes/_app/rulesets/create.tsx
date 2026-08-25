import { Button, Group, Stack, Textarea, TextInput } from '@mantine/core';
import { rulesetAboutSchema } from '@shared/rulesets/validation';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { LoginGate } from '@ui/block/LoginGate';
import { PageTitle } from '@ui/block/PageTitle';
import { rulesetAboutHint } from '@ui/content/rulesetAboutHint';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';

import { useCurrentProfile } from '@db/profiles';
import { useCreateRuleset } from '@db/rulesets';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

export const Route = createFileRoute('/_app/rulesets/create')({
  component: CreateRulesetPage,
});

function CreateRulesetForm() {
  const navigate = useNavigate();
  const createRuleset = useCreateRuleset();
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');

  const aboutCheck = rulesetAboutSchema.safeParse(about);
  /** Only complain about an About that has been started and left short; an empty one is covered by the requirement line. */
  const aboutError = about.trim().length > 0 && !aboutCheck.success ? aboutCheck.error.issues[0]?.message : undefined;

  return (
    <Stack
      component="form"
      gap="sm"
      onSubmit={(e) => {
        e.preventDefault();
        const nextName = name.trim();
        if (!nextName || !aboutCheck.success) {
          return;
        }
        createRuleset.mutate(
          { input: { name: nextName, about: aboutCheck.data } },
          {
            onSuccess: (entry) => {
              navigate({
                to: '/rulesets/$rulesetSlug',
                params: { rulesetSlug: entry.slug },
                search: entry.route_notice ? { notice: entry.route_notice } : {},
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
        label="About"
        name="about"
        description={rulesetAboutHint(about)}
        error={aboutError}
        required
        autosize
        minRows={4}
        value={about}
        onChange={(event) => setAbout(event.currentTarget.value)}
      />
      {createRuleset.error ? (
        <FormError title="Ruleset could not be created">{createRuleset.error.message}</FormError>
      ) : null}
      <Group gap="xs" wrap="nowrap">
        <Button
          variant="filled"
          color="confirm"
          type="submit"
          disabled={createRuleset.isPending || name.trim().length === 0 || !aboutCheck.success}
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

  /* An early return rather than a branch inside the content, which is what the other four gates
     always were: a page that cannot be used is a different page, not this one with its form
     swapped out for a sentence. The toolbar goes with it, since the frame carries the way back. */
  if (!profile.data?.user_id) {
    return (
      <PageMessage title="Create ruleset" back={<PageMessage.Back to="/rulesets">Back to rulesets</PageMessage.Back>}>
        <LoginGate action="create a ruleset" />
      </PageMessage>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header>
        <PageTitle title="Create ruleset" />
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
        <Surface padding="lg">
          <CreateRulesetForm />
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}
