import { Anchor, Button, Group, Popover, Stack, Text, TextInput, Title } from '@mantine/core';
import { RULESET_ASSET_SLOT_ORDER, RULESET_ASSET_SLOTS } from '@shared/rulesets/assetSlots';
import type { RulesetAssetSlot } from '@shared/rulesets/assetSlots';
import { rulesetAboutSchema, rulesetNameSchema } from '@shared/rulesets/validation';
import { userImageSourceUrlSchema } from '@shared/user-images/contract';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { Section } from '@ui/block/Section';
import { rulesetAboutHint } from '@ui/content/rulesetAboutHint';
import { SlugRenameNotice } from '@ui/content/SlugRenameNotice';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { IconAction } from '@ui/control/IconAction';
import { SubmitAction } from '@ui/control/SubmitAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, X } from 'lucide-react';
import { useReducer, useState } from 'react';

import { useReorderRulebooks, useSoftDeleteRulebook } from '@db/rulebooks';
import type { RulebookMetadata } from '@db/rulebooks';
import {
  loadRulesetDetailPage,
  useClearRulesetAssetSlot,
  useRehostRulesetCover,
  useRulesetDetailPage,
  useSetRulesetAssetSlot,
  useUpdateRuleset,
} from '@db/rulesets';
import type { RulesetEntry } from '@db/rulesets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
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
  /* One draft, one reducer (the state rule). A single `patch` arm because this page has no reset,
     no baseline and no memory: a rename remounts it via `key`, which is the only replace it knows. */
  const [draft, dispatch] = useReducer(
    (
      state: { name: string; about: string; coverUrl: string },
      event: { kind: 'patch'; update: Partial<typeof state> }
    ) => ({
      ...state,
      ...event.update,
    }),
    { name: initial.name, about: initial.about, coverUrl: initialCoverInput }
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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
    } else {
      setRehostState('idle');
    }
    try {
      const entry = await updateRuleset.mutateAsync({
        id: initial._id,
        input: { name: nameCheck.data, about: aboutCheck.data },
        /* Clearing travels through the legacy channel; a rehosted cover is already committed, so absent means untouched. */
        imageCover: coverChanged && trimmedCover === '' ? null : undefined,
      });
      if (previousSlug !== entry.slug) {
        navigate({
          to: '/rulesets/$rulesetSlug/edit',
          params: { rulesetSlug: entry.slug },
          replace: true,
        });
      }
    } catch {
      /* surfaced through mutationError */
    }
  };

  const toolbar = (
    <Surface padding="sm">
      <Group gap="xs" wrap="wrap" role="group" aria-label="Ruleset navigation">
        <IconAction
          label="Back to rulesets"
          emphasis="standard"
          intent="neutral"
          size="lg"
          renderRoot={(rootProps) => <Link {...rootProps} to="/rulesets" />}
          icon={<ArrowLeft size={17} aria-hidden />}
        />
        <IconAction
          label="View ruleset"
          emphasis="standard"
          intent="neutral"
          size="lg"
          renderRoot={(rootProps) => (
            <Link {...rootProps} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: initial.slug }} />
          )}
          icon={<TopicIcon topic="rulesets" size={17} />}
        />
      </Group>
    </Surface>
  );

  return (
    <PageLayout>
      {validationHeader.slot}
      <PageLayout.Toolbar>{toolbar}</PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="lg">
          <Surface padding="lg">
            <Stack component="form" gap="md" onSubmit={handleSubmit} onBlurCapture={validationHeader.settle}>
              <TextInput
                id="ruleset-settings-name"
                name="name"
                label="Name"
                description={
                  canRename ? (
                    <SlugRenameNotice noun="ruleset" url={`…/rulesets/${initial.slug}`} />
                  ) : (
                    'Only the ruleset owner can rename it.'
                  )
                }
                required
                minLength={1}
                error={nameError}
                value={name}
                onChange={(event) => dispatch({ kind: 'patch', update: { name: event.currentTarget.value } })}
                disabled={!canRename}
              />

              <FormattedTextInput
                id="ruleset-settings-about"
                name="about"
                label="About"
                description={rulesetAboutHint(about)}
                error={aboutError}
                required
                autosize
                minRows={4}
                value={about}
                onChange={(next) => dispatch({ kind: 'patch', update: { about: next } })}
              />

              <TextInput
                id="ruleset-settings-cover"
                type="url"
                label="Cover image URL"
                description={
                  <>
                    Optional. Use a full <code>https://</code> URL. Saving copies the image into our storage, so later
                    changes at the source will not appear here. Leave empty to clear the cover.
                  </>
                }
                error={coverFormatError ?? rehostFailure ?? undefined}
                value={coverUrl}
                onChange={(event) => dispatch({ kind: 'patch', update: { coverUrl: event.currentTarget.value } })}
                placeholder="https://…"
                autoComplete="off"
              />

              {rehostFailure ? <FormError title="Cover could not be stored">{rehostFailure}</FormError> : null}
              {mutationError ? <FormError title="Ruleset could not be saved">{mutationError}</FormError> : null}

              <Group justify="flex-end">
                <SubmitAction
                  pending={updateRuleset.isPending || rehostState === 'pending'}
                  disabled={!nameCheck.success || !aboutCheck.success || coverFormatError !== undefined}
                >
                  Save changes
                </SubmitAction>
              </Group>
            </Stack>
          </Surface>
          <RulesetRulebooks
            rulebooks={rulebooks}
            rulesetSlug={initial.slug}
            rulesetId={initial._id}
            canDelete={canDelete}
          />
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

  if (!viewerAccess) {
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
          Decks and bundles
        </Title>
        <Text size="sm" c="dimmed">
          What this ruleset ships. Slot names are labels rather than rules, so any deck may fill any deck slot, and an
          empty slot is fine.
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
