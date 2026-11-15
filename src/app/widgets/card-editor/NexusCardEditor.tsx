import { Group, Stack, Text } from '@mantine/core';
import { GENERIC, EMBLEM } from '@shared/assetIds';
import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import type { NexusCardAsset } from '@shared/assets/schema';
import { EmptyNote } from '@ui/content/EmptyNote';
import { FactionLink } from '@ui/content/FactionLink';
import { FactionVariantCount } from '@ui/content/FactionVariantCount';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { LabeledAction } from '@ui/control/LabeledAction';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Replace, ScrollText, Shield } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import type { NexusFactionChoice } from '@db/factions';
import { NexusFactionPicker } from '@app/pickers/NexusFactionPicker';
import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { NexusCard } from '@game/assets/card/Nexus';
import { backgroundPresets } from '@game/data/backgrounds';

import { fixedCardHeadChapter, initialCardHeadMemory } from './CardHeadChapters';
import type { CardHeadMemory } from './CardHeadChapters';
import { CardProof } from './CardProof';

export type NexusDraft = z.infer<typeof NexusCardAsset>;
export type NexusMemory = CardHeadMemory;
export type NexusChapter = 'head' | 'icon' | 'faction' | 'effects' | 'about';
export const INITIAL_NEXUS_MEMORY: NexusMemory = {
  ...initialCardHeadMemory(),
};
export const INITIAL_NEXUS_DRAFT: NexusDraft = {
  name: '',
  about: '',
  subName: 'Nexus',
  faction: '',
  factionSymbol: { image: '/vector/emblem/atreides.svg', background: backgroundPresets.atreides },
  head: backgroundPresets.nexus,
  icon: [backgroundPresets.atreides, '/vector/emblem/atreides.svg'],
  betrayal: '',
  cunning: '',
  secretAlly: '',
};

export function nexusDraftWarnings(draft: NexusDraft): { source: string; missing: string; chapter: NexusChapter }[] {
  const warnings: { source: string; missing: string; chapter: NexusChapter }[] = [];
  if (!draft.name.trim()) {
    warnings.push({ source: 'Head', missing: 'a name', chapter: 'head' });
  }
  if (!draft.factionLink) {
    warnings.push({ source: 'Faction', missing: 'a linked faction', chapter: 'faction' });
  }
  for (const [key, label] of [
    ['betrayal', 'Betrayal'],
    ['cunning', 'Cunning'],
    ['secretAlly', 'Secret Ally'],
  ] as const) {
    if (!draft[key].trim()) {
      warnings.push({ source: label, missing: 'effect text', chapter: 'effects' });
    }
  }
  return warnings;
}

/** What the page reads of the Faction the draft's link leads to, which the draft itself does not hold. */
export type NexusLinkedFaction = Readonly<{
  /** The Faction's own id and address, which differ from the draft's link while that still names one variant. */
  id: string;
  slug: string;
  /** How many live variants the Faction has. */
  variantCount: number;
  /** The variant the draft still links, on a card saved before a Nexus card linked a whole Faction; null once it links the Faction. */
  formerVariant: string | null;
}>;

/** What linking a Faction changes on the card: the link, and the name, symbol and colours it supplies. */
function nexusFactionPatch(faction: NexusFactionChoice): Partial<NexusDraft> {
  return {
    factionLink: { id: faction.id, slug: faction.slug },
    faction: faction.name,
    factionSymbol: { image: faction.emblem, background: faction.background },
    icon: [faction.background, faction.emblem],
  };
}

function FactionFields({
  draft,
  patch,
  linkedFaction,
}: Readonly<{
  draft: NexusDraft;
  patch: (update: Partial<NexusDraft>) => void;
  linkedFaction: NexusLinkedFaction | undefined;
}>) {
  const [changing, setChanging] = useState(false);
  /* A card with no faction yet has only the choice to make, so its list is open. */
  const choosing = !draft.factionLink || changing;
  const factionEmblem = EMBLEM.or(GENERIC).safeParse(draft.factionSymbol.image);
  return (
    <Stack gap="md">
      <ControlBlock
        title="Faction"
        description={
          'The card is about the faction, whichever variant is played.\nIt supplies the name, symbol and colours.'
        }
        tool={
          draft.factionLink ? (
            <LabeledAction
              size="compact-sm"
              icon={<Replace size={14} />}
              onClick={() => setChanging((current) => !current)}
            >
              Change faction
            </LabeledAction>
          ) : undefined
        }
        input={
          draft.factionLink && factionEmblem.success ? (
            <Stack gap="xs">
              <Group gap="sm">
                <FactionLink
                  slug={linkedFaction?.slug ?? draft.factionLink.slug}
                  name={draft.faction}
                  emblem={factionEmblem.data}
                  background={draft.factionSymbol.background}
                />
                {linkedFaction ? <FactionVariantCount count={linkedFaction.variantCount} /> : null}
              </Group>
              {linkedFaction?.formerVariant ? (
                <Text size="xs" c="dimmed">
                  Linked the {linkedFaction.formerVariant} variant before. It now links the faction.
                </Text>
              ) : null}
            </Stack>
          ) : (
            <EmptyNote>No faction linked yet.</EmptyNote>
          )
        }
      />
      {choosing ? (
        <NexusFactionPicker
          linkedId={linkedFaction?.id}
          onPick={(faction) => {
            patch(nexusFactionPatch(faction));
            setChanging(false);
          }}
        />
      ) : null}
    </Stack>
  );
}

/** Pages own the draft and persistence; this workbench edits the constrained Nexus face and shows its proof. */
export function NexusCardEditor({
  nameField,
  frontStyle,
  draft,
  patch,
  linkedFaction,
  chapter,
  onChapterChange,
  onSettle,
}: Readonly<{
  nameField: ReactNode;
  frontStyle?: CardFrontStyle;
  draft: NexusDraft;
  patch: (update: Partial<NexusDraft>) => void;
  /** Read by the page for the draft's link; left out while it loads or where the card links nothing. */
  linkedFaction?: NexusLinkedFaction;
  memory: NexusMemory;
  remember: (update: Partial<NexusMemory>) => void;
  chapter: NexusChapter;
  onChapterChange: (chapter: NexusChapter) => void;
  onSettle: () => void;
}>) {
  return (
    <WorkbenchLayout.Workbench>
      <WorkbenchLayout.Chapters>
        <div onBlurCapture={onSettle}>
          <ConnectedTabs<NexusChapter>
            value={chapter}
            onValueChange={(next) => {
              onChapterChange(next);
              onSettle();
            }}
            ariaLabel="Nexus card chapters"
            items={[
              fixedCardHeadChapter(nameField, 'Nexus'),
              {
                value: 'faction',
                label: 'Faction',
                icon: <Shield size={21} aria-hidden />,
                panel: <FactionFields draft={draft} patch={patch} linkedFaction={linkedFaction} />,
              },
              {
                value: 'effects',
                label: 'Effects',
                icon: <ScrollText size={21} aria-hidden />,
                panel: (
                  <Stack gap="md">
                    {(
                      [
                        ['betrayal', 'Betrayal', 'Use when another player plays this faction.'],
                        ['cunning', 'Cunning', 'Use when you play this faction.'],
                        ['secretAlly', 'Secret Ally', 'Use when this faction is absent from the game.'],
                      ] as const
                    ).map(([key, label, description]) => (
                      <ControlBlock
                        key={key}
                        title={label}
                        description={`${description} Up to 400 characters and six lines.`}
                        input={(fieldProps) => (
                          <FormattedTextInput
                            {...fieldProps}
                            minRows={3}
                            value={draft[key]}
                            onChange={(text) => patch({ [key]: text })}
                          />
                        )}
                      />
                    ))}
                  </Stack>
                ),
              },
              aboutChapter(draft.about, (about) => patch({ about })),
            ]}
          />
        </div>
      </WorkbenchLayout.Chapters>
      <WorkbenchLayout.Rail>
        <CardProof>
          <NexusCard {...draft} frontStyle={frontStyle} />
        </CardProof>
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}
