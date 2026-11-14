import { Stack } from '@mantine/core';
import { normalizeInheritedFields } from '@shared/factions/variantFields';
import { isRouteNoticeCode } from '@shared/routeNotices';
import type { RouteNoticeCode } from '@shared/routeNotices';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ActionError } from '@ui/block/ActionError';
import { Notice } from '@ui/block/Notice';
import { PageState } from '@ui/block/PageState';
import { HoldAction } from '@ui/control/HoldAction';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { UserRoundMinus } from 'lucide-react';
import { useRef } from 'react';

import { useAuthoringAccountKey } from '@db/authoring';
import {
  useDeleteFaction,
  useFaction,
  useFactionVariantContext,
  useSetFactionGroup,
  useUpdateFaction,
} from '@db/factions';
import { isFactionNotFound, loadFaction } from '@db/factions';
import type { FactionDetailPageData } from '@db/factions';
import { useViewerAssignableGroups } from '@db/viewerAccess';
import { redirectFromFormerAddress, redirectToOwnFactionAddress } from '@app/routes/formerAddress';
import { pageHead } from '@app/routes/pageTitle';
import { resolveRouteNotice } from '@app/routes/routeNotices';
import { RouteLoadError, RouteNotFound } from '@app/routes/routeStates';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { groupAccessStatus } from '@app/widgets/authoring/groupAccessStatus';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { FactionComplexityIndicator } from '@app/widgets/faction-editor/FactionComplexityIndicator';
import { FactionEditor } from '@app/widgets/faction-editor/FactionEditor';
import type { FactionAuthoringViewHandle } from '@app/widgets/faction-editor/FactionEditor';
import type { FactionEditRights } from '@app/widgets/faction-editor/FactionFormFields';
import { FactionGroupPopover } from '@app/widgets/faction-editor/FactionGroupPopover';
import { factionLoadSource } from '@app/widgets/faction-editor/factionLoadSource';
import { factionPublicationStatus } from '@app/widgets/faction-editor/factionPublicationStatus';
import { useFactionAuthoring } from '@app/widgets/faction-editor/useFactionAuthoring';
import { LoginGate } from '@app/widgets/page-message/LoginGate';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { RoutePending } from '@app/widgets/page-message/RoutePending';
import { BackgroundLibrary } from '@game/assets/utils/BackgroundLibrary';

import { rawFactionLoad } from '../rawFactionLoad';
import { useFactionEditRights } from '../useFactionEditRights';

export const Route = createFileRoute('/_app/factions/$factionId/edit')({
  validateSearch: (params: Record<string, unknown>): { notice?: RouteNoticeCode } => {
    if (isRouteNoticeCode(params?.notice)) {
      return { notice: params.notice };
    }
    return {};
  },
  loader: async ({ params, location }) => {
    try {
      const page = await loadFaction(params.factionId);
      redirectToOwnFactionAddress(params.factionId, page.faction.slug, location, '/edit');
      return page;
    } catch (error) {
      /* A rename moves the faction, and an old edit link follows it there, as the faction page's own link does. */
      if (isFactionNotFound(error)) {
        await redirectFromFormerAddress({ kind: 'faction', slug: params.factionId }, location, '/edit');
      }
      throw error;
    }
  },
  errorComponent: FactionEditError,
  head: ({ loaderData }) => pageHead(loaderData ? `Edit ${loaderData.faction.data.name}` : 'Edit faction'),
  component: FactionEditPage,
});

/**
 * The frame for a load that failed, which on this route is most often a slug that names no faction: the query throws rather than returning nothing, so the component's own absent branch never runs.
 * Without this the reader met the router's unstyled default and, in development, a stack trace.
 */
function FactionEditError({ error }: ErrorComponentProps) {
  const back = <PageMessage.Back to="/factions">Back to factions</PageMessage.Back>;
  if (isFactionNotFound(error)) {
    return <RouteNotFound title="Edit faction" back={back} noun="faction" renamed />;
  }
  return (
    <RouteLoadError size="compact" title="Edit faction" back={back} what="Faction could not be loaded" error={error} />
  );
}

function FactionEditPage() {
  const authoringAccountKey = useAuthoringAccountKey();
  const { factionId } = Route.useParams();
  const search = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate();
  const viewRef = useRef<FactionAuthoringViewHandle | null>(null);
  const updateFaction = useUpdateFaction();
  const deleteFaction = useDeleteFaction();
  const setFactionGroup = useSetFactionGroup();

  const page = useFaction(factionId, { initialData: loaderData }).data ?? loaderData;
  const {
    resolved: viewerResolved,
    viewerAccess,
    rights,
    canDeleteFaction,
    canOpenEditor,
    withinRights,
  } = useFactionEditRights(page);
  const assignableGroups = useViewerAssignableGroups();
  const { faction, assetPublishing } = page;
  const authoringFaction = faction ?? loaderData.faction;
  /* The context answers only the variant's editors, and names a parent only for a variant that has one. */
  const variantContext = useFactionVariantContext(authoringFaction._id);
  const parent = variantContext?.parent;
  const authoring = useFactionAuthoring({
    sessionKey: authoringFaction._id,
    initialData: authoringFaction.data,
    inheritance: parent
      ? {
          parentName: parent.name,
          parent: parent.data,
          saved: normalizeInheritedFields(authoringFaction.inherited ?? []),
        }
      : undefined,
    persistence: {
      save: async (draft, inherited) =>
        await updateFaction.mutateAsync({ input: withinRights(draft), id: authoringFaction._id, inherited }),
      isPending: updateFaction.isPending,
      error: updateFaction.error,
      hasSaved: updateFaction.data !== undefined,
      reset: updateFaction.reset,
    },
    onSaved: (entry) => {
      if (entry.slug !== factionId) {
        void navigate({
          to: '/factions/$factionId/edit',
          params: { factionId: entry.slug },
          replace: true,
        });
      }
    },
  });
  const validationHeader = useEditPageHeader({
    warnings: authoring.editing.warnings,
    onFocusWarning: (warning) => viewRef.current?.focusWarning(warning),
  });
  const backToFaction = (
    <PageMessage.Back to="/factions/$factionId" params={{ factionId }}>
      Back to faction
    </PageMessage.Back>
  );

  if (!viewerResolved) {
    return (
      <RoutePending size="compact" title={`Edit ${faction.data.name}`} back={backToFaction} loading="Loading faction">
        Checking what you can edit.
      </RoutePending>
    );
  }

  if (viewerAccess.viewer.kind === 'anonymous') {
    /* The name stays conditional here, as it was in the old header: this guard runs before the one
       below that answers whether there is a faction at all, so the title cannot assume one. */
    return (
      <PageMessage size="compact" title={faction ? `Edit ${faction.data.name}` : 'Edit faction'} back={backToFaction}>
        <LoginGate action="edit factions" />
      </PageMessage>
    );
  }

  if (!faction) {
    return (
      <RoutePending size="compact" title="Edit faction" back={backToFaction} loading="Loading faction">
        The faction is still loading.
      </RoutePending>
    );
  }

  if (!canOpenEditor) {
    return (
      <PageMessage size="compact" title={`Edit ${faction.data.name}`} back={backToFaction}>
        <PageState kind="absent" title="You cannot edit this faction">
          {faction.group_id
            ? 'Only the faction owner or an active member of its group can edit this faction.'
            : 'Only the faction owner can edit this faction.'}
        </PageState>
      </PageMessage>
    );
  }

  /* The editor of a variant with a parent waits for that parent, so no inherited field ever shows as the variant's own. */
  if (authoringFaction.parent_id !== undefined && rights.variant && variantContext === undefined) {
    return (
      <RoutePending size="compact" title={`Edit ${faction.data.name}`} back={backToFaction} loading="Loading faction">
        Loading the parent variant.
      </RoutePending>
    );
  }

  const assignedGroup = viewerAccess.assignedGroup;
  const canDelete = viewerAccess.capabilities.delete;
  const canAssignGroup = viewerAccess.capabilities.changeGroup;
  const routeNotice = resolveRouteNotice(search.notice);
  const dismissRouteNotice = () =>
    navigate({
      to: '.',
      search: (previous) => ({ ...previous, notice: undefined }),
      replace: true,
    });

  return (
    <BackgroundLibrary presets={page.backgrounds ?? []} fronts={page.cardFrontPresets}>
      <PageLayout>
        {validationHeader.slot}
        <PageLayout.Toolbar>
          <AuthoringToolbar
            scopeKey={authoringAccountKey}
            load={{
              noun: 'faction',
              scopeKey: faction._id,
              mode: 'replace',
              disabled: updateFaction.isPending,
              raw: rawFactionLoad(faction.data.name, rights.shared),
              source: factionLoadSource({ slug: faction.slug, name: faction.data.name }),
              onLoaded: validationHeader.releasing((draft) => authoring.actions.loadDraft(withinRights(draft))),
            }}
            status={{
              isDirty: authoring.editing.isDirty,
              isNameBlank: authoring.editing.isNameBlank,
              invalid: authoring.editing.invalid,
              saveState: authoring.persistence.saveState,
            }}
            copy={{
              saveLabel: 'Save faction',
              nameBlankMessage: 'Add a faction name before saving; it determines the faction URL.',
            }}
            actions={{
              onSave: authoring.actions.submit,
              onReset: validationHeader.releasing(authoring.actions.reset),
              onBack: () =>
                navigate({
                  to: '/factions/$factionId',
                  params: { factionId },
                }),
            }}
            review={{ label: 'Review faction sheet', onOpen: (trigger) => viewRef.current?.openReview(trigger) }}
            centerIndicator={<FactionComplexityIndicator form={authoring.form} />}
            accessActions={
              canAssignGroup ? (
                <FactionGroupActions
                  factionId={faction._id}
                  assignedGroup={assignedGroup}
                  assignableGroups={assignableGroups}
                  setGroup={setFactionGroup}
                />
              ) : null
            }
            statuses={[factionPublicationStatus(assetPublishing), groupAccessStatus(assignedGroup?.name ?? null)]}
            destructiveActions={
              canDelete ? (
                <DeleteVariantHold
                  mayDeleteFaction={canDeleteFaction}
                  variantContext={variantContext}
                  pending={deleteFaction.isPending}
                  onConfirm={(andFaction) =>
                    deleteFaction.mutate(
                      { id: faction._id, andFaction },
                      { onSuccess: () => void navigate({ to: '/factions' }) }
                    )
                  }
                />
              ) : null
            }
          />
        </PageLayout.Toolbar>
        <PageLayout.Content>
          <Stack gap="sm">
            {routeNotice ? (
              <Notice tone={routeNotice.tone} title={routeNotice.title} live onDismiss={dismissRouteNotice}>
                {routeNotice.message}
              </Notice>
            ) : null}
            <ActionError subject="Faction" verb="delete" error={deleteFaction.error} />
            <ActionError subject="Group access" verb="change" error={setFactionGroup.error} />
            <FactionEditor
              factionNotice={<FactionChapterNotice page={page} rights={rights} />}
              rights={rights}
              inheritance={authoring.inheritance}
              key={faction._id}
              ref={viewRef}
              form={authoring.form}
              errors={authoring.persistence.errors}
              isNameBlank={authoring.editing.isNameBlank}
              warnings={authoring.editing.warnings}
              onSettle={validationHeader.settle}
              backgroundModeMemory={authoring.backgroundModeMemory}
              onBackgroundModeMemoryChange={authoring.setBackgroundModeMemory}
              retainedManualComplexity={authoring.retainedManualComplexity}
              onRetainedManualComplexityChange={authoring.setRetainedManualComplexity}
              strengthRefusal={authoring.strengthRefusal}
              onStrengthRefusalChange={authoring.setStrengthRefusal}
            />
          </Stack>
        </PageLayout.Content>
      </PageLayout>
    </BackgroundLibrary>
  );
}

/**
 * The variant's delete hold.
 * A Faction goes with its last live variant when its owner deletes it, and the hold then says so (#2928).
 */
function DeleteVariantHold({
  mayDeleteFaction,
  variantContext,
  pending,
  onConfirm,
}: Readonly<{
  mayDeleteFaction: boolean;
  variantContext: { variants: readonly unknown[] } | null | undefined;
  pending: boolean;
  onConfirm: (andFaction: boolean) => void;
}>) {
  const withFaction = mayDeleteFaction && variantContext?.variants.length === 1;
  return (
    <HoldAction
      label={withFaction ? 'Delete variant and faction' : 'Delete variant'}
      hint={withFaction ? 'Hold to delete this variant and its faction.' : 'Hold to delete this variant.'}
      pending={pending}
      onConfirm={() => onConfirm(withFaction)}
    />
  );
}

/** Who may change the shared fields, in words: the Faction's owner, and its Group when it has one. */
function factionMaintainers({ owner, family }: FactionDetailPageData) {
  const ownerName = owner?.username ?? 'The faction owner';
  const group = family?.assignedGroup;
  return group ? `${ownerName} and the members of ${group.name}` : ownerName;
}

/**
 * Heads the Faction chapter, whose fields the Faction shares with every variant.
 * It says what a change there reaches, or names who may make one when the viewer may not.
 */
function FactionChapterNotice({ page, rights }: Readonly<{ page: FactionDetailPageData; rights: FactionEditRights }>) {
  const factionName = page.faction.data.name;
  const variantName = page.faction.variant_name ?? 'Original';
  if (!rights.shared) {
    return (
      <Notice title={`Only the maintainers of ${factionName} can change these`}>
        {`The name, emblem, colors and background are shared by every variant. ${factionMaintainers(page)} can change them. Everything in the other tabs belongs to the ${variantName} variant, which you can edit.`}
      </Notice>
    );
  }
  return (
    <Notice tone="info" title="Shared by every variant" collapsible>
      {`The name, emblem, colors and background belong to ${factionName}, not to this variant. A change here updates the page, cards and publications of every variant.`}
      {rights.variant ? null : ` The rest of the ${variantName} variant is for its own owner and Group to edit.`}
    </Notice>
  );
}

/** Assigning the faction to a Group, or removing the one it has; a failure shows on the page through the mutation's own error. */
function FactionGroupActions({
  factionId,
  assignedGroup,
  assignableGroups,
  setGroup,
}: Readonly<{
  factionId: string;
  assignedGroup: { name: string } | null;
  assignableGroups: Parameters<typeof FactionGroupPopover>[0]['assignableGroups'];
  setGroup: ReturnType<typeof useSetFactionGroup>;
}>) {
  if (!assignedGroup) {
    return (
      <FactionGroupPopover
        disabled={setGroup.isPending}
        assignableGroups={assignableGroups}
        onAssignGroup={async (groupId) => {
          await setGroup.mutateAsync({ id: factionId, groupId });
        }}
      />
    );
  }
  return (
    <IconAction
      label="Remove group"
      tooltip={`Remove group access (${assignedGroup.name})`}
      emphasis="standard"
      intent="neutral"
      size="lg"
      disabled={setGroup.isPending}
      onClick={() => void setGroup.mutateAsync({ id: factionId, groupId: null }).catch(() => undefined)}
      icon={<UserRoundMinus size={17} aria-hidden />}
    />
  );
}
