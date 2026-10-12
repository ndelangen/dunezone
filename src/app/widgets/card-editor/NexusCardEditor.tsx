import { Button, Stack, TextInput } from '@mantine/core';
import { GENERIC, LOGO } from '@shared/assetIds';
import type { NexusCardAsset } from '@shared/assets/schema';
import { FactionLink } from '@ui/content/FactionLink';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { ScrollText, Shield } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { FactionPicker } from '@app/pickers/FactionPicker';
import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { NexusCard } from '@game/assets/card/Nexus';
import { backgroundPresets } from '@game/data/backgrounds';
import { card as CARD_SIZE } from '@game/data/sizes';

import styles from './CardEditor.module.css';
import { cardHeadAndSymbolChapters, initialCardHeadMemory } from './CardHeadChapters';
import type { CardHeadMemory } from './CardHeadChapters';

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
  factionSymbol: { image: '/vector/logo/atreides.svg', background: backgroundPresets.atreides },
  head: backgroundPresets.nexus,
  icon: [backgroundPresets.atreides, '/vector/logo/atreides.svg'],
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
  const factionLogo = LOGO.or(GENERIC).safeParse(draft.factionSymbol.image);
  return (
    <Stack gap="md">
      <ControlBlock
        title="Faction"
        description="The linked faction supplies the name, symbol and colours."
        input={<TextInput aria-label="Faction" value={draft.faction} readOnly placeholder="Choose a faction" />}
      />
      {draft.factionLink && factionLogo.success ? (
        <FactionLink
          slug={draft.factionLink.slug}
          name={draft.faction}
          logo={factionLogo.data}
          background={draft.factionSymbol.background}
        />
      ) : null}
      <Button type="button" variant="default" onClick={() => setChoosing((current) => !current)}>
        {draft.factionLink ? 'Change faction' : 'Choose faction'}
      </Button>
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
              factionSymbol: { image: data.logo, background: data.background },
              icon: [data.background, data.logo],
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
  draft,
  patch,
  memory,
  remember,
  chapter,
  onChapterChange,
  onSettle,
}: Readonly<{
  nameField: ReactNode;
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
              ...cardHeadAndSymbolChapters({
                draft,
                patch: (update) => patch({ ...update, subName: 'Nexus' }),
                memory,
                remember,
                nameField,
                fixedType: 'Nexus',
                presets: [
                  {
                    key: 'nexus',
                    label: 'Nexus',
                    head: backgroundPresets.nexus,
                    striped: backgroundPresets.nexus,
                  },
                ],
              }).filter(({ value }) => value === 'head'),
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
                        input={
                          <FormattedTextInput
                            aria-label={label}
                            autosize
                            minRows={3}
                            value={draft[key]}
                            onChange={(text) => patch({ [key]: text })}
                          />
                        }
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
        <CanvasScale
          rounded
          canvasWidth={CARD_SIZE.width}
          canvasHeight={CARD_SIZE.height}
          frameClassName={styles.proofFrame}
        >
          <NexusCard {...draft} />
        </CanvasScale>
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}
