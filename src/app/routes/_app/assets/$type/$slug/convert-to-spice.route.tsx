import { Alert, Stack, Text } from '@mantine/core';
import { CustomCardAsset, SpiceAsset } from '@shared/assets/schema';
import { slugify } from '@shared/slugify';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { ConfirmConvertAction } from '@ui/control/ConfirmConvertAction';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useReducer, useState } from 'react';

import { loadAssetPage, useConvertCustomToSpice } from '@app/db/assets';
import { mutationErrorMessage } from '@app/db/core/mutationError';
import { assetLoad } from '@app/pickers/assetLoadSource';
import { pageHead } from '@app/routes/pageTitle';
import { LoadExisting } from '@app/widgets/authoring/LoadExisting';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import { INITIAL_SPICE_DRAFT, SpiceCardEditor, spiceDraftWarnings } from '@app/widgets/card-editor/SpiceCardEditor';
import type { SpiceChapter, SpiceDraft } from '@app/widgets/card-editor/SpiceCardEditor';

import { assetNameField } from '../../assetEditorStates';
import { layeredCardTokenPicker } from '../../layeredCardTokenPicker';
import { SpiceBoardRead, spiceBoardSelect } from '../../spiceCardBoard';
import { CardEditGate } from './edit/cardEditPage';
import type { CardEditSessionProps } from './edit/cardEditPage';

export const Route = createFileRoute('/_app/assets/$type/$slug/convert-to-spice')({
  loader: async ({ params }) => {
    if (params.type !== 'card-custom') {
      throw notFound();
    }
    return await loadAssetPage(params.type, params.slug);
  },
  head: ({ match }) => pageHead('Convert custom card to spice card', { match }),
  component: ConvertPage,
});

function ConvertPage() {
  const { slug } = Route.useParams();
  return (
    <CardEditGate
      type="card-custom"
      schemaName="custom card"
      schema={CustomCardAsset}
      slug={slug}
      loaderData={Route.useLoaderData()}
      session={(props) => <ConversionSession {...props} />}
    />
  );
}

type State = { draft: SpiceDraft; initial: SpiceDraft };
type Event =
  | { kind: 'patch'; update: Partial<SpiceDraft> }
  | { kind: 'replace'; draft: SpiceDraft }
  | { kind: 'reset' };
function reduce(state: State, event: Event): State {
  switch (event.kind) {
    case 'patch':
      return { ...state, draft: { ...state.draft, ...event.update } };
    case 'replace':
      return { ...state, draft: event.draft };
    case 'reset':
      return { ...state, draft: state.initial };
  }
}

function ConversionSession({ asset, initialDraft, access }: CardEditSessionProps<{ name: string; about: string }>) {
  const initial = { ...INITIAL_SPICE_DRAFT, name: initialDraft.name, about: initialDraft.about };
  const [state, dispatch] = useReducer(reduce, { draft: initial, initial });
  const [chapter, setChapter] = useState<SpiceChapter>('identity');
  const conversion = useConvertCustomToSpice();
  const targetSlug = state.draft.name === asset.name ? asset.slug : slugify(state.draft.name);
  const navigate = Route.useNavigate();
  const patch = (update: Partial<SpiceDraft>) => dispatch({ kind: 'patch', update });
  const parsed = SpiceAsset.safeParse(state.draft);
  const blocked =
    conversion.isPending ||
    !parsed.success ||
    !targetSlug ||
    targetSlug === 'create' ||
    !access.viewerAccess.capabilities.edit;
  const header = useEditPageHeader({
    warnings: [...spiceDraftWarnings(state.draft)],
    onFocusWarning: (warning) => setChapter(warning.chapter),
  });
  const convert = () => {
    if (blocked || !parsed.success) {
      return;
    }
    conversion.mutate(
      { id: asset.id, data: parsed.data },
      {
        onSuccess: ({ slug }) => void navigate({ to: '/assets/$type/$slug', params: { type: 'card-spice', slug } }),
      }
    );
  };
  const load = assetLoad({
    noun: 'card',
    type: 'card-spice',
    schema: SpiceAsset,
    editing: asset,
    canRename: access.viewerAccess.capabilities.rename,
    disabled: conversion.isPending,
    onLoaded: header.releasing(({ data }) => {
      dispatch({ kind: 'replace', draft: data });
      setChapter('identity');
    }),
  });
  return (
    <PageLayout>
      {header.slot ?? (
        <PageLayout.Header size="compact">
          <PageTitle title={`Convert ${asset.name} to a spice card`} />
        </PageLayout.Header>
      )}
      <PageLayout.Toolbar>
        <LoadExisting {...load}>
          {(loadAction) => (
            <Toolbar>
              <Toolbar.Left label="Navigation">
                <IconAction
                  label="Back to custom card"
                  emphasis="standard"
                  intent="neutral"
                  size="lg"
                  icon={<ArrowLeft size={17} aria-hidden />}
                  renderRoot={(props) => (
                    <Link {...props} to="/assets/$type/$slug" params={{ type: 'card-custom', slug: asset.slug }} />
                  )}
                />
              </Toolbar.Left>
              <Toolbar.Right label="Conversion actions">
                <Toolbar.Cluster kind="content">{loadAction}</Toolbar.Cluster>
                <Toolbar.Cluster kind="discard">
                  <IconAction
                    label="Reset spice draft"
                    emphasis="standard"
                    intent="neutral"
                    size="lg"
                    disabled={conversion.isPending}
                    onClick={header.releasing(() => dispatch({ kind: 'reset' }))}
                    icon={<RotateCcw size={17} aria-hidden />}
                  />
                  <ConfirmConvertAction
                    target="spice card"
                    pending={conversion.isPending}
                    disabled={blocked}
                    onConfirm={convert}
                  />
                </Toolbar.Cluster>
              </Toolbar.Right>
            </Toolbar>
          )}
        </LoadExisting>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout gap="sm">
          <Alert title="Review the spice card before converting" color="blue">
            <Stack gap="xs">
              <Text size="sm">
                Conversion replaces the custom layers with the spice draft shown here. It keeps this card's identity,
                owner, Group, deck quantities and Ruleset references. Its previous public link will redirect to the
                spice card. This cannot be reversed.
              </Text>
              <Text size="sm">Destination: /assets/card-spice/{targetSlug || '…'}</Text>
              <Text size="sm">Loading changes this draft only. Hold the conversion action when it is ready.</Text>
            </Stack>
          </Alert>
          {conversion.error ? (
            <Alert color="red" title="Could not convert" role="alert">
              {mutationErrorMessage(conversion.error)}
            </Alert>
          ) : null}
          <SpiceBoardRead
            draft={state.draft}
            render={(boardRead) => (
              <SpiceCardEditor
                nameField={assetNameField({
                  name: state.draft.name,
                  onName: (name) => patch({ name }),
                  canRename: access.viewerAccess.capabilities.rename,
                  noun: 'card',
                })}
                draft={state.draft}
                patch={patch}
                chapter={chapter}
                onChapterChange={setChapter}
                onSettle={header.settle}
                boardRead={boardRead}
                boardSelect={spiceBoardSelect}
                tokenPicker={layeredCardTokenPicker}
              />
            )}
          />
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}
