import { Stack, TextInput } from '@mantine/core';
import { GENERIC, EMBLEM } from '@shared/assetIds';
import type { CardFrontStyle } from '@shared/assets/cardFrontPresets';
import type { NexusCardAsset } from '@shared/assets/schema';
import { FactionLink } from '@ui/content/FactionLink';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { LabeledAction } from '@ui/control/LabeledAction';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Replace, ScrollText, Shield } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { FactionPicker } from '@app/pickers/FactionPicker';
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

function FactionFields({
  draft,
  patch,
}: Readonly<{ draft: NexusDraft; patch: (update: Partial<NexusDraft>) => void }>) {
  const [choosing, setChoosing] = useState(false);
  const factionEmblem = EMBLEM.or(GENERIC).safeParse(draft.factionSymbol.image);
  return (
    <Stack gap="md">
      <ControlBlock
        title="Faction"
        description="The linked faction supplies the name, symbol and colours."
        input={(fieldProps) => (
          <TextInput {...fieldProps} value={draft.faction} readOnly placeholder="Choose a faction" />
        )}
      />
      {draft.factionLink && factionEmblem.success ? (
        <FactionLink
          slug={draft.factionLink.slug}
          name={draft.faction}
          emblem={factionEmblem.data}
          background={draft.factionSymbol.background}
        />
      ) : null}
      <LabeledAction icon={<Replace size={16} />} onClick={() => setChoosing((current) => !current)}>
        {draft.factionLink ? 'Change faction' : 'Choose faction'}
      </LabeledAction>
      {choosing ? (
        <FactionPicker
          copy={{
            title: 'Link a faction',
            intro: 'Choose the faction this Nexus card belongs to. Its symbol and colours become the header image.',
            errorTitle: 'Faction could not be linked',
            emptyMessage: 'No faction is available to link.',
            confirmTitle: 'Use this faction?',
            confirmLabel: 'Link faction',
            confirmIntent: 'positive',
          }}
          onCancel={() => setChoosing(false)}
          onPick={({ id, slug, data }) => {
            patch({
              factionLink: { id, slug },
              faction: data.name,
              factionSymbol: { image: data.emblem, background: data.background },
              icon: [data.background, data.emblem],
            });
            setChoosing(false);
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
  chapter,
  onChapterChange,
  onSettle,
}: Readonly<{
  nameField: ReactNode;
  frontStyle?: CardFrontStyle;
  draft: NexusDraft;
  patch: (update: Partial<NexusDraft>) => void;
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
                panel: <FactionFields draft={draft} patch={patch} />,
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
