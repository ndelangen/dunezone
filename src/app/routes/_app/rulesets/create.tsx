import { Button, Group, Stack, TextInput } from '@mantine/core';
import { rulesetAboutSchema } from '@shared/rulesets/validation';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { PageTitle } from '@ui/block/PageTitle';
import { rulesetAboutHint } from '@ui/content/rulesetAboutHint';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, Plus } from 'lucide-react';
import { useReducer } from 'react';

import { useSessionViewer } from '@db/profiles';
import { useCreateRuleset } from '@db/rulesets';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

export const Route = createFileRoute('/_app/rulesets/create')({
  component: CreateRulesetPage,
});

function CreateRulesetForm() {
  const navigate = useNavigate();
  const createRuleset = useCreateRuleset();
  /* One draft, one reducer (the state rule), matching the edit twin's single patch arm. */
  const [draft, dispatch] = useReducer(
    (state: { name: string; about: string }, event: { kind: 'patch'; update: Partial<typeof state> }) => ({
      ...state,
      ...event.update,
    }),
    { name: '', about: '' }
  );
  const { name, about } = draft;

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
        onChange={(event) => dispatch({ kind: 'patch', update: { name: event.target.value } })}
      />
      <FormattedTextInput
        label="About"
        name="about"
        description={rulesetAboutHint(about)}
        error={aboutError}
        required
        autosize
        minRows={4}
        value={about}
        onChange={(next) => dispatch({ kind: 'patch', update: { about: next } })}
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
  const viewer = useSessionViewer();

  /* An early return rather than a branch inside the content, which is what the other four gates
     always were: a page that cannot be used is a different page, not this one with its form
     swapped out for a sentence. The toolbar goes with it, since the frame carries the way back. */
  switch (viewer.kind) {
    case 'pending':
      return (
        <PageMessage title="Create ruleset" back={<PageMessage.Back to="/rulesets">Back to rulesets</PageMessage.Back>}>
          <LoadPending title="Loading your profile">Checking whether you are signed in.</LoadPending>
        </PageMessage>
      );
    case 'signed-out':
      return (
        <PageMessage title="Create ruleset" back={<PageMessage.Back to="/rulesets">Back to rulesets</PageMessage.Back>}>
          <LoginGate action="create a ruleset" />
        </PageMessage>
      );
    default:
      break;
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
              emphasis="standard"
              intent="neutral"
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
