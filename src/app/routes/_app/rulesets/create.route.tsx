import { Stack, TextInput } from '@mantine/core';
import { rulesetAboutSchema, rulesetNameSchema } from '@shared/rulesets/validation';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { PageTitle } from '@ui/block/PageTitle';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { RULESET_ABOUT_HELP, rulesetAboutCount } from '@ui/content/rulesetAboutHint';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FORMATTED_TEXT_SYNTAX_HELP, FormattedTextInput } from '@ui/control/FormattedTextInput';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { useReducer } from 'react';

import { useSessionViewer } from '@db/profiles';
import { useCreateRuleset } from '@db/rulesets';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

export const Route = createFileRoute('/_app/rulesets/create')({
  component: CreateRulesetPage,
});

const EMPTY_DRAFT = { name: '', about: '' };

function CreateRulesetForm() {
  const navigate = useNavigate();
  const createRuleset = useCreateRuleset();
  /* One draft, one reducer (the state rule): a patch arm for typing and a reset arm for the toolbar's Reset. */
  const [draft, dispatch] = useReducer(
    (
      state: { name: string; about: string },
      event: { kind: 'patch'; update: Partial<typeof state> } | { kind: 'reset' }
    ) => (event.kind === 'reset' ? EMPTY_DRAFT : { ...state, ...event.update }),
    EMPTY_DRAFT
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

  const saveState: AuthoringSaveState = createRuleset.isPending
    ? 'saving'
    : createRuleset.error
      ? 'error'
      : createRuleset.data !== undefined
        ? 'saved'
        : 'idle';

  /* The same schemas the mutation parses with, checked here so a wrong field is a header complaint, never a thrown parse. */
  const submit = () => {
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
  };

  return (
    <PageLayout>
      {/* The layout keeps one masthead: the warnings band while complaints stand, the title otherwise, as on every authoring page. */}
      {validationHeader.slot ?? (
        <PageLayout.Header>
          <PageTitle title="Create ruleset" />
        </PageLayout.Header>
      )}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          status={{ isDirty: name !== '' || about !== '', isNameBlank: name.trim() === '', saveState }}
          copy={{
            saveLabel: 'Create ruleset',
            nameBlankMessage: 'Add a ruleset name before creating; it determines the ruleset URL.',
            statusMessage: createRuleset.error?.message,
          }}
          actions={{
            onSave: submit,
            onReset: validationHeader.releasing(() => {
              dispatch({ kind: 'reset' });
              createRuleset.reset();
            }),
            onBack: () => navigate({ to: '/rulesets' }),
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Surface padding="lg">
          <Stack
            component="form"
            gap="md"
            onBlurCapture={validationHeader.settle}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <ControlBlock
              title="Name"
              description="The name determines the ruleset URL."
              input={
                <TextInput
                  id="ruleset-create-name"
                  aria-label="Name"
                  name="name"
                  required
                  error={nameError}
                  value={name}
                  onChange={(event) => dispatch({ kind: 'patch', update: { name: event.currentTarget.value } })}
                />
              }
            />
            <ControlBlock
              title="About"
              description={`${RULESET_ABOUT_HELP} ${FORMATTED_TEXT_SYNTAX_HELP}`}
              input={
                <FormattedTextInput
                  id="ruleset-create-about"
                  aria-label="About"
                  name="about"
                  description={rulesetAboutCount(about)}
                  error={aboutError}
                  required
                  autosize
                  minRows={4}
                  value={about}
                  onChange={(next) => dispatch({ kind: 'patch', update: { about: next } })}
                />
              }
            />
            {createRuleset.error ? (
              <FormError title="Ruleset could not be created">{createRuleset.error.message}</FormError>
            ) : null}
          </Stack>
        </Surface>
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
