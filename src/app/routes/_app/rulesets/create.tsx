import { Button, Group, Stack, TextInput } from '@mantine/core';
import { rulesetAboutSchema, rulesetNameSchema } from '@shared/rulesets/validation';
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
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
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

  const nameCheck = rulesetNameSchema.safeParse(name);
  const aboutCheck = rulesetAboutSchema.safeParse(about);
  /* Only complain about a field that has been started and left wrong; an empty one is covered by the requirement line. */
  const nameError = name.trim().length > 0 && !nameCheck.success ? nameCheck.error.issues[0]?.message : undefined;
  const aboutError = about.trim().length > 0 && !aboutCheck.success ? aboutCheck.error.issues[0]?.message : undefined;
  /* Complaints reach the validation header as on every authoring page, and the fields repeat them where the author types. */
  const warnings = [
    ...(nameError ? [{ source: 'Name', complaint: nameError, focusId: 'ruleset-create-name' }] : []),
    ...(aboutError ? [{ source: 'About', complaint: aboutError, focusId: 'ruleset-create-about' }] : []),
  ];
  const validationHeader = useEditPageHeader({
    warnings,
    onFocusWarning: (warning) => document.getElementById(warning.focusId)?.focus(),
  });

  const form = (
    <Stack
      component="form"
      gap="sm"
      onBlurCapture={validationHeader.settle}
      onSubmit={(e) => {
        e.preventDefault();
        /* The same schemas the mutation parses with, checked here so a wrong name is a field error, never a thrown parse. */
        if (!nameCheck.success || !aboutCheck.success) {
          return;
        }
        createRuleset.mutate(
          { input: { name: nameCheck.data, about: aboutCheck.data } },
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
        id="ruleset-create-name"
        label="Name"
        name="name"
        required
        minLength={1}
        error={nameError}
        value={name}
        onChange={(event) => dispatch({ kind: 'patch', update: { name: event.target.value } })}
      />
      <FormattedTextInput
        id="ruleset-create-about"
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
          disabled={createRuleset.isPending || !nameCheck.success || !aboutCheck.success}
        >
          <Plus size={16} aria-hidden />
          <span>{createRuleset.isPending ? 'Creating…' : 'Create'}</span>
        </Button>
      </Group>
    </Stack>
  );

  return (
    <PageLayout>
      {/* The layout keeps one masthead: the warnings band while complaints stand, the title otherwise, as on every authoring page. */}
      {validationHeader.slot ?? (
        <PageLayout.Header>
          <PageTitle title="Create ruleset" />
        </PageLayout.Header>
      )}
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
        <Surface padding="lg">{form}</Surface>
      </PageLayout.Content>
    </PageLayout>
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

  return <CreateRulesetForm />;
}
