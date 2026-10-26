import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { Announcements, DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Anchor, Button, Group, Popover, Stack, Text, TextInput, Title } from '@mantine/core';
import { RULESET_ASSET_SLOT_ORDER, RULESET_ASSET_SLOTS } from '@shared/rulesets/assetSlots';
import type { RulesetAssetSlot } from '@shared/rulesets/assetSlots';
import { rulesetAboutSchema, rulesetNameSchema } from '@shared/rulesets/validation';
import { userImageSourceUrlSchema } from '@shared/user-images/contract';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { LoadPending } from '@ui/block/LoadPending';
import { NotAvailable } from '@ui/block/NotAvailable';
import { Section } from '@ui/block/Section';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { FactionLink } from '@ui/content/FactionLink';
import { RULESET_ABOUT_HELP, rulesetAboutCount } from '@ui/content/rulesetAboutHint';
import { SlugRenameNotice } from '@ui/content/SlugRenameNotice';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FORMATTED_TEXT_SYNTAX_HELP, FormattedTextInput } from '@ui/control/FormattedTextInput';
import { IconAction } from '@ui/control/IconAction';
import { SortableItem } from '@ui/control/SortableItem';
import { SortableReorderHandle } from '@ui/control/SortableReorderHandle';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ArrowDown, ArrowUp, Layers3, Link2, Link2Off, Pencil, X } from 'lucide-react';
import { useReducer, useState } from 'react';

import { useReorderRulebooks, useSoftDeleteRulebook } from '@db/rulebooks';
import type { RulebookMetadata } from '@db/rulebooks';
import {
  loadRulesetDetailPage,
  useAddRulesetFaction,
  useClearRulesetAssetSlot,
  useRehostRulesetCover,
  useOrderedRulesetFactions,
  useRemoveRulesetFaction,
  useReorderRulesetFactions,
  useRulesetDetailPage,
  useSetRulesetAssetSlot,
  useUpdateRuleset,
} from '@db/rulesets';
import type { RulesetEntry } from '@db/rulesets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { FactionPicker } from '@app/pickers/FactionPicker';
import { pageHead } from '@app/routes/pageTitle';
import { AuthoringToolbar, failureStatus } from '@app/widgets/authoring/AuthoringToolbar';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { LoginGate } from '@app/widgets/page-message/LoginGate';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

/**
 * The whole edit page for one ruleset, mounted with `key={r.slug}` so a rename remounts it and resets the draft.
 * It returns the full `PageLayout` itself rather than handing a header slot upward: the layout matches slots by identity, so the band must be this component's own direct child (#444), and per #897 that band stays closed until there are warnings.
 * The identity band with the cover art came off under the same ruling;
 * the toolbar and the page message frames carry the orientation now.
 */
function RulesetEditor({
  initial,
  canRename,
  canDelete,
  rulebooks,
  assetSlots,
}: {
  initial: RulesetEntry;
  canRename: boolean;
  canDelete: boolean;
  rulebooks: RulebookMetadata[];
  assetSlots: { slot: string; asset: SlottedAsset }[];
}) {
  const navigate = useNavigate();
  const updateRuleset = useUpdateRuleset();
  const rehostCover = useRehostRulesetCover();
  /* The form shows the URL the author pasted, not the delivery URL the rehost produced from it. */
  const initialCoverInput = initial.cover?.source_url ?? initial.image_cover ?? '';
  /* One draft, one reducer (the state rule): a patch arm for typing and a reset arm that returns to the saved row.
     A rename remounts the page via `key`, which is the only replace it knows. */
  const baseline = { name: initial.name, about: initial.about, coverUrl: initialCoverInput };
  const [draft, dispatch] = useReducer(
    (
      state: { name: string; about: string; coverUrl: string },
      event: { kind: 'patch'; update: Partial<typeof state> } | { kind: 'reset' }
    ) => (event.kind === 'reset' ? baseline : { ...state, ...event.update }),
    baseline
  );
  const { name, about, coverUrl } = draft;
  /* The rehost workflow as one value rather than a pending flag beside an error string. */
  const [rehostState, setRehostState] = useState<'idle' | 'pending' | { failed: string }>('idle');

  const mutationError =
    updateRuleset.isError && updateRuleset.error instanceof Error ? updateRuleset.error.message : null;
  const nameCheck = rulesetNameSchema.safeParse(name);
  /* A rename that the shared schema rejects is a field error here, never a thrown parse on save. */
  const nameError = name.trim().length > 0 && !nameCheck.success ? nameCheck.error.issues[0]?.message : undefined;
  const aboutCheck = rulesetAboutSchema.safeParse(about);
  /**
   * The floor applies to every save, with no exemption for the historical empty string, so that Ruleset cannot be saved until someone writes its About.
   * Shown as an error only once something has been typed;
   * an untouched empty field is explained by the requirement line and the disabled button instead.
   */
  const aboutError = about.trim().length > 0 && !aboutCheck.success ? aboutCheck.error.issues[0]?.message : undefined;

  const trimmedCover = coverUrl.trim();
  const coverChanged = trimmedCover !== initialCoverInput;
  const coverCheck = userImageSourceUrlSchema.safeParse(trimmedCover);
  /* Live once a changed, non-empty URL is present, per the about field's own gating below. */
  const coverFormatError =
    coverChanged && trimmedCover !== '' && !coverCheck.success
      ? (coverCheck.error.issues[0]?.message ?? 'Invalid cover image URL')
      : undefined;
  const rehostFailure = typeof rehostState === 'object' ? rehostState.failed : null;
  const warnings = [
    ...(nameError ? [{ source: 'Name', complaint: nameError, focusId: 'ruleset-settings-name' }] : []),
    ...(aboutError ? [{ source: 'About', complaint: aboutError, focusId: 'ruleset-settings-about' }] : []),
    ...(coverFormatError
      ? [{ source: 'Cover image', complaint: coverFormatError, focusId: 'ruleset-settings-cover' }]
      : []),
    ...(rehostFailure ? [{ source: 'Cover image', complaint: rehostFailure, focusId: 'ruleset-settings-cover' }] : []),
  ];
  const validationHeader = useEditPageHeader({
    warnings,
    onFocusWarning: (warning) => document.getElementById(warning.focusId)?.focus(),
  });

  const isDirty = name !== baseline.name || about !== baseline.about || coverUrl !== baseline.coverUrl;
  const saveState: AuthoringSaveState =
    updateRuleset.isPending || rehostState === 'pending'
      ? 'saving'
      : mutationError || rehostFailure
        ? 'error'
        : updateRuleset.data !== undefined
          ? 'saved'
          : 'idle';

  const save = async () => {
    /*
     * Every save starts by clearing what the previous one left, so the form and the toolbar state only this save's failure.
     * A save that stops at the cover never reaches the update, which would otherwise leave an earlier update failure standing beside the cover's.
     */
    updateRuleset.reset();
    setRehostState('idle');
    if (!nameCheck.success || !aboutCheck.success || coverFormatError !== undefined) {
      return;
    }
    const previousSlug = initial.slug;
    /*
     * A new cover URL goes through the rehost action before anything else is written: the Worker fetches it once and the document ends up serving our copy.
     * A refusal, a dead host or a non-image all surface here as the rehost failure, and the save stops without touching the other fields.
     */
    if (coverChanged && trimmedCover !== '' && coverCheck.success) {
      setRehostState('pending');
      try {
        await rehostCover({ id: initial._id, sourceUrl: coverCheck.data });
        setRehostState('idle');
      } catch (error) {
        setRehostState({ failed: error instanceof Error ? error.message : 'The cover could not be stored' });
        return;
      }
    }
    const imageCover = coverChanged && trimmedCover === '' ? null : undefined;
    try {
      const entry = await updateRuleset.mutateAsync({
        id: initial._id,
        input: { name: nameCheck.data, about: aboutCheck.data },
        /* Clearing travels through the legacy channel; a rehosted cover is already committed, so absent means untouched. */
        imageCover,
      });
      if (previousSlug !== entry.slug) {
        void navigate({
          to: '/rulesets/$rulesetSlug/edit',
          params: { rulesetSlug: entry.slug },
          replace: true,
        });
      }
    } catch {
      /* surfaced through mutationError */
    }
  };
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void save();
  };

  const saveFailure = mutationError ?? rehostFailure;
  const toolbar = (
    <AuthoringToolbar
      status={{ isDirty, isNameBlank: name.trim() === '', saveState }}
      copy={{
        saveLabel: 'Save ruleset',
        nameBlankMessage: 'Add a ruleset name before saving; it determines the ruleset URL.',
      }}
      actions={{
        onSave: () => void save(),
        onReset: validationHeader.releasing(() => {
          dispatch({ kind: 'reset' });
          setRehostState('idle');
          updateRuleset.reset();
        }),
        /* Back returns to the ruleset itself, the page Edit came from, so no second "View ruleset" action is needed. */
        onBack: () => navigate({ to: '/rulesets/$rulesetSlug', params: { rulesetSlug: initial.slug } }),
      }}
      statuses={[failureStatus(saveFailure)]}
    />
  );

  return (
    <PageLayout>
      {validationHeader.slot}
      <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="lg">
          <Surface padding="lg">
            <Stack component="form" gap="md" onSubmit={handleSubmit} onBlurCapture={validationHeader.settle}>
              <ControlBlock
                title="Name"
                description={
                  canRename ? (
                    <SlugRenameNotice noun="ruleset" url={`…/rulesets/${initial.slug}`} />
                  ) : (
                    'Only the ruleset owner can rename it.'
                  )
                }
                input={
                  <TextInput
                    id="ruleset-settings-name"
                    aria-label="Name"
                    name="name"
                    required
                    error={nameError}
                    value={name}
                    onChange={(event) => dispatch({ kind: 'patch', update: { name: event.currentTarget.value } })}
                    disabled={!canRename}
                  />
                }
              />

              <ControlBlock
                title="About"
                description={`${RULESET_ABOUT_HELP} ${FORMATTED_TEXT_SYNTAX_HELP}`}
                input={
                  <FormattedTextInput
                    id="ruleset-settings-about"
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

              <ControlBlock
                title="Cover image URL"
                description={
                  'Optional. A full https:// URL.\nSaving stores a copy, so later changes at the source do not show here.\nLeave empty to clear the cover.'
                }
                input={
                  <TextInput
                    id="ruleset-settings-cover"
                    aria-label="Cover image URL"
                    type="url"
                    error={coverFormatError ?? rehostFailure ?? undefined}
                    value={coverUrl}
                    onChange={(event) => dispatch({ kind: 'patch', update: { coverUrl: event.currentTarget.value } })}
                    placeholder="https://…"
                    autoComplete="off"
                  />
                }
              />

              {rehostFailure ? <FormError title="Cover could not be stored">{rehostFailure}</FormError> : null}
              {mutationError ? <FormError title="Ruleset could not be saved">{mutationError}</FormError> : null}
            </Stack>
          </Surface>
          <RulesetRulebooks
            rulebooks={rulebooks}
            rulesetSlug={initial.slug}
            rulesetId={initial._id}
            canDelete={canDelete}
          />
          <RulesetFactions rulesetId={initial._id} rulesetName={initial.name} />
          {/* A sibling pane rather than a nested one: surfaces do not nest, and slots are a different subject from the ruleset's own fields. */}
          <Surface padding="lg">
            <RulesetAssetSlots rulesetId={initial.id} slots={assetSlots} />
          </Surface>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/edit')({
  loader: async ({ params }) => {
    const detailPage = await loadRulesetDetailPage(params.rulesetSlug);
    if (!detailPage) {
      return { notFound: true as const };
    }
    return { notFound: false as const, detailPage };
  },
  /* A missing ruleset comes back as `notFound: true`, not a thrown notFound, so the head names that page itself. */
  head: ({ loaderData }) =>
    pageHead(
      !loaderData
        ? 'Edit ruleset'
        : loaderData.notFound
          ? 'Page not found'
          : `Edit ${loaderData.detailPage.ruleset.name}`
    ),
  component: RulesetEditPage,
});

function RulesetEditPage() {
  const { rulesetSlug } = Route.useParams();
  const loaderData = Route.useLoaderData();
  const detailSeed = !loaderData.notFound && loaderData.detailPage ? loaderData.detailPage : undefined;
  const pageQuery = useRulesetDetailPage(rulesetSlug, { initialData: detailSeed });
  const page = pageQuery.data;

  /* One condition, because the loader's verdict and a missing row are the same page to the reader.
     They were two identical blocks before, which is how they stayed identical. */
  if (loaderData.notFound || !page?.ruleset) {
    return (
      <PageMessage
        size="compact"
        title="Edit ruleset"
        back={<PageMessage.Back to="/rulesets">Back to rulesets</PageMessage.Back>}
      >
        <NotAvailable title="Ruleset not found">This ruleset does not exist or was deleted.</NotAvailable>
      </PageMessage>
    );
  }

  const r = page.ruleset;
  const viewerAccess = page.viewerAccess;
  /* The ruleset's name rather than the identity band it wears when loaded: a message page says what
     it is about in words, and the band with its cover art belongs to the page that has something to
     edit. The way back points at the ruleset itself, which is the more useful of the two
     destinations the toolbar offered. */
  const guardBack = (
    <PageMessage.Back to="/rulesets/$rulesetSlug" params={{ rulesetSlug: r.slug }}>
      Back to ruleset
    </PageMessage.Back>
  );

  if (!page.viewerResolved) {
    return (
      <PageMessage size="compact" title={`Edit ${r.name}`} back={guardBack}>
        <LoadPending title="Loading your profile">Checking what you may change here.</LoadPending>
      </PageMessage>
    );
  }

  if (viewerAccess.viewer.kind === 'anonymous') {
    return (
      <PageMessage size="compact" title={`Edit ${r.name}`} back={guardBack}>
        <LoginGate action="edit this ruleset" />
      </PageMessage>
    );
  }

  if (!viewerAccess.capabilities.edit) {
    return (
      <PageMessage size="compact" title={`Edit ${r.name}`} back={guardBack}>
        <NotAvailable title="You cannot edit this ruleset">
          {r.group_id
            ? 'Only the ruleset owner or an active member of its group can edit this ruleset.'
            : 'Only the ruleset owner can edit this ruleset.'}
        </NotAvailable>
      </PageMessage>
    );
  }

  return (
    <RulesetEditor
      key={r.slug}
      initial={r}
      canRename={viewerAccess.capabilities.rename}
      canDelete={viewerAccess.capabilities.delete}
      rulebooks={page.rulebooks}
      assetSlots={page.assetSlots}
    />
  );
}

type SlottedAsset = { id: string; type: string; slug: string; name: string };

/* The Factions list's first load and each "Load more": a ruleset seldom has more, and dragging only reorders what is loaded. */
const FACTION_LIST_STEP = 50;

/**
 * The ruleset's factions in its own order, as plain links: drag one to move it, remove one with its button, and add one from the picker.
 * The ruleset's page shows the first few in this order, so this is where the order is set.
 * A drag saves at once and the list keeps the new order until the saved one arrives;
 * dragging among the loaded factions leaves the unloaded ones after them.
 */
/** What a screen reader hears while a faction is dragged: its name and places, never its id. */
function factionAnnouncements(factions: { _id: string; name: string }[]): Announcements {
  const name = (id: string | number) => factions.find((faction) => faction._id === id)?.name ?? 'Faction';
  const place = (id: string | number) =>
    `position ${factions.findIndex((faction) => faction._id === id) + 1} of ${factions.length}`;
  return {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}, at ${place(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${name(active.id)} is over ${place(over.id)}.` : `${name(active.id)} is no longer over the list.`,
    onDragEnd: ({ active, over }) =>
      over ? `${name(active.id)} was dropped at ${place(over.id)}.` : `${name(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Moving ${name(active.id)} was cancelled.`,
  };
}

function RulesetFactions({ rulesetId, rulesetName }: { rulesetId: RulesetEntry['_id']; rulesetName: string }) {
  const [limit, setLimit] = useState(FACTION_LIST_STEP);
  const answered = useOrderedRulesetFactions(rulesetId, limit);
  /* The last answer stays on screen while Load more asks for a longer list, so the list and the button keep their place and focus. */
  const [lastAnswered, setLastAnswered] = useState(answered);
  if (answered !== undefined && answered !== lastAnswered) {
    setLastAnswered(answered);
  }
  const ordered = answered ?? lastAnswered;
  const addFaction = useAddRulesetFaction();
  const removeFaction = useRemoveRulesetFaction();
  const reorder = useReorderRulesetFactions();
  /* The order a drag asked for, shown until the query answers with a new list; keyed by that list so a fresh answer replaces it. */
  const [draftOrder, setDraftOrder] = useState<{ basis: unknown; ids: string[] } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const saved = ordered?.factions ?? [];
  const byId = new Map(saved.map((faction) => [faction._id as string, faction]));
  const factions =
    draftOrder && draftOrder.basis === ordered ? draftOrder.ids.flatMap((id) => byId.get(id) ?? []) : saved;
  const error = addFaction.error ?? removeFaction.error ?? reorder.error;
  const pending = addFaction.isPending || removeFaction.isPending;

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const from = factions.findIndex((faction) => faction._id === active.id);
    const to = over ? factions.findIndex((faction) => faction._id === over.id) : -1;
    if (from < 0 || to < 0 || from === to) {
      return;
    }
    const ids = arrayMove(factions, from, to).map((faction) => faction._id);
    setDraftOrder({ basis: ordered, ids });
    /* A refused save drops its own draft, so the list shows the saved order again; a later drag's draft stays. */
    reorder.mutate(
      { rulesetId, factionIds: ids },
      { onError: () => setDraftOrder((current) => (current?.ids === ids ? null : current)) }
    );
  };

  return (
    <Section id="factions" title="Factions" icon={<Layers3 size={20} aria-hidden />}>
      <Surface padding="lg">
        <Stack gap="md">
          {error ? <FormError title="Factions could not be updated">{error.message}</FormError> : null}
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm" c="dimmed">
              {ordered === undefined ? 'Loading factions…' : 'Drag a faction to change its place.'}
            </Text>
            <AddFactionPopover
              disabled={pending}
              linkedSlugs={saved.map((faction) => faction.slug)}
              rulesetName={rulesetName}
              onAdd={(factionId) => addFaction.mutate({ rulesetId, factionId })}
            />
          </Group>
          {ordered && factions.length === 0 ? (
            <Text c="dimmed">No factions have been added to this ruleset yet.</Text>
          ) : null}
          {factions.length > 0 ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              accessibility={{ announcements: factionAnnouncements(factions) }}
            >
              <SortableContext items={factions.map((faction) => faction._id)} strategy={verticalListSortingStrategy}>
                <Stack component="ol" aria-label="Factions" gap="xs" m={0} p={0} style={{ listStyle: 'none' }}>
                  {factions.map((faction) => (
                    <SortableItem as="li" key={faction._id} id={faction._id}>
                      {(handle) => (
                        <Group gap="sm" wrap="nowrap">
                          <SortableReorderHandle label={`Move ${faction.name}`} {...handle} />
                          <FactionLink
                            slug={faction.slug}
                            name={faction.name}
                            logo={faction.logo}
                            background={faction.background}
                            style={{ flex: 1, minWidth: 0 }}
                          />
                          <IconAction
                            label={`Remove ${faction.name} from ${rulesetName}`}
                            intent="neutral"
                            emphasis="quiet"
                            size="sm"
                            disabled={pending}
                            onClick={() => removeFaction.mutate({ rulesetId, factionId: faction._id })}
                            icon={<Link2Off size={16} aria-hidden />}
                          />
                        </Group>
                      )}
                    </SortableItem>
                  ))}
                </Stack>
              </SortableContext>
            </DndContext>
          ) : null}
          {ordered?.hasMore ? (
            <Button
              variant="default"
              onClick={() => setLimit((current) => (answered === undefined ? current : current + FACTION_LIST_STEP))}
            >
              Load more
            </Button>
          ) : null}
          <Text size="xs" c="dimmed">
            Changes save immediately. The ruleset page shows the first three. Removing a faction only takes it out of
            this ruleset.
          </Text>
        </Stack>
      </Surface>
    </Section>
  );
}

/**
 * The Factions section's affordance that adds a faction to this ruleset.
 * It owns the open state and nothing else: the picker is mounted only while the popover is open, so its subscription lives exactly that long, which is the contract `AGENTS.md` sets for a Picker's container.
 * The commit is the caller's;
 * this reports the chosen faction's id and closes.
 */
function AddFactionPopover({
  disabled,
  linkedSlugs,
  rulesetName,
  onAdd,
}: {
  disabled: boolean;
  /** The loaded linked factions, which the picker leaves out; adding an unloaded one again changes nothing. */
  linkedSlugs: string[];
  rulesetName: string;
  onAdd: (factionId: string) => void;
}) {
  const [opened, setOpened] = useState(false);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      width={440}
      shadow="md"
      withArrow
      /* A 440px pane over a 40px trigger is slid by `shift` to fit, and a side-anchored arrow goes with the pane rather than staying on the control that opened it (#715). */
      arrowPosition="center"
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <IconAction
          label="Add a faction"
          emphasis="standard"
          intent="neutral"
          size="sm"
          disabled={disabled}
          onClick={() => setOpened((current) => !current)}
          icon={<Link2 size={17} aria-hidden />}
        />
      </Popover.Target>
      <Popover.Dropdown>
        {opened ? (
          <FactionPicker
            excludeSlugs={linkedSlugs}
            copy={{
              title: 'Add a faction',
              intro: `Choose a faction to add to ${rulesetName}. Factions already in it are not listed.`,
              errorTitle: 'Faction could not be added',
              emptyMessage: 'Every faction is already in this ruleset.',
              confirmTitle: `Add this faction to ${rulesetName}?`,
              /* No warning: nothing is overwritten, and the list's remove button takes it straight back out. */
              confirmLabel: 'Add faction',
              confirmIntent: 'positive',
            }}
            onCancel={() => setOpened(false)}
            onPick={(picked) => {
              onAdd(picked.id);
              setOpened(false);
            }}
          />
        ) : null}
      </Popover.Dropdown>
    </Popover>
  );
}

function RulesetRulebooks({
  rulebooks,
  rulesetSlug,
  rulesetId,
  canDelete,
}: {
  rulebooks: RulebookMetadata[];
  rulesetSlug: string;
  rulesetId: RulebookMetadata['ruleset_id'];
  canDelete: boolean;
}) {
  const reorder = useReorderRulebooks();
  const remove = useSoftDeleteRulebook();
  const pending = reorder.isPending || remove.isPending;
  const error = reorder.error ?? remove.error;
  function move(index: number, direction: -1 | 1) {
    const ids = rulebooks.map((book) => book._id);
    const target = index + direction;
    if (pending || target < 0 || target >= ids.length) {
      return;
    }
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate({ rulesetId, rulebookIds: ids });
  }
  return (
    <Section id="rulebooks" title="Rulebooks" icon={<TopicIcon topic="rules" size={20} />}>
      <Surface padding="lg">
        <Stack gap="md">
          {error ? <FormError title="Rulebooks could not be updated">{error.message}</FormError> : null}
          {rulebooks.length === 0 ? <Text c="dimmed">No Rulebooks yet.</Text> : null}
          <Stack component="ol" aria-label="Rulebooks" gap="sm" m={0} p={0} style={{ listStyle: 'none' }}>
            {rulebooks.map((book, index) => (
              <Group component="li" key={book._id} gap="sm" wrap="nowrap">
                <Text fw={600} miw={0} style={{ flex: 1, overflowWrap: 'anywhere' }}>
                  {book.name}
                </Text>
                <Group gap="xs" wrap="nowrap">
                  <IconAction
                    label={`Edit ${book.name}`}
                    intent="neutral"
                    emphasis="quiet"
                    size="sm"
                    icon={<Pencil size={16} aria-hidden />}
                    renderRoot={(props) => (
                      <Link
                        {...props}
                        to="/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit"
                        params={{ rulesetSlug, rulebookSlug: book.slug }}
                      />
                    )}
                  />
                  <IconAction
                    label={`Move ${book.name} up`}
                    intent="neutral"
                    emphasis="quiet"
                    size="sm"
                    disabled={pending || index === 0}
                    onClick={() => move(index, -1)}
                    icon={<ArrowUp size={16} aria-hidden />}
                  />
                  <IconAction
                    label={`Move ${book.name} down`}
                    intent="neutral"
                    emphasis="quiet"
                    size="sm"
                    disabled={pending || index === rulebooks.length - 1}
                    onClick={() => move(index, 1)}
                    icon={<ArrowDown size={16} aria-hidden />}
                  />
                  {canDelete ? (
                    <ConfirmDeleteAction
                      label={`Delete ${book.name}`}
                      size="sm"
                      pending={remove.isPending}
                      disabled={reorder.isPending}
                      onConfirm={() => remove.mutate({ rulebookId: book._id })}
                    />
                  ) : null}
                </Group>
              </Group>
            ))}
          </Stack>
          {rulebooks.length > 0 ? (
            <Text size="xs" c="dimmed">
              Order changes save immediately. Rename a Rulebook in its editor.
              {canDelete
                ? ' Hold Delete for five seconds to remove it and break its reader links. Contents and Editions remain stored for administrator recovery.'
                : ''}
            </Text>
          ) : null}
        </Stack>
      </Surface>
    </Section>
  );
}

/**
 * A ruleset's asset slots.
 *
 * Slots are curatorial labels, so a slot demands only the kind it holds and an empty slot is a legal state rather than a warning.
 * The single-asset slots replace rather than refuse: choosing a second deck for `treachery` swaps it, which is what "at most one" means to someone filling it in.
 */
function RulesetAssetSlots({
  rulesetId,
  slots,
}: {
  rulesetId: string;
  slots: { slot: string; asset: SlottedAsset }[];
}) {
  const setSlot = useSetRulesetAssetSlot();
  const clearSlot = useClearRulesetAssetSlot();
  const [openSlot, setOpenSlot] = useState<RulesetAssetSlot | null>(null);

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={2} size="h4">
          Board, decks and bundles
        </Title>
        <Text size="sm" c="dimmed">
          What this ruleset puts on the table. Choose a board to make it available for Play. Any deck may fill any deck
          slot.
        </Text>
      </Stack>
      {setSlot.error ? <FormError title="Slot could not be filled">{setSlot.error.message}</FormError> : null}
      {clearSlot.error ? <FormError title="Slot could not be cleared">{clearSlot.error.message}</FormError> : null}
      {RULESET_ASSET_SLOT_ORDER.map((slot) => {
        const rule = RULESET_ASSET_SLOTS[slot];
        const held = slots.filter((entry) => entry.slot === slot).map((entry) => entry.asset);
        return (
          <Stack key={slot} gap="xs">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Text size="sm" fw={600}>
                {rule.label}
              </Text>
              {/* Gated by the popover: the picker subscribes on mount, so it must not mount until asked for. */}
              <Popover
                opened={openSlot === slot}
                onChange={(opened) => setOpenSlot(opened ? slot : null)}
                width={340}
                position="bottom-end"
                withinPortal
              >
                <Popover.Target>
                  <Button
                    variant="light"
                    size="compact-sm"
                    onClick={() => setOpenSlot(openSlot === slot ? null : slot)}
                  >
                    {rule.single && held.length > 0 ? 'Change' : 'Add'}
                  </Button>
                </Popover.Target>
                <Popover.Dropdown>
                  <AssetPicker
                    types={[rule.holds]}
                    excludeIds={held.map((asset) => asset.id)}
                    copy={{
                      searchLabel: `Search ${rule.noun}`,
                      searchPlaceholder: 'Type a name, slug or owner…',
                      emptyMessage: `No ${rule.noun} exist yet.`,
                    }}
                    onPick={(picked) => {
                      setOpenSlot(null);
                      setSlot.mutate({ rulesetId, assetId: picked.id, slot });
                    }}
                    onCancel={() => setOpenSlot(null)}
                  />
                </Popover.Dropdown>
              </Popover>
            </Group>
            {held.length === 0 ? (
              <Text size="sm" c="dimmed">
                Empty.
              </Text>
            ) : (
              <Stack gap={4}>
                {held.map((asset) => (
                  <Group key={asset.id} gap="xs" wrap="nowrap">
                    <Anchor
                      size="sm"
                      style={{ flex: 1, minWidth: 0 }}
                      renderRoot={(rootProps) => (
                        <Link {...rootProps} to="/assets/$type/$slug" params={{ type: asset.type, slug: asset.slug }} />
                      )}
                    >
                      {asset.name}
                    </Anchor>
                    <IconAction
                      label={`Remove ${asset.name} from ${rule.label}`}
                      emphasis="quiet"
                      intent="negative"
                      size="sm"
                      onClick={() => clearSlot.mutate({ rulesetId, assetId: asset.id, slot })}
                      icon={<X size={15} aria-hidden />}
                    />
                  </Group>
                ))}
              </Stack>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}
