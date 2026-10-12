import { Anchor, SegmentedControl, Select, Stack, Switch, Text } from '@mantine/core';
import type { CardbackPresetKey } from '@shared/assets/cardbackPresetKeys';
import type { CardbackPreset } from '@shared/assets/cardbackPresets';
import { cardFrontStyleSchema, INITIAL_CARD_FRONT_PRESETS } from '@shared/assets/cardFrontPresets';
import type { CardFrontPreset, CardFrontPresetKey, CardFrontStyle } from '@shared/assets/cardFrontPresets';
import { GF9_LEADER_SKILLS } from '@shared/assets/gf9LeaderSkills';
import { GF9_NEXUS_CARDS } from '@shared/assets/gf9Nexus';
import { GF9_STRONGHOLD_CARDS } from '@shared/assets/gf9StrongholdDeck';
import { CardBack as CardBackSchema } from '@shared/assets/schema';
import { standardStormCard } from '@shared/assets/standardStormDeck';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageLayout } from '@ui/layout/PageLayout';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { Surface } from '@ui/surface';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Circle, Palette } from 'lucide-react';
import { useReducer, useRef } from 'react';

import { useSaveCardbackPreset } from '@db/cardbackPresets';
import { useCardPresetsPage, useSaveCardFrontPreset } from '@db/cardFrontPresets';
import { useSessionViewer } from '@db/profiles';
import { pageHead } from '@app/routes/pageTitle';
import { CardFrame } from '@app/widgets/asset-face/AssetFace';
import { AuthoringToolbar } from '@app/widgets/authoring/AuthoringToolbar';
import { useEditPageHeader } from '@app/widgets/authoring/useEditPageHeader';
import type { BackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import { BackgroundComposer, emptyBackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import { INITIAL_TREACHERY_DRAFT } from '@app/widgets/card-editor/TreacheryCardEditor';
import { CardbackFields } from '@app/widgets/cardback-editor/CardbackFields';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { CardBack } from '@game/assets/card/Back';
import { LeaderSkillCard } from '@game/assets/card/LeaderSkill';
import { NexusCard } from '@game/assets/card/Nexus';
import { StormCard } from '@game/assets/card/Storm';
import { StrongholdCard } from '@game/assets/card/Stronghold';
import { TreacheryCard } from '@game/assets/treachery/Treachery';

import { SaveErrorAlert } from './assetEditorStates';

export const Route = createFileRoute('/_app/assets/__presets')({
  head: () => pageHead('Card presets'),
  component: CardPresetsPage,
});

type BackDraft = {
  cardback: CardbackPreset['cardback'];
  revision: number;
  custom: boolean;
  memory: BackgroundModeMemory;
};
type FrontDraft = {
  style: CardFrontStyle;
  revision: number;
  headMemory: BackgroundModeMemory;
  iconMemory: BackgroundModeMemory;
  rememberedIcon: CardFrontStyle['iconBackground'];
};
type State = {
  face: 'front' | 'back';
  front: CardFrontPresetKey;
  back: CardbackPresetKey;
  chapter: 'head' | 'icon';
  fronts: Partial<Record<CardFrontPresetKey, FrontDraft>>;
  backs: Partial<Record<CardbackPresetKey, BackDraft>>;
};
type Event =
  | { kind: 'select'; selection: Partial<Pick<State, 'face' | 'front' | 'back' | 'chapter'>> }
  | { kind: 'front'; key: CardFrontPresetKey; baseline: FrontDraft; change: Partial<FrontDraft> }
  | { kind: 'back'; key: CardbackPresetKey; baseline: BackDraft; change: Partial<BackDraft> }
  | { kind: 'reset' };
function reduce(state: State, event: Event): State {
  switch (event.kind) {
    case 'select':
      return { ...state, ...event.selection };
    case 'front':
      return {
        ...state,
        fronts: { ...state.fronts, [event.key]: { ...(state.fronts[event.key] ?? event.baseline), ...event.change } },
      };
    case 'back':
      return {
        ...state,
        backs: { ...state.backs, [event.key]: { ...(state.backs[event.key] ?? event.baseline), ...event.change } },
      };
    case 'reset': {
      const fronts = { ...state.fronts },
        backs = { ...state.backs };
      if (state.face === 'front') {
        delete fronts[state.front];
      } else {
        delete backs[state.back];
      }
      return { ...state, fronts, backs };
    }
  }
}

function CardPresetsPage() {
  const viewer = useSessionViewer();
  const presets = useCardPresetsPage();
  const pending = (
    <PageMessage title="Card presets">
      <LoadPending title="Loading presets">Loading the saved designs.</LoadPending>
    </PageMessage>
  );
  switch (viewer.kind) {
    case 'pending':
      return pending;
    case 'signed-out':
      return (
        <PageMessage title="Card presets">
          <LoginGate action="edit card presets" />
        </PageMessage>
      );
    case 'profile':
      if (!viewer.isAdmin) {
        return (
          <PageMessage title="Card presets">
            <NotAvailable title="Administrator access required">
              Only Administrators can edit shared card presets.
            </NotAvailable>
          </PageMessage>
        );
      }
      return presets ? <PresetEditor fronts={presets.fronts} backs={presets.backs} /> : pending;
  }
}

/* Drafts survive changes of face and preset. Saved revisions detect concurrent Administrator edits. */
function PresetEditor({ fronts, backs }: { fronts: CardFrontPreset[]; backs: CardbackPreset[] }) {
  const [state, dispatch] = useReducer(reduce, {
    face: 'back',
    front: 'stronghold',
    back: 'treachery',
    chapter: 'head',
    fronts: {},
    backs: {},
  });
  const saveBack = useSaveCardbackPreset(),
    saveFront = useSaveCardFrontPreset();
  const save = state.face === 'back' ? saveBack : saveFront;
  const navigate = useNavigate();
  const fields = useRef<HTMLFieldSetElement>(null);
  const front = fronts.find((entry) => entry.key === state.front)!;
  const back = backs.find((entry) => entry.key === state.back)!;
  const frontDraft = state.fronts[state.front] ?? {
    style: front.style,
    revision: front.revision,
    headMemory: emptyBackgroundModeMemory(),
    iconMemory: emptyBackgroundModeMemory(),
    rememberedIcon: null,
  };
  const backDraft = state.backs[state.back] ?? {
    cardback: back.cardback,
    revision: back.revision,
    custom: false,
    memory: emptyBackgroundModeMemory(),
  };
  const updateFront = (change: Partial<FrontDraft>) =>
    dispatch({ kind: 'front', key: state.front, baseline: frontDraft, change });
  const updateBack = (change: Partial<BackDraft>) =>
    dispatch({ kind: 'back', key: state.back, baseline: backDraft, change });
  const parsedFront = cardFrontStyleSchema.safeParse(frontDraft.style),
    parsedBack = CardBackSchema.safeParse(backDraft.cardback);
  const frontFace = state.face === 'front';
  const parsed = frontFace ? parsedFront : parsedBack;
  const dirty = frontFace
    ? JSON.stringify(frontDraft.style) !== JSON.stringify(front.style)
    : JSON.stringify(backDraft.cardback) !== JSON.stringify(back.cardback);
  const stale = frontFace ? frontDraft.revision !== front.revision : backDraft.revision !== back.revision;
  const warnings = parsed.success
    ? []
    : parsed.error.issues.map((issue) => ({ source: 'Preset', complaint: issue.message }));
  if (stale) {
    warnings.push({ source: 'Preset', complaint: 'changed elsewhere. Reset to load the saved version.' });
  }
  const header = useEditPageHeader({ warnings, onFocusWarning: () => fields.current?.querySelector('input')?.focus() });
  const select = (selection: Extract<Event, { kind: 'select' }>['selection']) => {
    dispatch({ kind: 'select', selection });
    saveBack.reset();
    saveFront.reset();
  };
  return (
    <PageLayout>
      {header.slot}
      <PageLayout.Toolbar>
        <AuthoringToolbar
          status={{
            isDirty: dirty || stale,
            isNameBlank: !frontFace && !backDraft.cardback.name.trim(),
            saveState: presetSaveState(save),
          }}
          copy={{
            saveLabel:
              !frontFace && back.captureStatus === 'error' && !dirty ? 'Retry publication' : 'Save and publish',
            nameBlankMessage: 'Add the label printed on the card back.',
          }}
          actions={{
            onBack: () => void navigate({ to: '/assets' }),
            onReset: header.releasing(() => {
              dispatch({ kind: 'reset' });
              save.reset();
            }),
            onSave: () => {
              if (stale) {
                return;
              }
              if (frontFace && parsedFront.success) {
                saveFront.mutate(
                  { key: state.front, style: parsedFront.data, revision: frontDraft.revision },
                  { onSuccess: () => dispatch({ kind: 'reset' }) }
                );
              } else if (!frontFace && parsedBack.success) {
                saveBack.mutate(
                  { key: state.back, cardback: parsedBack.data, revision: backDraft.revision },
                  { onSuccess: () => dispatch({ kind: 'reset' }) }
                );
              }
            },
          }}
        />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <WorkbenchLayout>
          <SaveErrorAlert error={save.error} />
          {save.data !== undefined ? (
            <Text role="status">
              {frontFace
                ? 'Preset saved. Cards update when publication finishes.'
                : 'Preset saved. Linked decks update when publication finishes.'}
            </Text>
          ) : null}
          <Stack gap="md">
            <SegmentedControl
              aria-label="Card face"
              value={state.face}
              disabled={save.isPending}
              data={[
                { value: 'front', label: 'Front' },
                { value: 'back', label: 'Back' },
              ]}
              onChange={header.releasing((face) => select({ face: face as State['face'] }))}
            />
            <Select
              label="Preset"
              value={frontFace ? state.front : state.back}
              allowDeselect={false}
              disabled={save.isPending}
              data={(frontFace ? fronts : backs).map(({ key, label }) => ({ value: key, label }))}
              onChange={header.releasing((key) => {
                if (key) {
                  select(frontFace ? { front: key as CardFrontPresetKey } : { back: key as CardbackPresetKey });
                }
              })}
            />
          </Stack>
          <WorkbenchLayout.Workbench>
            <WorkbenchLayout.Chapters>
              <fieldset
                ref={fields}
                onBlurCapture={header.settle}
                disabled={save.isPending}
                style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
              >
                {frontFace ? (
                  <ConnectedTabs
                    value={state.chapter}
                    onValueChange={(chapter) => {
                      select({ chapter });
                      header.settle();
                    }}
                    ariaLabel="Front preset sections"
                    items={[
                      {
                        value: 'head',
                        label: 'Header',
                        icon: <Palette size={21} aria-hidden />,
                        panel: (
                          <BackgroundComposer
                            value={frontDraft.style.head}
                            onChange={(head) => updateFront({ style: { ...frontDraft.style, head } })}
                            modeMemory={frontDraft.headMemory}
                            onModeMemoryChange={(headMemory) => updateFront({ headMemory })}
                            usedOn={`${front.label} card headers`}
                          />
                        ),
                      },
                      {
                        value: 'icon',
                        label: 'Icon background',
                        icon: <Circle size={21} aria-hidden />,
                        panel: (
                          <Stack gap="md">
                            {front.key === 'nexus' ? (
                              <Switch
                                label="Use each card's faction background"
                                checked={frontDraft.style.iconBackground === null}
                                onChange={(event) => {
                                  const useFaction = event.currentTarget.checked;
                                  updateFront({
                                    rememberedIcon: frontDraft.style.iconBackground ?? frontDraft.rememberedIcon,
                                    style: {
                                      ...frontDraft.style,
                                      iconBackground: useFaction
                                        ? null
                                        : (frontDraft.rememberedIcon ?? frontDraft.style.head),
                                    },
                                  });
                                }}
                              />
                            ) : null}
                            {frontDraft.style.iconBackground ? (
                              <BackgroundComposer
                                value={frontDraft.style.iconBackground}
                                onChange={(iconBackground) =>
                                  updateFront({ style: { ...frontDraft.style, iconBackground } })
                                }
                                modeMemory={frontDraft.iconMemory}
                                onModeMemoryChange={(iconMemory) => updateFront({ iconMemory })}
                                usedOn={`${front.label} card icons`}
                              />
                            ) : (
                              <Text size="sm">Each Nexus card keeps its faction background and symbol.</Text>
                            )}
                          </Stack>
                        ),
                      },
                    ]}
                  />
                ) : (
                  <Surface padding="lg">
                    <CardbackFields
                      cardback={backDraft.cardback}
                      onChange={(cardback) => updateBack({ cardback })}
                      declaredCustom={backDraft.custom}
                      onDeclaredCustomChange={(custom) => updateBack({ custom })}
                      modeMemory={backDraft.memory}
                      onModeMemoryChange={(memory) => updateBack({ memory })}
                    />
                  </Surface>
                )}
              </fieldset>
            </WorkbenchLayout.Chapters>
            <WorkbenchLayout.Rail>
              <Stack gap="md">
                <CardFrame>
                  {frontFace ? (
                    <FrontPreview preset={front} style={frontDraft.style} />
                  ) : (
                    <CardBack {...backDraft.cardback} />
                  )}
                </CardFrame>
                <Text size="sm">
                  {dirty ? 'Unsaved preview' : 'Saved design'}.{' '}
                  {frontFace
                    ? `Every ${front.label} card uses this front preset. Symbols, layout and text stay fixed.`
                    : `Decks linked to ${back.label} share one published back.`}
                </Text>
                {!frontFace ? (
                  back.href ? (
                    <Anchor href={back.href} target="_blank" rel="noreferrer">
                      View published back
                    </Anchor>
                  ) : (
                    <Text size="sm">No published image yet.</Text>
                  )
                ) : null}
                {!frontFace && back.captureStatus ? (
                  <Text size="sm" role="status">
                    {publicationMessage(back)}
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

function FrontPreview({ preset, style }: { preset: CardFrontPreset; style: CardFrontStyle }) {
  switch (preset.key) {
    case 'stronghold':
      return <StrongholdCard {...GF9_STRONGHOLD_CARDS[5]!} frontStyle={style} />;
    case 'storm':
      return <StormCard {...standardStormCard(3)} frontStyle={style} />;
    case 'nexus':
      return <NexusCard {...GF9_NEXUS_CARDS[0]!} frontStyle={style} />;
    case 'leader-skill':
      return <LeaderSkillCard {...GF9_LEADER_SKILLS[0]} frontStyle={style} />;
    default: {
      const initial = INITIAL_CARD_FRONT_PRESETS.find((entry) => entry.key === preset.key)!;
      return (
        <TreacheryCard
          {...INITIAL_TREACHERY_DRAFT}
          name={preset.label}
          subName={preset.key.slice('treachery-'.length)}
          head={initial.style.head}
          text="This category uses the shared header and icon background."
          frontStyle={style}
        />
      );
    }
  }
}

function presetSaveState(save: ReturnType<typeof useSaveCardbackPreset> | ReturnType<typeof useSaveCardFrontPreset>) {
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
