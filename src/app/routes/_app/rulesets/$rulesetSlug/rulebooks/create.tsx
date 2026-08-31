import { Alert, Button, Group, Radio, Select, Stack, Text, TextInput } from '@mantine/core';
import { rulebookNameKey, rulebookNameSchema } from '@shared/rulebooks/metadata';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { useReducer } from 'react';

import { loadRulebookCreationPage, useCreateRulebook, useRulebookCreationPage } from '@db/rulebooks';
import type { RulebookCreateSource, RulebookCreationPageData } from '@db/rulebooks';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/rulebooks/create')({
  loader: async ({ params }) => ({ page: await loadRulebookCreationPage(params.rulesetSlug) }),
  pendingComponent: () => (
    <PageMessage title="Create Rulebook">
      <LoadPending title="Loading Ruleset">Checking access and saved Rulebooks.</LoadPending>
    </PageMessage>
  ),
  errorComponent: CreateRulebookError,
  component: CreateRulebookPage,
});

function CreateRulebookError({ error }: ErrorComponentProps) {
  return (
    <PageMessage title="Create Rulebook" back={<PageMessage.Back to="/rulesets">Back to rulesets</PageMessage.Back>}>
      <LoadError title="Ruleset could not be loaded" stale={isStaleClientData(error)}>
        {error.message}
      </LoadError>
    </PageMessage>
  );
}

type CreationDraft = { name: string; source: 'starter' | 'clone'; cloneId: string | null };
type CreationEvent =
  | { kind: 'name'; value: string }
  | { kind: 'source'; value: 'starter' | 'clone' }
  | { kind: 'clone'; value: string | null };
function creationReducer(state: CreationDraft, event: CreationEvent): CreationDraft {
  switch (event.kind) {
    case 'name':
      return { ...state, name: event.value };
    case 'source':
      return { ...state, source: event.value };
    case 'clone':
      return { ...state, cloneId: event.value };
  }
}

function creationSubmission(draft: CreationDraft, page: RulebookCreationPageData) {
  const name = rulebookNameSchema.safeParse(draft.name);
  if (!name.success) {
    return { input: null, nameError: draft.name ? name.error.issues[0].message : undefined };
  }
  if (page.rulebooks.some((book) => rulebookNameKey(book.name) === rulebookNameKey(name.data))) {
    return { input: null, nameError: 'A Rulebook with this name already exists in this Ruleset.' };
  }
  const clone = page.rulebooks.find((book) => book._id === draft.cloneId);
  const source: RulebookCreateSource | null =
    draft.source === 'starter' ? { kind: 'starter' } : clone ? { kind: 'clone', rulebookId: clone._id } : null;
  return { input: source ? { rulesetId: page.ruleset._id, name: name.data, source } : null, nameError: undefined };
}

function CreateRulebookForm({ page }: { page: RulebookCreationPageData }) {
  const navigate = useNavigate();
  const create = useCreateRulebook();
  const [draft, send] = useReducer(creationReducer, { name: '', source: 'starter', cloneId: null });
  const { input, nameError } = creationSubmission(draft, page);
  return (
    <Stack
      component="form"
      gap="md"
      onSubmit={(event) => {
        event.preventDefault();
        if (!input || create.isPending) {
          return;
        }
        create.mutate(input, {
          onSuccess: ({ rulebook }) =>
            void navigate({
              to: '/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit',
              params: { rulesetSlug: page.ruleset.slug, rulebookSlug: rulebook.slug },
            }),
        });
      }}
    >
      <TextInput
        label="Rulebook name"
        name="name"
        required
        value={draft.name}
        disabled={create.isPending}
        error={nameError}
        onChange={(event) => send({ kind: 'name', value: event.currentTarget.value })}
      />
      <Radio.Group
        label="Start from"
        value={draft.source}
        onChange={(value) => {
          if (value === 'starter' || value === 'clone') {
            send({ kind: 'source', value });
          }
        }}
      >
        <Stack gap="sm">
          <Radio
            value="starter"
            label="Starter template"
            description="Begin with the application layouts and sample structured Blocks."
            disabled={create.isPending}
          />
          <Radio
            value="clone"
            label="Saved Rulebook"
            description="Copy a Rulebook from this Ruleset. Unsaved edits and Edition history are not copied."
            disabled={create.isPending || page.rulebooks.length === 0}
          />
        </Stack>
      </Radio.Group>
      {draft.source === 'clone' ? (
        <Select
          label="Rulebook to copy"
          placeholder="Choose a saved Rulebook"
          required
          searchable
          value={draft.cloneId}
          onChange={(value) => send({ kind: 'clone', value })}
          disabled={create.isPending}
          data={page.rulebooks.map((book) => ({ value: book._id, label: book.name }))}
        />
      ) : null}
      <Text size="sm" c="dimmed">
        Creates a saved draft and matching Edition 1. The new Rulebook opens with no local changes.
      </Text>
      {create.error ? (
        <Alert color="red" title="Rulebook could not be created">
          {create.error.message}
        </Alert>
      ) : null}
      <Group gap="sm">
        <Button type="submit" color="confirm" disabled={!input} loading={create.isPending}>
          Create Rulebook
        </Button>
        <Button
          variant="default"
          disabled={create.isPending}
          renderRoot={(props) => (
            <Link {...props} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: page.ruleset.slug }} />
          )}
        >
          Cancel
        </Button>
      </Group>
    </Stack>
  );
}

function CreateRulebookPage() {
  const { rulesetSlug } = Route.useParams();
  const { page: seed } = Route.useLoaderData();
  const { data: page } = useRulebookCreationPage(rulesetSlug, seed);
  const back = (
    <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug }}>
      Back to ruleset
    </PageMessage.Back>
  );
  if (!page) {
    return (
      <PageMessage title="Create Rulebook" back={back}>
        <NotAvailable title="Ruleset not found">This Ruleset does not exist or was deleted.</NotAvailable>
      </PageMessage>
    );
  }
  if (!page.viewerAccess.capabilities.edit) {
    return (
      <PageMessage title="Create Rulebook" back={back}>
        {page.viewerAccess.viewer.kind === 'anonymous' ? (
          <LoginGate action="create a Rulebook" />
        ) : (
          <NotAvailable title="Rulebook creation is unavailable">
            Only the Ruleset owner and active Group members may create Rulebooks.
          </NotAvailable>
        )}
      </PageMessage>
    );
  }
  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <PageTitle title="Create Rulebook" eyebrow={page.ruleset.name} />
      </PageLayout.Header>
      <PageLayout.Content>
        <Surface padding="lg">
          <CreateRulebookForm page={page} />
        </Surface>
      </PageLayout.Content>
    </PageLayout>
  );
}
