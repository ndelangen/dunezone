import { Alert, Box, Button, Group, Radio, Select, Stack, Text, TextInput } from '@mantine/core';
import { rulebookNameKey, rulebookNameSchema } from '@shared/rulebooks/metadata';
import type { RulebookRenderPageV1 } from '@shared/rulebooks/renderDocument';
import {
  DEFAULT_RULEBOOK_SETTINGS,
  getRulebookSize,
  rulebookDesignCatalogue,
  rulebookSizeCatalogue,
} from '@shared/rulebooks/settings';
import type { RulebookDesign, RulebookSettings, RulebookSize } from '@shared/rulebooks/settings';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { RulebookPreview } from '@ui/content/RulebookPreview';
import { ControlBlock } from '@ui/control/ControlBlock';
import { PreviewChoice } from '@ui/control/PreviewChoice';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { useId, useReducer } from 'react';

import { loadRulebookCreationPage, useCreateRulebook, useRulebookCreationPage } from '@db/rulebooks';
import type { RulebookCreateSource, RulebookCreationPageData } from '@db/rulebooks';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { RulebookPageRenderer } from '@game/rulebook/RulebookRenderer';

import styles from './create.module.css';

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

type CreationDraft = {
  name: string;
  source: 'starter' | 'clone';
  cloneId: string | null;
  starterSettings: RulebookSettings;
  cloneDesign: RulebookDesign | undefined;
};
type CreationEvent =
  | { kind: 'name'; value: string }
  | { kind: 'source'; value: 'starter' | 'clone' }
  | { kind: 'clone'; value: string | null }
  | { kind: 'size'; value: RulebookSize }
  | { kind: 'design'; value: RulebookDesign };
function creationReducer(state: CreationDraft, event: CreationEvent): CreationDraft {
  switch (event.kind) {
    case 'name':
      return { ...state, name: event.value };
    case 'source':
      return { ...state, source: event.value };
    case 'clone':
      return { ...state, cloneId: event.value, cloneDesign: undefined };
    case 'size':
      return { ...state, starterSettings: { ...state.starterSettings, size: event.value } };
    case 'design':
      return state.source === 'clone'
        ? { ...state, cloneDesign: event.value }
        : { ...state, starterSettings: { ...state.starterSettings, design: event.value } };
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
    draft.source === 'starter'
      ? { kind: 'starter', settings: draft.starterSettings }
      : clone
        ? { kind: 'clone', rulebookId: clone._id, design: draft.cloneDesign ?? clone.settings.design }
        : null;
  return { input: source ? { rulesetId: page.ruleset._id, name: name.data, source } : null, nameError: undefined };
}

function examplePage(id: string, pageNumber: number): RulebookRenderPageV1 {
  return {
    id,
    anchor: id,
    title: pageNumber === 2 ? 'Sequence of play' : 'Faction abilities',
    layoutId: 'chapter-opener',
    controlValues: { 'chapter-label': 'Basic game' },
    regions: [
      {
        key: 'feature',
        blocks: [
          {
            id: `${id}-rule`,
            kind: 'rule-group',
            title: pageNumber === 2 ? 'A game turn' : 'Your faction',
            text:
              pageNumber === 2
                ? 'Each game turn follows a sequence of phases. Resolve the current phase before moving to the next.'
                : 'Each faction brings its own advantages to the game. Keep its player sheet nearby as a reference.',
          },
          {
            id: `${id}-example`,
            kind: 'rule-group',
            title: pageNumber === 2 ? 'During a phase' : 'Alliances',
            text:
              pageNumber === 2
                ? 'Check the order of play, carry out the phase actions, and apply any relevant faction abilities.'
                : 'An alliance lets factions work together. Its benefits are described on the faction player sheets.',
          },
        ],
      },
    ],
  };
}

function SizeExample({ size, design, prefix }: RulebookSettings & { prefix: string }) {
  const dimensions = getRulebookSize(size);
  return (
    <div className={styles.sizeExample}>
      <div style={{ width: dimensions.widthMm, height: dimensions.heightMm }}>
        <RulebookPageRenderer page={examplePage(prefix, 2)} settings={{ size, design }} pageNumber={2} />
      </div>
    </div>
  );
}

function DesignExample({ settings, prefix }: { settings: RulebookSettings; prefix: string }) {
  return (
    <div className={styles.spread}>
      {[2, 3].map((pageNumber) => (
        <RulebookPageRenderer
          page={examplePage(`${prefix}-${pageNumber}`, pageNumber)}
          settings={settings}
          pageNumber={pageNumber}
          key={pageNumber}
        />
      ))}
    </div>
  );
}

/** Creation owns the selected values; these choices show their page proportions and facing-page treatment. */
function RulebookSettingsChoices({
  settings,
  onSizeChange,
  onDesignChange,
  disabled = false,
}: {
  settings: RulebookSettings;
  /** Omitted when a copy keeps its source Rulebook's Size. */
  onSizeChange?: (size: RulebookSize) => void;
  onDesignChange: (design: RulebookDesign) => void;
  disabled?: boolean;
}) {
  const prefix = `rulebook-choice-${useId().replace(/[^a-z0-9-]/gi, '')}`;
  const size = getRulebookSize(settings.size);
  return (
    <Box component="fieldset" disabled={disabled} className={styles.choices}>
      <Stack gap="lg">
        {onSizeChange ? (
          <ControlBlock
            title="Size"
            description="The Size is fixed once the Rulebook is created. Tall is A4 folded lengthwise."
            input={
              <PreviewChoice
                label="Rulebook Size"
                value={settings.size}
                onChange={onSizeChange}
                aspectRatio="275 / 307"
                options={rulebookSizeCatalogue.map((option) => ({
                  value: option.id,
                  label: option.label,
                  description: `${option.widthMm} × ${option.heightMm} mm`,
                  canvas: { width: 275, height: 307 },
                  preview: <SizeExample size={option.id} design={settings.design} prefix={`${prefix}-${option.id}`} />,
                }))}
              />
            }
          />
        ) : (
          <Text size="sm">
            This copy keeps the {size.label} size, {size.widthMm} × {size.heightMm} mm.
          </Text>
        )}
        <ControlBlock
          title="Design"
          description="The Design is fixed once the Rulebook is created. These examples show two facing pages."
          input={
            <PreviewChoice
              label="Rulebook Design"
              value={settings.design}
              onChange={onDesignChange}
              aspectRatio="4 / 3"
              options={rulebookDesignCatalogue.map((option) => ({
                value: option.id,
                label: option.label,
                canvas: { width: size.widthMm * 2, height: size.heightMm },
                preview: (
                  <DesignExample
                    settings={{ size: settings.size, design: option.id }}
                    prefix={`${prefix}-${option.id}`}
                  />
                ),
              }))}
            />
          }
        />
        <Text size="sm" c="dimmed">
          {size.label}: {size.widthMm} × {size.heightMm} mm per page.
        </Text>
      </Stack>
    </Box>
  );
}

function CreateRulebookForm({ page }: { page: RulebookCreationPageData }) {
  const navigate = useNavigate();
  const create = useCreateRulebook();
  const [draft, send] = useReducer(creationReducer, {
    name: '',
    source: 'starter',
    cloneId: null,
    starterSettings: DEFAULT_RULEBOOK_SETTINGS,
    cloneDesign: undefined,
  });
  const { input, nameError } = creationSubmission(draft, page);
  const clone = page.rulebooks.find((book) => book._id === draft.cloneId);
  const settings =
    draft.source === 'starter'
      ? draft.starterSettings
      : clone
        ? { size: clone.settings.size, design: draft.cloneDesign ?? clone.settings.design }
        : undefined;
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
          renderOption={({ option }) => {
            const rulebook = page.rulebooks.find((book) => book._id === option.value);
            return (
              <Group gap="sm" wrap="nowrap">
                <Box w={32} miw={32} aria-hidden>
                  <RulebookPreview
                    name={option.label}
                    size={rulebook?.settings.size}
                    imageUrl={rulebook?.first_page_image_url}
                    status={rulebook?.first_page_capture_status}
                  />
                </Box>
                <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                  {option.label}
                </Text>
              </Group>
            );
          }}
        />
      ) : null}
      {settings ? (
        <RulebookSettingsChoices
          settings={settings}
          disabled={create.isPending}
          onSizeChange={draft.source === 'starter' ? (value) => send({ kind: 'size', value }) : undefined}
          onDesignChange={(value) => send({ kind: 'design', value })}
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
