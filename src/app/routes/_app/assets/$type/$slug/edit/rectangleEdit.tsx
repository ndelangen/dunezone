import { Group, Popover } from '@mantine/core';
import { RectangleTokenAsset } from '@shared/assets/schema';
import { useNavigate } from '@tanstack/react-router';
import { ActionError } from '@ui/block/ActionError';
import { Notice } from '@ui/block/Notice';
import type { AuthoringSaveState } from '@ui/content/assetPublishingStatus';
import { TruncatedText } from '@ui/content/TruncatedText';
import { HoldAction } from '@ui/control/HoldAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { Replace } from 'lucide-react';
import { useReducer, useState } from 'react';

import { useAuthoringAccountKey } from '@db/authoring';
import { useAssetPage, useUpdateAsset } from '@app/db/assets';
import type { AssetPageData, AssetPublicPage } from '@app/db/assets';
import { AssetPicker } from '@app/pickers/AssetPicker';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import {
  RectangleTokenEditor,
  RectangleProof,
  initialRectangleMemory,
  rectangleDraftWarnings,
} from '@app/widgets/token-editor/RectangleTokenEditor';
import type {
  RectangleWarning,
  RectangleChapter,
  RectangleDraft,
  RectangleMemory,
} from '@app/widgets/token-editor/RectangleTokenEditor';

import { AssetEditChecks, useAssetDeletion, useAssetGroupActions, assetNameField } from '../../../assetEditorStates';
import { LoadedRectangleDraft, tokenLoad } from '../../../loadedDrafts';
import { referencedRectangleBackFace } from './referencedBackFace';
import { referencedBackProof } from './ReferencedBackProof';

export function RectangleEditPage({
  type,
  slug,
  loaderData,
}: {
  type: string;
  slug: string;
  loaderData: AssetPublicPage;
}) {
  const query = useAssetPage(type, slug, { initialData: loaderData });
  const data = query.data;

  return (
    <AssetEditChecks
      type={type}
      noun="token"
      schemaName="rectangle token"
      schema={RectangleTokenAsset}
      data={data}
      session={({ page, asset, access, initialDraft }) => (
        <RectangleEditSession
          access={access}
          type={type}
          asset={asset}
          backToken={page.backToken}
          danglingBack={page.resolvedBack?.mode === 'dangling'}
          initialDraft={initialDraft}
        />
      )}
    />
  );
}

/**
 * This page's authoring state, and the four things that happen to it.
 *
 * Written here rather than on the shared card session (`$type/cardSession.tsx`), because this page keeps side-state the card config has no slot for.
 * `memory` is what the session needs and the stored token has no room for (D3): the face and target kept across mode flips, the declared Custom intents, the picked token the label and proof draw, and whether a save has already complained.
 * Rebuilding the whole state on `replace` is what makes a discarded pick actually discarded: while the face and target were refs in the widget, a Reset left them standing and the next save could write a reference the page never showed.
 */
type PageMemory = RectangleMemory & { pickedBack: { name: string; data: unknown } | null; pickBlocked: boolean };

type PageState = { data: RectangleDraft; memory: PageMemory; baseline: RectangleDraft };

type PageEvent =
  | { kind: 'patch'; update: Partial<RectangleDraft> }
  | { kind: 'remember'; update: Partial<PageMemory> }
  | { kind: 'replace'; data: RectangleDraft; pick: { name: string; data: unknown } | null }
  | { kind: 'saved'; data: RectangleDraft };

function openingState(
  data: RectangleDraft,
  baseline: RectangleDraft,
  pick: { name: string; data: unknown } | null
): PageState {
  return { data, memory: { ...initialRectangleMemory(data.back), pickedBack: pick, pickBlocked: false }, baseline };
}

function reduce(state: PageState, event: PageEvent): PageState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'remember':
      return { ...state, memory: { ...state.memory, ...event.update } };
    /* A reset rebuilds the whole state rather than assigning a field at a time, so a piece added here later cannot be the one a reset forgets; the seed pick rides on the event because the reducer holds no closure. */
    case 'replace':
      return openingState(event.data, state.baseline, event.pick);
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

function RectangleEditSession({
  access,
  type,
  asset,
  backToken,
  danglingBack,
  initialDraft,
}: {
  access: {
    viewerAccess: NonNullable<AssetPageData>['viewerAccess'];
    assignableGroups: NonNullable<AssetPageData>['assignableGroups'];
  };
  type: string;
  asset: NonNullable<AssetPageData>['asset'];
  backToken: NonNullable<AssetPageData>['backToken'];
  /** The server judged the stored reference dangling; the routes only relay the complaint. */
  danglingBack: boolean;
  initialDraft: RectangleDraft;
}) {
  const authoringAccountKey = useAuthoringAccountKey();
  const navigate = useNavigate();
  const groupActions = useAssetGroupActions({ asset, access });
  const updateAsset = useUpdateAsset();
  const deletion = useAssetDeletion(asset);
  const [chapter, setChapter] = useState<RectangleChapter>('identity');
  const [pickerOpen, setPickerOpen] = useState(false);
  /*
   * Server truth seeds the picked token and a pick replaces it; the draft holds only the id, and this holds the name and face the label and proof draw.
   * A reset returns it to that same server truth, which is why the seed rides on the replace event.
   */
  const [state, dispatch] = useReducer(reduce, undefined, () => openingState(initialDraft, initialDraft, backToken));
  const patch = (update: Partial<RectangleDraft>) => dispatch({ kind: 'patch', update });
  /*
   * The dangling complaint rides the widened validation header beside the widget's own warnings
   * («How a dangling back reference presents»): a signpost, never a second set of mode controls.
   * It routes to Identity, the chapter the back tiles live in.
   */
  const nameField = assetNameField({
    name: state.data.name,
    onName: (name) => patch({ name }),
    canRename: access.viewerAccess.capabilities.rename,
    noun: 'token',
  });
  const warnings: (RectangleWarning | { source: string; complaint: string; chapter: RectangleChapter })[] = [
    ...rectangleDraftWarnings(state.data),
    ...(danglingBack && state.data.back.mode === 'reference'
      ? [{ source: 'Backside', complaint: 'its referenced back is gone', chapter: 'identity' as RectangleChapter }]
      : []),
  ];
  /* The proof draws what was picked, which is the target's authored back, never its front; the shared reader carries the distrust. */
  /* Dirty reads the draft alone and never the memory beside it (D6): memory is never posted, so counting it would arm a Save that writes an identical payload. */
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);
  const isNameBlank = !state.data.name.trim();
  const saveState: AuthoringSaveState = updateAsset.isPending
    ? 'saving'
    : updateAsset.error
      ? 'error'
      : updateAsset.data !== undefined
        ? 'saved'
        : 'idle';
  const header = useEditPageHeader({
    warnings,
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });

  const pickless = state.data.back.mode === 'reference' && state.data.back.asset_id === null;

  const save = () => {
    /* A pickless save stops before the write, so it clears the previous write's failure itself rather than showing it beside its own. */
    updateAsset.reset();
    /* A pickless reference is blocked here with words, rather than letting the stored schema answer with a Zod error. */
    dispatch({ kind: 'remember', update: { pickBlocked: pickless } });
    if (pickless) {
      return;
    }
    /* The stored schema's own keys decide what is posted, so the session's memory can never ride along (D3). */
    const saved = postedPayload(RectangleTokenAsset, state.data);
    updateAsset.mutate(
      { id: asset.id, data: saved },
      {
        onSuccess: ({ slug: nextSlug }) => {
          dispatch({ kind: 'saved', data: saved });
          /* Renames re-slug: follow the token to its new URL so a reload keeps editing it. */
          if (nextSlug !== asset.slug) {
            void navigate({ to: '/assets/$type/$slug/edit', params: { type, slug: nextSlug }, replace: true });
          }
        },
      }
    );
  };

  return (
    <PageLayout>
      {header.slot}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          scopeKey={authoringAccountKey}
          load={tokenLoad({
            type: 'token-enhance',
            schema: LoadedRectangleDraft,
            editing: asset,
            canRename: access.viewerAccess.capabilities.rename,
            saveState,
            header,
            dispatch,
          })}
          status={{ isDirty, isNameBlank, saveState }}
          copy={{
            saveLabel: 'Save token',
            nameBlankMessage: 'Add a token name before saving; it determines the token URL.',
          }}
          actions={{
            onSave: save,
            onReset: header.releasing(() => dispatch({ kind: 'replace', data: state.baseline, pick: backToken })),
            onBack: () => void navigate({ to: '/assets/$type/$slug', params: { type, slug: asset.slug } }),
          }}
          accessActions={groupActions.accessActions}
          statuses={[groupActions.status]}
          destructiveActions={
            access.viewerAccess.capabilities.delete ? (
              <HoldAction label="Delete token" pending={deletion.pending} onConfirm={deletion.confirm} />
            ) : null
          }
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <ActionError verb="save" subject="token" error={updateAsset.error} />
          <ActionError subject="Token" verb="delete" error={deletion.error} />
          {groupActions.error}
          {state.memory.pickBlocked && pickless ? (
            <Notice tone="caution" title="No token picked" live>
              Pick a token whose back this one wears, or choose another back mode.
            </Notice>
          ) : null}
          <RectangleTokenEditor
            nameField={nameField}
            draft={state.data}
            patch={patch}
            memory={state.memory}
            remember={(update) => dispatch({ kind: 'remember', update })}
            chapter={chapter}
            onChapterChange={setChapter}
            onSettle={header.settle}
            backPicker={() => (
              <Group gap="xs" wrap="nowrap">
                <TruncatedText size="sm" flex={1}>
                  {state.memory.pickedBack ? state.memory.pickedBack.name : 'No token chosen yet'}
                </TruncatedText>
                {/* Gated by the popover: the picker subscribes on mount, so it must not mount until asked for. */}
                <Popover opened={pickerOpen} onChange={setPickerOpen} width={340} position="bottom-start" withinPortal>
                  <Popover.Target>
                    <LabeledAction
                      size="compact-sm"
                      icon={<Replace size={14} />}
                      onClick={() => setPickerOpen((open) => !open)}
                    >
                      {state.memory.pickedBack ? 'Change' : 'Choose'}
                    </LabeledAction>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <AssetPicker
                      previewSide="back"
                      types={[type]}
                      excludeIds={[asset.id]}
                      /* Only an authored back is referenceable («Which tokens are referenceable»); token listings are unpresented, so the stored mode is readable here. */
                      filter={(entry) => (entry.data as { back?: { mode?: string } } | null)?.back?.mode === 'custom'}
                      copy={{
                        searchLabel: 'Search tokens',
                        searchPlaceholder: 'Type a name, slug or owner…',
                        emptyMessage: 'No other token of this shape has an authored back yet.',
                      }}
                      onPick={(picked) => {
                        setPickerOpen(false);
                        /* A pick is a draft edit, not a write; the reference reaches storage when the token is saved («The stored shape of three back modes»: one field, one writer). */
                        dispatch({ kind: 'remember', update: { pickedBack: picked } });
                        patch({ back: { mode: 'reference', asset_id: picked.id } });
                      }}
                      onCancel={() => setPickerOpen(false)}
                    />
                  </Popover.Dropdown>
                </Popover>
              </Group>
            )}
            backProof={referencedBackProof(state.memory.pickedBack, referencedRectangleBackFace, (face) => (
              <RectangleProof face={face} />
            ))}
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
