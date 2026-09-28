import { useReducer, useState } from 'react';

import type { AssetPageData } from '@app/db/assets';
import { postedPayload } from '@app/widgets/authoring/authoringEnvelope';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { SpiceCardEditor, spiceDraftWarnings } from '@app/widgets/card-editor/SpiceCardEditor';
import type { SpiceChapter, SpiceDraft } from '@app/widgets/card-editor/SpiceCardEditor';
import { SpiceAsset } from '@game/data/objects';

import { useAssetNameField } from '../../../assetEditorStates';
import { CardEditFrame, CardEditGate, useCardSave } from './cardEditPage';
import type { CardEditSessionProps } from './cardEditPage';

/** The spice card edit page. Mounted by the generic `$type/$slug/edit` route when the type is `card-spice`. */
export function SpiceEditPage({ slug, loaderData }: { slug: string; loaderData: AssetPageData }) {
  return (
    <CardEditGate
      type="card-spice"
      schemaName="spice card"
      schema={SpiceAsset}
      slug={slug}
      loaderData={loaderData}
      session={(props) => <CardEditSession {...props} />}
    />
  );
}

/**
 * This page's authoring state, and the three things that happen to it.
 * Written here rather than shared, as every editor's is (D7 on «Work the editors wave»).
 */
type SpiceState = { data: SpiceDraft; baseline: SpiceDraft };

type SpiceEvent =
  | { kind: 'patch'; update: Partial<SpiceDraft> }
  | { kind: 'replace'; data: SpiceDraft }
  | { kind: 'saved'; data: SpiceDraft };

function reduce(state: SpiceState, event: SpiceEvent): SpiceState {
  switch (event.kind) {
    case 'patch':
      return { ...state, data: { ...state.data, ...event.update } };
    case 'replace':
      return { data: event.data, baseline: state.baseline };
    case 'saved':
      return { ...state, baseline: event.data };
  }
}

function CardEditSession({ asset, initialDraft, access }: CardEditSessionProps<SpiceDraft>) {
  const saving = useCardSave('card-spice', asset);
  const [chapter, setChapter] = useState<SpiceChapter>('head');
  const [state, dispatch] = useReducer(reduce, { data: initialDraft, baseline: initialDraft });
  const patch = (update: Partial<SpiceDraft>) => dispatch({ kind: 'patch', update });
  const { nameField, conflictWarnings } = useAssetNameField({
    type: 'card-spice',
    name: state.data.name,
    onName: (name) => patch({ name }),
    currentSlug: asset.slug,
    source: 'Head',
    chapter: 'head' as SpiceChapter,
    canRename: access.viewerAccess.capabilities.rename,
    noun: 'card',
  });
  const header = useEditPageHeader({
    warnings: [...spiceDraftWarnings(state.data), ...conflictWarnings],
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const isDirty = JSON.stringify(state.data) !== JSON.stringify(state.baseline);

  const save = () => {
    const payload = postedPayload(SpiceAsset, state.data);
    saving.save(payload, () => dispatch({ kind: 'saved', data: payload }));
  };

  return (
    <CardEditFrame
      type="card-spice"
      asset={asset}
      access={access}
      headerSlot={header.slot}
      status={{ isDirty, isNameBlank: !state.data.name.trim(), saveState: saving.saveState }}
      onSave={save}
      onReset={header.releasing(() => dispatch({ kind: 'replace', data: state.baseline }))}
      saveError={saving.error}
    >
      <SpiceCardEditor
        nameField={nameField}
        draft={state.data}
        patch={patch}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={header.settle}
      />
    </CardEditFrame>
  );
}
