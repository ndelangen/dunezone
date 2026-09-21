import { Anchor, Select, Stack, Text } from '@mantine/core';
import type { CardbackPresetKey } from '@shared/assets/cardbackPresetKeys';
import type { CardbackPreset } from '@shared/assets/cardbackPresets';
import { CardBack as CardBackSchema } from '@shared/assets/schema';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { Surface } from '@ui/surface';
import { useReducer, useRef, useState } from 'react';

import { useCardbackPresetEditor, useSaveCardbackPreset } from '@db/cardbackPresets';
import { CardFrame } from '@app/widgets/asset-face/AssetFace';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import type { BackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import { emptyBackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import { CardbackFields } from '@app/widgets/cardback-editor/CardbackFields';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { CardBack } from '@game/assets/card/Back';

import { SaveErrorAlert } from './assetEditorStates';

export const Route = createFileRoute('/_app/assets/__presets')({ component: CardbackPresetsPage });

type Draft = { cardback: CardbackPreset['cardback']; revision: number; custom: boolean; memory: BackgroundModeMemory };
type Drafts = Partial<Record<CardbackPresetKey, Draft>>;
type Edit =
  | { kind: 'edit'; key: CardbackPresetKey; baseline: Draft; change: Partial<Draft> }
  | { kind: 'reset'; key: CardbackPresetKey };
function reduce(drafts: Drafts, event: Edit): Drafts {
  if (event.kind === 'edit') {
    return { ...drafts, [event.key]: { ...(drafts[event.key] ?? event.baseline), ...event.change } };
  }
  const next = { ...drafts };
  delete next[event.key];
  return next;
}

function CardbackPresetsPage() {
  const data = useCardbackPresetEditor();
  if (!data) {
    return (
      <PageMessage title="Card-back presets">
        <LoadPending title="Loading presets">Loading the saved designs.</LoadPending>
      </PageMessage>
    );
  }
  if (data.access === 'anonymous') {
    return (
      <PageMessage title="Card-back presets">
        <LoginGate action="edit card-back presets" />
      </PageMessage>
    );
  }
  if (data.access === 'denied') {
    return (
      <PageMessage title="Card-back presets">
        <NotAvailable title="Administrator access required">
          Only Administrators can edit shared card-back presets.
        </NotAvailable>
      </PageMessage>
    );
  }
  return <PresetEditor presets={data.presets} />;
}

/** The page owns drafts; switching between presets preserves each unsaved design. */
function PresetEditor({ presets }: Readonly<{ presets: CardbackPreset[] }>) {
  const [selected, setSelected] = useState<CardbackPresetKey>('treachery');
  const [drafts, dispatch] = useReducer(reduce, {});
  const save = useSaveCardbackPreset();
  const navigate = useNavigate();
  const fields = useRef<HTMLFieldSetElement>(null);
  const preset = presets.find((entry) => entry.key === selected)!;
  const draft = drafts[selected] ?? {
    cardback: preset.cardback,
    revision: preset.revision,
    custom: false,
    memory: emptyBackgroundModeMemory(),
  };
  const update = (change: Partial<Draft>) => dispatch({ kind: 'edit', key: selected, baseline: draft, change });
  const parsed = CardBackSchema.safeParse(draft.cardback);
  const dirty = JSON.stringify(draft.cardback) !== JSON.stringify(preset.cardback);
  const stale = draft.revision !== preset.revision;
  const warnings = parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({ source: 'Card back', complaint: issue.message }));
  if (stale) {
    warnings.push({ source: 'Preset', complaint: 'changed elsewhere. Reset to load the saved version.' });
  }
  const header = useEditPageHeader({ warnings, onFocusWarning: () => fields.current?.querySelector('input')?.focus() });
  return (
    <PageLayout>
      {header.slot}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          status={{
            isDirty: dirty || stale,
            isNameBlank: !draft.cardback.name.trim(),
            saveState: presetSaveState(save),
          }}
          copy={{
            saveLabel: preset.captureStatus === 'error' && !dirty ? 'Retry publication' : 'Save and publish',
            nameBlankMessage: 'Add the label printed on the card back.',
          }}
          actions={{
            onBack: () => void navigate({ to: '/assets' }),
            onReset: header.releasing(() => {
              dispatch({ kind: 'reset', key: selected });
              save.reset();
            }),
            onSave: () => {
              if (!parsed.success || stale) {
                return;
              }
              save.mutate(
                { key: selected, cardback: parsed.data, revision: draft.revision },
                { onSuccess: () => dispatch({ kind: 'reset', key: selected }) }
              );
            },
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout>
          <SaveErrorAlert error={save.error} />
          {save.data !== undefined ? (
            <Text role="status">Preset saved. Linked decks update when publication finishes.</Text>
          ) : null}
          <WorkbenchLayout.Workbench>
            <WorkbenchLayout.Chapters>
              <Surface padding="lg">
                <fieldset
                  ref={fields}
                  onBlurCapture={header.settle}
                  disabled={save.isPending}
                  style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
                >
                  <Stack gap="lg">
                    <Select
                      label="Preset"
                      value={selected}
                      allowDeselect={false}
                      disabled={save.isPending}
                      data={presets.map(({ key, label }) => ({ value: key, label }))}
                      onChange={header.releasing((key) => {
                        if (key) {
                          setSelected(key as CardbackPresetKey);
                          save.reset();
                        }
                      })}
                    />
                    <CardbackFields
                      cardback={draft.cardback}
                      onChange={(cardback) => update({ cardback })}
                      declaredCustom={draft.custom}
                      onDeclaredCustomChange={(custom) => update({ custom })}
                      modeMemory={draft.memory}
                      onModeMemoryChange={(memory) => update({ memory })}
                    />
                  </Stack>
                </fieldset>
              </Surface>
            </WorkbenchLayout.Chapters>
            <WorkbenchLayout.Rail>
              <Stack gap="md">
                <CardFrame>
                  <CardBack {...draft.cardback} />
                </CardFrame>
                <Text size="sm">
                  {dirty ? 'Unsaved preview' : 'Saved design'}. Decks linked to {preset.label} share one published back.
                </Text>
                {preset.href ? (
                  <Anchor href={preset.href} target="_blank" rel="noreferrer">
                    View published back
                  </Anchor>
                ) : (
                  <Text size="sm">No published image yet.</Text>
                )}
                {preset.captureStatus ? (
                  <Text size="sm" role="status">
                    {publicationMessage(preset)}
                  </Text>
                ) : null}
              </Stack>
            </WorkbenchLayout.Rail>
          </WorkbenchLayout.Workbench>
        </WorkbenchLayout>
      </PageLayout.Content>
    </PageLayout>
  );
}

function presetSaveState(save: ReturnType<typeof useSaveCardbackPreset>) {
  if (save.isPending) {
    return 'saving' as const;
  }
  if (save.error) {
    return 'error' as const;
  }
  return save.data === undefined ? ('idle' as const) : ('saved' as const);
}

function publicationMessage(preset: CardbackPreset) {
  if (preset.captureStatus === 'error') {
    return preset.href
      ? 'Publication failed. The previous image remains available.'
      : 'Publication failed. Retry to create the first image.';
  }
  return preset.href
    ? 'Publishing. The previous image remains available until the replacement is ready.'
    : 'Publishing the first image.';
}
