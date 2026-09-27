import { Alert, Stack, Text } from '@mantine/core';
import { isRouteNoticeCode } from '@shared/routeNotices';
import type { RouteNoticeCode } from '@shared/routeNotices';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { LoadError } from '@ui/block/LoadError';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { factionAuthoringStatusMessage } from '@ui/content/assetPublishingStatus';
import { ConfirmDeleteAction } from '@ui/control/ConfirmDeleteAction';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { UserRoundMinus } from 'lucide-react';
import { useRef } from 'react';

import { useDeleteFaction, useFaction, useSetFactionGroup, useUpdateFaction } from '@db/factions';
import { loadFaction } from '@db/factions';
import { isStaleClientData } from '@app/db/core/clientBoundary';
import { resolveRouteNotice } from '@app/routes/routeNotices';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import {
  AuthoringToolbarStatusPrototype,
  isToolbarStatusVariant,
  PrototypeVariantBar,
} from '@app/widgets/authoring/AuthoringToolbarStatusPrototype';
import type { ToolbarStatusVariant } from '@app/widgets/authoring/AuthoringToolbarStatusPrototype';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { FactionComplexityIndicator } from '@app/widgets/faction-editor/FactionComplexityIndicator';
import { FactionEditor } from '@app/widgets/faction-editor/FactionEditor';
import type { FactionAuthoringViewHandle } from '@app/widgets/faction-editor/FactionEditor';
import { FactionGroupPopover } from '@app/widgets/faction-editor/FactionGroupPopover';
import { FactionLoadPopover } from '@app/widgets/faction-editor/FactionLoadPopover';
import { useFactionAuthoring } from '@app/widgets/faction-editor/useFactionAuthoring';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

import { useFactionNameField } from '../factionNameField';

export const Route = createFileRoute('/_app/factions/$factionId/edit')({
  validateSearch: (params: Record<string, unknown>): { notice?: RouteNoticeCode; variant?: ToolbarStatusVariant } => ({
    ...(isRouteNoticeCode(params?.notice) ? { notice: params.notice } : {}),
    /* PROTOTYPE, #1423: `?variant=a|b|c` swaps the toolbar for one of the status-glyph variants. */
    ...(isToolbarStatusVariant(params?.variant) ? { variant: params.variant } : {}),
  }),
  loader: async ({ params }) => await loadFaction(params.factionId),
  errorComponent: FactionEditError,
  component: FactionEditPage,
});

/**
 * The frame for a load that failed, which on this route is most often a slug that names no faction: the query throws rather than returning nothing, so the component's own absent branch never runs.
 * Without this the reader met the router's unstyled default and, in development, a stack trace.
 */
function FactionEditError({ error }: ErrorComponentProps) {
  return (
    <PageMessage
      size="compact"
      title="Edit faction"
      back={<PageMessage.Back to="/factions">Back to factions</PageMessage.Back>}
    >
      <LoadError title="Faction could not be loaded" stale={isStaleClientData(error)}>
        {error.message}
      </LoadError>
    </PageMessage>
  );
}

function FactionEditPage() {
  const { factionId } = Route.useParams();
  const search = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate();
  const viewRef = useRef<FactionAuthoringViewHandle | null>(null);
  const updateFaction = useUpdateFaction();
  const deleteFaction = useDeleteFaction();
  const setFactionGroup = useSetFactionGroup();

  const factionQuery = useFaction(factionId, {
    initialData: loaderData,
  });
  const { faction, viewerAccess, assignableGroups, assetPublishing } = factionQuery.data ?? loaderData;
  const authoringFaction = faction ?? loaderData.faction;
  const authoring = useFactionAuthoring({
    sessionKey: authoringFaction._id,
    initialData: authoringFaction.data,
    persistence: {
      save: async (draft) => await updateFaction.mutateAsync({ input: draft, id: authoringFaction._id }),
      isPending: updateFaction.isPending,
      error: updateFaction.error,
      hasSaved: updateFaction.data !== undefined,
      reset: updateFaction.reset,
    },
    onSaved: (entry) => {
      if (entry.slug !== factionId) {
        navigate({
          to: '/factions/$factionId/edit',
          params: { factionId: entry.slug },
          replace: true,
        });
      }
    },
  });
  const { nameField, conflictWarnings } = useFactionNameField({
    currentSlug: faction.slug,
    canRename: viewerAccess.capabilities.rename,
  });
  const allWarnings = [...authoring.editing.warnings, ...conflictWarnings];
  const validationHeader = useEditPageHeader({
    warnings: allWarnings,
    onFocusWarning: (warning) => viewRef.current?.focusWarning(warning),
  });
  const backToFaction = (
    <PageMessage.Back to="/factions/$factionId" params={{ factionId }}>
      Back to faction
    </PageMessage.Back>
  );

  if (viewerAccess?.viewer.kind === 'anonymous') {
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
      <PageMessage size="compact" title="Edit faction" back={backToFaction}>
        <LoadPending title="Loading faction">The faction is still loading.</LoadPending>
      </PageMessage>
    );
  }

  if (!viewerAccess?.capabilities.edit) {
    return (
      <PageMessage size="compact" title={`Edit ${faction.data.name}`} back={backToFaction}>
        <NotAvailable title="You cannot edit this faction">
          {faction.group_id
            ? 'Only the faction owner or an active member of its group can edit this faction.'
            : 'Only the faction owner can edit this faction.'}
        </NotAvailable>
      </PageMessage>
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

  const toolbarActions = {
    onSave: authoring.actions.submit,
    onReset: validationHeader.releasing(authoring.actions.reset),
    onBack: () =>
      navigate({
        to: '/factions/$factionId',
        params: { factionId },
      }),
  };
  const deleteAction = canDelete ? (
    <ConfirmDeleteAction
      label="Delete faction"
      pending={deleteFaction.isPending}
      onConfirm={() =>
        deleteFaction.mutate({ id: faction._id }, { onSuccess: () => void navigate({ to: '/factions' }) })
      }
    />
  ) : null;
  /* PROTOTYPE, #1423: flips `?variant=` in place, so the draft and its unsaved edits survive the switch. */
  const switchVariant = (variant: ToolbarStatusVariant | undefined) =>
    navigate({
      to: '.',
      search: (previous) => ({ ...previous, variant }),
      replace: true,
    });
  const loadAction = (
    <FactionLoadPopover
      disabled={updateFaction.isPending}
      currentPublicSlug={faction.slug}
      onLoaded={validationHeader.releasing(authoring.actions.loadDraft)}
    />
  );
  const groupAction = (
    <>
      {canAssignGroup && !assignedGroup ? (
        <FactionGroupPopover
          disabled={setFactionGroup.isPending}
          assignableGroups={assignableGroups}
          onAssignGroup={async (nextGroupId) => {
            await setFactionGroup.mutateAsync({
              id: faction._id,
              groupId: nextGroupId,
            });
          }}
        />
      ) : null}
      {canAssignGroup && assignedGroup ? (
        <IconAction
          label="Remove group"
          emphasis="standard"
          intent="negative"
          size="lg"
          disabled={setFactionGroup.isPending}
          onClick={() => void setFactionGroup.mutateAsync({ id: faction._id, groupId: null })}
          icon={<UserRoundMinus size={17} aria-hidden />}
        />
      ) : null}
    </>
  );
  return (
    <PageLayout>
      {validationHeader.slot}
      <PageLayout.Toolbar>
        {search.variant ? (
          <AuthoringToolbarStatusPrototype
            variant={search.variant}
            status={{
              isDirty: authoring.editing.isDirty,
              isNameBlank: authoring.editing.isNameBlank,
              saveState: authoring.persistence.saveState,
            }}
            copy={{
              saveLabel: 'Save faction',
              nameBlankMessage: 'Add a faction name before saving; it determines the faction URL.',
            }}
            actions={toolbarActions}
            review={{
              label: 'Review faction sheet',
              onOpen: (trigger) => viewRef.current?.openReview(trigger),
            }}
            centerIndicator={<FactionComplexityIndicator form={authoring.form} />}
            loadAction={loadAction}
            groupAction={groupAction}
            destructiveActions={deleteAction}
            publication={assetPublishing}
            groupName={assignedGroup?.name}
          />
        ) : (
          <AuthoringToolbar
            status={{
              isDirty: authoring.editing.isDirty,
              isNameBlank: authoring.editing.isNameBlank,
              saveState: authoring.persistence.saveState,
              lastPublishedAt: assetPublishing?.lastPublishedAt,
            }}
            copy={{
              saveLabel: 'Save faction',
              nameBlankMessage: 'Add a faction name before saving; it determines the faction URL.',
              statusMessage: factionAuthoringStatusMessage(authoring.persistence.saveState, assetPublishing),
            }}
            actions={toolbarActions}
            review={{
              label: 'Review faction sheet',
              onOpen: (trigger) => viewRef.current?.openReview(trigger),
            }}
            centerIndicator={<FactionComplexityIndicator form={authoring.form} />}
            auxiliaryActions={
              <>
                {loadAction}
                {groupAction}
              </>
            }
            context={
              assignedGroup ? (
                <Text size="xs" c="dimmed">
                  Group access: <strong>{assignedGroup.name}</strong>
                </Text>
              ) : null
            }
            destructiveActions={deleteAction}
          />
        )}
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="sm">
          {routeNotice ? (
            <Alert
              color={routeNotice.color}
              title={routeNotice.title}
              role="alert"
              withCloseButton
              onClose={dismissRouteNotice}
            >
              {routeNotice.message}
            </Alert>
          ) : null}
          {deleteFaction.error ? (
            <Alert color="red" variant="light" role="alert" title="Could not delete">
              {deleteFaction.error.message}
            </Alert>
          ) : null}
          <FactionEditor
            nameField={nameField}
            key={faction._id}
            ref={viewRef}
            form={authoring.form}
            errors={authoring.persistence.errors}
            isNameBlank={authoring.editing.isNameBlank}
            warnings={allWarnings}
            onSettle={validationHeader.settle}
            backgroundModeMemory={authoring.backgroundModeMemory}
            onBackgroundModeMemoryChange={authoring.setBackgroundModeMemory}
            retainedManualComplexity={authoring.retainedManualComplexity}
            onRetainedManualComplexityChange={authoring.setRetainedManualComplexity}
          />
          <PrototypeVariantBar current={search.variant} onChange={switchVariant} />
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
