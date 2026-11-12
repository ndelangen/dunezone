/*
 * PROTOTYPE, throwaway (#2926, slice 3 of the faction variants plan).
 * Three arrangements of the Faction tab on the variant edit page, built from the real editor's own pieces.
 * A story names the arrangement through `setFactionTabPrototype`; with none set, the edit page is the production one.
 * Delete this file, its stories, and the `prototype` prop on `FactionEditor` and `FactionFormFields` once one is chosen.
 */
import { Box, Grid, Group, SimpleGrid, Stack, Tabs, Text } from '@mantine/core';
import { Notice } from '@ui/block/Notice';
import { ProfileLink } from '@ui/content/ProfileLink';
import { StatusBadge } from '@ui/content/StatusBadge';
import { FactList } from '@ui/list/FactList';
import { Surface } from '@ui/surface/Surface';
import { Link2, Lock } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

import type { FactionDetailPageData } from '@db/factions';
import type {
  FactionEditorPrototype,
  FactionEditorPrototypeParts,
} from '@app/widgets/faction-editor/FactionFormFields';

export type FactionTabVariation = 'chapter' | 'split' | 'summary';

type Scenario = {
  variation: FactionTabVariation;
  /**
   * The Faction's own Group, by name.
   * A stand-in: the page query does not carry the Faction's Group yet, and while a Faction has one Variant the stored one mirrors the Variant's.
   */
  factionGroup: string | null;
};

let scenario: Scenario | null = null;

/** A story's `beforeEach` sets the arrangement and clears it again with `null`. */
export function setFactionTabPrototype(next: Scenario | null) {
  scenario = next;
}

type Facts = {
  factionName: string;
  variantName: string;
  owner: FactionDetailPageData['owner'];
  /**
   * Whether the viewer maintains the Faction.
   * A stand-in: the route passes "is the owner", since the Faction's Group is not on the page yet.
   */
  canEdit: boolean;
};

type VariationProps = { parts: FactionEditorPrototypeParts; facts: Facts; factionGroup: string | null };

/** The arrangement the current story asked for, or nothing, which leaves the editor as it is in production. */
export function factionTabPrototype(facts: Facts): FactionEditorPrototype | undefined {
  if (!scenario) {
    return undefined;
  }
  const { variation, factionGroup } = scenario;
  const Variation =
    variation === 'chapter' ? ChapterVariation : variation === 'split' ? SplitVariation : SummaryVariation;
  return (parts) => <Variation parts={parts} facts={facts} factionGroup={factionGroup} />;
}

/** The shared fields as the Identity chapter binds them; a fieldset switches every control inside off at once, so no section needs a prop for it. */
function SharedFields({ canEdit, children }: { canEdit: boolean; children: ReactNode }) {
  return (
    <Box
      component="fieldset"
      disabled={!canEdit}
      inert={!canEdit}
      aria-label="Faction fields"
      bd={0}
      p={0}
      m={0}
      miw={0}
      opacity={canEdit ? undefined : 0.65}
    >
      <Stack gap="lg">{children}</Stack>
    </Box>
  );
}

/** Who maintains the Faction, as one line: its owner, cited as a person is anywhere, and its Group. */
function Maintainers({ facts, factionGroup }: Pick<VariationProps, 'facts' | 'factionGroup'>) {
  return (
    <Group gap="xs" wrap="wrap">
      <Text size="sm" c="dimmed">
        Maintained by
      </Text>
      {facts.owner ? (
        <ProfileLink
          slug={facts.owner.slug}
          name={facts.owner.username}
          image={facts.owner.avatar_url}
          density="compact"
        />
      ) : (
        <Text size="sm">its owner</Text>
      )}
      {factionGroup ? (
        <Text size="sm" c="dimmed">
          and the Group{' '}
          <Text span c="var(--mantine-color-text)" fw={600}>
            {factionGroup}
          </Text>
        </Text>
      ) : null}
    </Group>
  );
}

/* The emblem's file name, as the nearest thing to its name the draft holds. */
function emblemName(emblem: string) {
  return emblem
    .split('/')
    .pop()!
    .replace(/\.\w+$/, '');
}

function maintainerWords(facts: Facts, factionGroup: string | null) {
  const owner = facts.owner?.username ?? 'the faction owner';
  return factionGroup ? `${owner} and the members of ${factionGroup}` : owner;
}

/*
 * Variation A: the Faction chapter.
 * The first tab of the rail is renamed Faction and keeps the fields it had.
 * A notice at the top of the panel says the fields are shared, or who may change them.
 */
function ChapterVariation({ parts, facts, factionGroup }: VariationProps) {
  const chapters = parts.chapters.map((chapter) =>
    chapter.value === 'identity'
      ? {
          ...chapter,
          label: 'Faction',
          panel: (
            <Stack gap="lg">
              {facts.canEdit ? (
                <Notice tone="info" title="Shared by every variant">
                  {`The name, emblem, colours and background belong to ${facts.factionName}, not to this variant. A change here updates the page, cards and publications of every variant.`}
                </Notice>
              ) : (
                <Notice title={`Only the maintainers of ${facts.factionName} can change these`}>
                  {`The name, emblem, colours and background are shared by every variant. ${maintainerWords(facts, factionGroup)} can change them. Everything in the other tabs belongs to the ${facts.variantName} variant, which you can edit.`}
                </Notice>
              )}
              <SharedFields canEdit={facts.canEdit}>
                {parts.identityFields}
                {parts.backgroundFields}
              </SharedFields>
            </Stack>
          ),
        }
      : chapter
  );
  return parts.workbench(chapters);
}

/*
 * Variation B: Faction beside Variant.
 * A switch above the editor splits the page in two: the Variant with its chapter rail, and the Faction as one dense pane with no rail.
 * The pane opens with who maintains the Faction, so the locked state is a status on that line and not a notice.
 */
function SplitVariation({ parts, facts, factionGroup }: VariationProps) {
  const [view, setView] = useState<'variant' | 'faction'>('variant');
  const variantChapters = parts.chapters.filter((chapter) => chapter.value !== 'identity');
  return (
    <Tabs value={view} onChange={(next) => setView(next === 'faction' ? 'faction' : 'variant')} keepMounted={false}>
      <Tabs.List mb="md" aria-label="Faction or variant">
        <Tabs.Tab value="variant">{`Variant: ${facts.variantName}`}</Tabs.Tab>
        <Tabs.Tab value="faction" rightSection={facts.canEdit ? null : <Lock size={14} aria-label="View only" />}>
          {`Faction: ${facts.factionName}`}
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="variant">{parts.workbench(variantChapters)}</Tabs.Panel>
      <Tabs.Panel value="faction">
        <Grid gap="md">
          <Grid.Col span={9}>
            <Surface as="section" aria-label="Faction" padding="lg">
              <Stack gap="lg">
                <Group justify="space-between" gap="sm">
                  <Maintainers facts={facts} factionGroup={factionGroup} />
                  {facts.canEdit ? (
                    <StatusBadge tone="brand">Shared by every variant</StatusBadge>
                  ) : (
                    <StatusBadge icon={<Lock size={12} aria-hidden />}>View only</StatusBadge>
                  )}
                </Group>
                <SharedFields canEdit={facts.canEdit}>
                  <SimpleGrid cols={2} spacing="lg">
                    {parts.identityFields}
                    {parts.backgroundFields}
                  </SimpleGrid>
                </SharedFields>
              </Stack>
            </Surface>
          </Grid.Col>
          <Grid.Col span={3}>{parts.sharedProof}</Grid.Col>
        </Grid>
      </Tabs.Panel>
    </Tabs>
  );
}

/*
 * Variation C: the quiet last tab.
 * The Faction tab closes the rail, after everything the Variant owns, and carries a small mark that says shared or locked.
 * Someone who cannot edit gets the values as a short list of facts with no controls at all; the proof beside it still shows the look.
 */
function SummaryVariation({ parts, facts, factionGroup }: VariationProps) {
  const variantChapters = parts.chapters.filter((chapter) => chapter.value !== 'identity');
  const identity = parts.chapters.find((chapter) => chapter.value === 'identity')!;
  const factionChapter = {
    ...identity,
    label: 'Faction',
    indicator: facts.canEdit ? (
      <Link2 size={14} aria-label="Shared by every variant" />
    ) : (
      <Lock size={14} aria-label="View only" />
    ),
    panel: facts.canEdit ? (
      <Stack gap="lg">
        <Text size="sm" c="dimmed">
          {`Shared by every variant of ${facts.factionName}.`}
        </Text>
        <SharedFields canEdit>
          {parts.identityFields}
          {parts.backgroundFields}
        </SharedFields>
      </Stack>
    ) : (
      <Stack gap="md">
        <Text size="sm">{`${facts.factionName} shares these with every variant. They are not part of the ${facts.variantName} variant, so they are not yours to change here.`}</Text>
        <parts.form.Subscribe selector={(state) => state.values}>
          {(faction) => (
            <FactList
              facts={[
                { label: 'Name', value: faction.name },
                { label: 'Emblem', value: emblemName(faction.emblem) },
                { label: 'Sheet theme', value: faction.themeColor },
                { label: 'TTS colours', value: faction.colors.join(', ') || 'None' },
                {
                  label: 'Background',
                  value: faction.background.source?.kind === 'preset' ? 'Preset' : 'Custom',
                },
              ]}
            />
          )}
        </parts.form.Subscribe>
        <Maintainers facts={facts} factionGroup={factionGroup} />
      </Stack>
    ),
  };
  return parts.workbench([...variantChapters, factionChapter]);
}
