import { Anchor, Badge, Button, Divider, Group, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import { publishingSpiceCard } from '@shared/assets/fixtures/publishingSpiceCard';
import { GF9_LEADER_SKILLS } from '@shared/assets/gf9LeaderSkills';
import { GF9_NEXUS_CARDS } from '@shared/assets/gf9Nexus';
import { GF9_STRONGHOLD_CARDS } from '@shared/assets/gf9StrongholdDeck';
import { EXAMPLE_HOMEWORLD_CARD } from '@shared/assets/homeworldTemplate';
import { standardStormCard } from '@shared/assets/standardStormDeck';
import type { FamilyPreset, DiscoveryPreset } from '@shared/backgrounds/families';
import { resolveBackgroundValues, customBackground, linkedBackground } from '@shared/backgrounds/schema';
import type { BackgroundData, SharedBackgroundPreset } from '@shared/backgrounds/schema';
import { createFileRoute, Link } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { PageLayout } from '@ui/layout/PageLayout';
import { PairedProofLayout } from '@ui/layout/PairedProofLayout';
import { Surface } from '@ui/surface/Surface';
import { useReducer } from 'react';
import type { ReactNode } from 'react';

import {
  usePresetLibrary,
  useSaveFamilyPreset,
  useSaveDiscoveryPreset,
  useInitializePresetLibrary,
} from '@db/backgroundPresets';
import { BackgroundPickerView } from '@app/pickers/BackgroundPicker.parts';
import { pageHead } from '@app/routes/pageTitle';
import { CardFrame } from '@app/widgets/asset-face/AssetFace';
import { BackgroundComposer, emptyBackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import type { BackgroundModeMemory } from '@app/widgets/background-composer/BackgroundComposer';
import { INITIAL_CUSTOM_CARD_DRAFT } from '@app/widgets/card-editor/customCardPresets';
import { INITIAL_TREACHERY_DRAFT } from '@app/widgets/card-editor/TreacheryCardEditor';
import { CardbackFields } from '@app/widgets/cardback-editor/CardbackFields';
import { PageMessage } from '@app/widgets/page-message/PageMessage';
import { CardBack } from '@game/assets/card/Back';
import { CustomCard } from '@game/assets/card/Custom';
import { HomeworldCard } from '@game/assets/card/Homeworld';
import { LeaderSkillCard } from '@game/assets/card/LeaderSkill';
import { NexusCard } from '@game/assets/card/Nexus';
import { SpiceCard } from '@game/assets/card/Spice';
import { StormCard } from '@game/assets/card/Storm';
import { StrongholdCard } from '@game/assets/card/Stronghold';
import { AllianceCard } from '@game/assets/faction/alliance/Alliance';
import { TraitorCard } from '@game/assets/faction/traitor/Traitor';
import { CustomToken } from '@game/assets/token/Custom';
import { tokenFaceProps } from '@game/assets/token/tokenFace';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { Background } from '@game/assets/utils/Background';
import { backgroundPresets } from '@game/data/backgrounds';

import { SaveErrorAlert } from '../assets/assetEditorStates';

export const Route = createFileRoute('/_app/admin/presets')({
  head: () => pageHead('Presets'),
  component: PresetsPage,
});

type Preset = FamilyPreset | DiscoveryPreset;
type State = {
  open: string | null;
  active: string | null;
  search: string;
  drafts: Record<string, Preset>;
  backgrounds: Record<string, SharedBackgroundPreset>;
  memory: BackgroundModeMemory;
};
type Event =
  | { kind: 'open'; key: string | null }
  | { kind: 'active'; region: string | null }
  | { kind: 'search'; value: string }
  | { kind: 'draft'; value: Preset }
  | { kind: 'background'; value: SharedBackgroundPreset }
  | { kind: 'memory'; value: BackgroundModeMemory }
  | { kind: 'reset'; key: string; backgrounds: string[] };
function reduce(state: State, event: Event): State {
  switch (event.kind) {
    case 'open':
      return { ...state, open: event.key, active: null, memory: emptyBackgroundModeMemory() };
    case 'active':
      return { ...state, active: event.region, memory: emptyBackgroundModeMemory() };
    case 'search':
      return { ...state, search: event.value };
    case 'draft':
      return { ...state, drafts: { ...state.drafts, [event.value.key]: event.value } };
    case 'background':
      return { ...state, backgrounds: { ...state.backgrounds, [event.value.key]: event.value } };
    case 'memory':
      return { ...state, memory: event.value };
    case 'reset': {
      const drafts = { ...state.drafts },
        backgrounds = { ...state.backgrounds };
      delete drafts[event.key];
      for (const key of event.backgrounds) {
        delete backgrounds[key];
      }
      return { ...state, drafts, backgrounds, active: null, memory: emptyBackgroundModeMemory() };
    }
  }
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function regions(preset: Preset): Record<string, BackgroundData | null> {
  return 'style' in preset
    ? { Header: preset.style.head, Icon: preset.style.iconBackground, Back: preset.cardback.background }
    : { Front: preset.front.background, Back: preset.back.background };
}
function replaceRegion(preset: Preset, region: string, value: BackgroundData | null): Preset {
  if ('style' in preset) {
    if (region === 'Header' && value) {
      return { ...preset, style: { ...preset.style, head: value } };
    }
    if (region === 'Icon') {
      return { ...preset, style: { ...preset.style, iconBackground: value } };
    }
    if (region === 'Back' && value) {
      return { ...preset, cardback: { ...preset.cardback, background: value } };
    }
  } else if (value) {
    return region === 'Front'
      ? { ...preset, front: { ...preset.front, background: value } }
      : { ...preset, back: { ...preset.back, background: value } };
  }
  return preset;
}
function PresetsPage() {
  const library = usePresetLibrary();
  if (!library) {
    return (
      <PageMessage title="Presets">
        <LoadPending title="Loading presets">Loading the saved designs.</LoadPending>
      </PageMessage>
    );
  }
  if (!library.ready) {
    return <InitializePresets />;
  }
  return <PresetEditor library={library} />;
}
function InitializePresets() {
  const initialize = useInitializePresetLibrary();
  return (
    <PageMessage title="Presets">
      <Stack>
        <Text>
          Import the current DB designs into shared presets. Existing saved presets keep their settings. Linked artwork
          will be recaptured.
        </Text>
        <Text size="sm">
          This copies the standard decks, Prediction card and Cistern and Ornithopter Discovery tokens. Later edits to
          those originals will not change the presets.
        </Text>
        <Button loading={initialize.isPending} onClick={() => initialize.mutate({})}>
          Import DB designs and recapture
        </Button>
        <SaveErrorAlert error={initialize.error} />
      </Stack>
    </PageMessage>
  );
}
function backgroundChoiceKey(value: BackgroundData | null) {
  if (!value) {
    return 'faction';
  }
  return value.source?.kind === 'preset' ? value.source.key : 'custom';
}
function backgroundEditorLabel(active: boolean, shared: boolean) {
  if (active) {
    return 'Close background editor';
  }
  return shared ? 'Edit shared background' : 'Edit background';
}
function PresetEditor({ library }: Readonly<{ library: NonNullable<ReturnType<typeof usePresetLibrary>> }>) {
  const [state, dispatch] = useReducer(reduce, {
    open: null,
    active: null,
    search: '',
    drafts: {},
    backgrounds: {},
    memory: emptyBackgroundModeMemory(),
  });
  const saveFamily = useSaveFamilyPreset(),
    saveDiscovery = useSaveDiscoveryPreset();
  const saving = saveFamily.isPending || saveDiscovery.isPending;
  const saved = [...library.families, ...library.discovery];
  const backgrounds = [
    ...library.backgrounds.map((preset) => state.backgrounds[preset.key] ?? preset),
    ...Object.values(state.backgrounds).filter(
      (preset) => !library.backgrounds.some((entry) => entry.key === preset.key)
    ),
  ];
  const current = saved.map((preset) => state.drafts[preset.key] ?? preset);
  const resolve = (background: BackgroundData) => resolveBackgroundValues(background, backgrounds);
  const linkedEdits = (preset: Preset) =>
    Object.values(regions(preset))
      .flatMap((value) =>
        value?.source?.kind === 'preset' && state.backgrounds[value.source.key]
          ? [state.backgrounds[value.source.key]!]
          : []
      )
      .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.key === entry.key) === index);
  const reset = (preset: Preset) =>
    dispatch({ kind: 'reset', key: preset.key, backgrounds: linkedEdits(preset).map((entry) => entry.key) });
  function backgroundControl(preset: Preset, region: string, value: BackgroundData | null) {
    const key = backgroundChoiceKey(value);
    const definition = backgrounds.find((entry) => entry.key === key);
    const active = state.open === preset.key && state.active === region;
    const editing = state.open === preset.key;
    const resolved = value ? resolve(value) : backgroundPresets.atreides;
    const choose = (next: BackgroundData | null) => {
      dispatch({
        kind: 'draft',
        value: replaceRegion(preset, region, next),
      });
      dispatch({ kind: 'active', region: next?.source?.kind === 'custom' ? region : null });
    };
    return (
      <Stack key={region} gap="sm">
        <Group gap="sm" wrap="nowrap">
          <BackgroundSwatch value={resolved} />
          {editing ? (
            <Stack gap={0}>
              <Text size="xs" c="dimmed">
                {region} background
              </Text>
              <BackgroundPickerView
                label={`${preset.label} ${region.toLowerCase()} background`}
                value={value}
                resolvedValue={resolved}
                presets={backgrounds}
                factionValue={preset.key === 'nexus' && region === 'Icon' ? backgroundPresets.atreides : undefined}
                onPick={choose}
              />
            </Stack>
          ) : (
            <Stack gap={0}>
              <Text size="xs" c="dimmed">
                {region} background
              </Text>
              <Text size="sm" fw={700}>
                {definition?.name ?? (value ? 'Custom' : "Each card's faction")}
              </Text>
            </Stack>
          )}
        </Group>
        {editing && value ? (
          <Group gap="sm">
            <Button
              variant="subtle"
              size="compact-xs"
              onClick={() => dispatch({ kind: 'active', region: active ? null : region })}
            >
              {backgroundEditorLabel(active, Boolean(definition))}
            </Button>
            <Button
              variant="subtle"
              size="compact-xs"
              onClick={() => {
                const created = {
                  key: `custom/${crypto.randomUUID()}`,
                  name: `${preset.label} ${region.toLowerCase()} copy`,
                  value: resolved,
                  revision: 0,
                };
                dispatch({ kind: 'background', value: created });
                dispatch({ kind: 'draft', value: replaceRegion(preset, region, linkedBackground(created)) });
                dispatch({ kind: 'active', region });
              }}
            >
              New shared background
            </Button>
          </Group>
        ) : null}
        {active && value ? (
          <Stack gap="md">
            {definition ? (
              <>
                <TextInput
                  label="Shared background name"
                  value={definition.name}
                  onChange={(event) =>
                    dispatch({ kind: 'background', value: { ...definition, name: event.currentTarget.value } })
                  }
                />
                <Text size="sm">Saving updates every linked use and queues new captures.</Text>
              </>
            ) : (
              <Text size="sm">Custom settings apply only here.</Text>
            )}
            <BackgroundComposer
              value={resolved}
              usedOn={`${preset.label} ${region.toLowerCase()}`}
              modeMemory={state.memory}
              onModeMemoryChange={(memory) => dispatch({ kind: 'memory', value: memory })}
              onChange={(next) =>
                definition
                  ? dispatch({ kind: 'background', value: { ...definition, value: next } })
                  : dispatch({ kind: 'draft', value: replaceRegion(preset, region, customBackground(next)) })
              }
            />
          </Stack>
        ) : null}
      </Stack>
    );
  }
  function group(baseline: Preset) {
    const preset = state.drafts[baseline.key] ?? baseline;
    const editing = state.open === preset.key;
    const changed =
      !equal(preset, baseline) ||
      linkedEdits(preset).some(
        (entry) =>
          !equal(
            entry,
            library.backgrounds.find((candidate) => candidate.key === entry.key)
          )
      );
    const rendered = resolveBackgroundValues(preset, backgrounds);
    return (
      <Section
        key={preset.key}
        title={preset.label}
        id={`preset-${preset.key}`}
        action={
          <Group gap="sm">
            {changed ? <Badge variant="outline">Draft</Badge> : null}
            <Button
              variant="subtle"
              size="compact-sm"
              disabled={saving}
              onClick={() => {
                dispatch({ kind: 'open', key: editing ? null : preset.key });
                saveFamily.reset();
                saveDiscovery.reset();
              }}
            >
              {editing ? 'Close' : `Edit ${preset.label}`}
            </Button>
          </Group>
        }
      >
        <Surface padding="lg">
          <PairedProofLayout>
            <PairedProofLayout.First>
              <Stack gap="sm">
                <Text size="xs" c="dimmed" ta="center">
                  Front
                </Text>
                {'style' in rendered ? (
                  <CardFrame>
                    <FrontPreview preset={rendered} />
                  </CardFrame>
                ) : (
                  <CustomToken {...tokenFaceProps(rendered.front)} />
                )}
              </Stack>
            </PairedProofLayout.First>
            <PairedProofLayout.Settings>
              <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                <Stack gap="lg">
                  {Object.entries(regions(preset)).map(([region, value]) => backgroundControl(preset, region, value))}
                  {editing && 'style' in preset ? (
                    <>
                      <Divider />
                      <CardbackFields
                        section="label"
                        cardback={preset.cardback}
                        onChange={(cardback) => dispatch({ kind: 'draft', value: { ...preset, cardback } })}
                        declaredCustom={false}
                        onDeclaredCustomChange={() => undefined}
                        modeMemory={state.memory}
                        onModeMemoryChange={(memory) => dispatch({ kind: 'memory', value: memory })}
                      />
                      <CardbackFields
                        section="emblem"
                        cardback={preset.cardback}
                        onChange={(cardback) => dispatch({ kind: 'draft', value: { ...preset, cardback } })}
                        declaredCustom={false}
                        onDeclaredCustomChange={() => undefined}
                        modeMemory={state.memory}
                        onModeMemoryChange={(memory) => dispatch({ kind: 'memory', value: memory })}
                      />
                    </>
                  ) : null}
                  {editing && !('style' in preset) ? (
                    <>
                      <NumberInput
                        label="Front symbol size"
                        min={0.5}
                        max={2}
                        step={0.05}
                        value={preset.front.symbolScale}
                        onChange={(value) => {
                          if (typeof value === 'number') {
                            dispatch({
                              kind: 'draft',
                              value: { ...preset, front: { ...preset.front, symbolScale: value } },
                            });
                          }
                        }}
                      />
                      <NumberInput
                        label="Back symbol size"
                        min={0.5}
                        max={2}
                        step={0.05}
                        value={preset.back.symbolScale}
                        onChange={(value) => {
                          if (typeof value === 'number') {
                            dispatch({
                              kind: 'draft',
                              value: { ...preset, back: { ...preset.back, symbolScale: value } },
                            });
                          }
                        }}
                      />
                    </>
                  ) : null}
                  {editing ? (
                    <Group gap="sm">
                      <Button
                        disabled={!changed || saving}
                        loading={saving}
                        onClick={() => {
                          const options = { onSuccess: () => reset(preset) };
                          if ('style' in preset) {
                            saveFamily.mutate({ ...preset, backgrounds: linkedEdits(preset) }, options);
                          } else {
                            saveDiscovery.mutate({ ...preset, backgrounds: linkedEdits(preset) }, options);
                          }
                        }}
                      >
                        Save and recapture
                      </Button>
                      <Button
                        variant="subtle"
                        disabled={saving || !changed}
                        onClick={() => {
                          reset(preset);
                          saveFamily.reset();
                          saveDiscovery.reset();
                        }}
                      >
                        Reset
                      </Button>
                    </Group>
                  ) : null}
                </Stack>
              </fieldset>
            </PairedProofLayout.Settings>
            <PairedProofLayout.Second>
              <Stack gap="sm">
                <Text size="xs" c="dimmed" ta="center">
                  Back
                </Text>
                {'style' in rendered ? (
                  <CardFrame>
                    <CardBack {...rendered.cardback} />
                  </CardFrame>
                ) : (
                  <CustomToken {...tokenFaceProps(rendered.back)} />
                )}
              </Stack>
            </PairedProofLayout.Second>
          </PairedProofLayout>
        </Surface>
      </Section>
    );
  }
  return (
    <PageLayout>
      <PageLayout.Header>
        <PageTitle
          title="Presets"
          subtitle="Keep related designs together. Shared backgrounds keep their linked uses in sync."
        />
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Anchor renderRoot={(props) => <Link {...props} to="/admin" />}>All admin tools</Anchor>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="xl">
          <TextInput
            label="Find a preset"
            placeholder="Card type or Discovery group"
            value={state.search}
            onChange={(event) => dispatch({ kind: 'search', value: event.currentTarget.value })}
          />
          <SaveErrorAlert error={saveFamily.error ?? saveDiscovery.error} />
          {saveFamily.data !== undefined || saveDiscovery.data !== undefined ? (
            <Text role="status">Preset saved. Linked artwork updates as captures finish.</Text>
          ) : null}
          {saved.filter((preset) => preset.label.toLowerCase().includes(state.search.toLowerCase())).map(group)}
          {!current.length ? <Text>No presets available.</Text> : null}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
function BackgroundSwatch({ value }: Readonly<{ value: BackgroundData }>) {
  return (
    <div style={{ width: 48, height: 48, flexShrink: 0, overflow: 'hidden', borderRadius: 'var(--mantine-radius-sm)' }}>
      <Background {...value} />
    </div>
  );
}
function FrontPreview({ preset }: Readonly<{ preset: FamilyPreset }>): ReactNode {
  const style: CardFrontStyle = preset.style;
  switch (preset.key) {
    case 'stronghold':
      return <StrongholdCard {...GF9_STRONGHOLD_CARDS[5]!} frontStyle={style} />;
    case 'storm':
      return <StormCard {...standardStormCard(3)} frontStyle={style} />;
    case 'homeworld':
      return <HomeworldCard {...EXAMPLE_HOMEWORLD_CARD} frontStyle={style} />;
    case 'nexus':
      return <NexusCard {...GF9_NEXUS_CARDS[0]!} frontStyle={style} />;
    case 'leader-skill':
      return <LeaderSkillCard {...GF9_LEADER_SKILLS[0]!} frontStyle={style} />;
    case 'spice':
      return <SpiceCard {...publishingSpiceCard} frontStyle={style} />;
    case 'custom':
      return <CustomCard {...INITIAL_CUSTOM_CARD_DRAFT} name="Custom card" frontStyle={style} />;
    case 'traitor':
      return (
        <TraitorCard
          frontStyle={style}
          name="Duncan Idaho"
          image="/image/leader/official/duncan.png"
          strength="2"
          owner="Atreides"
          logo="/vector/logo/atreides.svg"
          background={backgroundPresets.atreides}
        />
      );
    case 'alliance':
      return (
        <AllianceCard
          frontStyle={style}
          title="Atreides"
          text="Atreides may use Battle Prescience in their ally's battles."
          logo="/vector/logo/atreides.svg"
          troop="/vector/troop/atreides.svg"
          decals={[]}
          background={backgroundPresets.atreides}
        />
      );
    default:
      return (
        <TreacheryCard
          {...INITIAL_TREACHERY_DRAFT}
          name={preset.label}
          subName={preset.key === 'prediction' ? 'Prediction - Reveal' : preset.key.slice('treachery-'.length)}
          text="This category uses the shared header and icon background."
          frontStyle={style}
        />
      );
  }
}
