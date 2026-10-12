import { Group, Stack, Text } from '@mantine/core';
import type { StrongholdCardAsset } from '@shared/assets/schema';
import { TopicIcon } from '@ui/content/TopicIcon';
import { ControlBlock } from '@ui/control/ControlBlock';
import { FormattedTextInput } from '@ui/control/FormattedTextInput';
import { ListLengthActions } from '@ui/control/ListLengthActions';
import { WorkbenchLayout } from '@ui/layout/WorkbenchLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { ScrollText } from 'lucide-react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { aboutChapter } from '@app/widgets/asset-about/AboutChapter';
import { CardFrame } from '@app/widgets/asset-face/AssetFace';
import { DecalControls } from '@app/widgets/decal-editor/DecalControls';
import { StrongholdCard } from '@game/assets/card/Stronghold';

export type StrongholdDraft = z.infer<typeof StrongholdCardAsset>;
export type StrongholdChapter = 'head' | 'decals' | 'body' | 'about';
export const INITIAL_STRONGHOLD_DRAFT: StrongholdDraft = {
  name: '',
  about: '',
  decals: [],
  text: '',
  textSize: 40,
};

export function strongholdDraftWarnings(draft: StrongholdDraft): {
  source: string;
  missing: string;
  chapter: StrongholdChapter;
}[] {
  return draft.text.trim() ? [] : [{ source: 'Body', missing: 'a stronghold advantage', chapter: 'body' }];
}

/** Callers own the draft and persistence; this owns the stronghold fields and their live card proof. */
export function StrongholdCardEditor({
  draft,
  patch,
  nameField,
  chapter,
  onChapterChange,
  onSettle,
}: Readonly<{
  draft: StrongholdDraft;
  patch: (update: Partial<StrongholdDraft>) => void;
  nameField: ReactNode;
  chapter: StrongholdChapter;
  onChapterChange: (chapter: StrongholdChapter) => void;
  onSettle: () => void;
}>) {
  return (
    <WorkbenchLayout.Workbench>
      <WorkbenchLayout.Chapters>
        <div onBlurCapture={onSettle}>
          <ConnectedTabs<StrongholdChapter>
            value={chapter}
            onValueChange={(next) => {
              onChapterChange(next);
              onSettle();
            }}
            ariaLabel="Card chapters"
            items={[
              {
                value: 'head',
                label: 'Head',
                icon: <TopicIcon topic="head" size={21} />,
                panel: <StrongholdHead nameField={nameField} />,
              },
              {
                value: 'decals',
                label: 'Decals',
                icon: <TopicIcon topic="decals" size={21} />,
                panel: <StrongholdDecals draft={draft} patch={patch} />,
              },
              {
                value: 'body',
                label: 'Body',
                icon: <ScrollText size={21} aria-hidden />,
                panel: <StrongholdBody draft={draft} patch={patch} />,
              },
              aboutChapter(draft.about, (about) => patch({ about })),
            ]}
          />
        </div>
      </WorkbenchLayout.Chapters>
      <WorkbenchLayout.Rail>
        <CardFrame>
          <StrongholdCard {...draft} />
        </CardFrame>
      </WorkbenchLayout.Rail>
    </WorkbenchLayout.Workbench>
  );
}

function StrongholdHead({ nameField }: Readonly<{ nameField: ReactNode }>) {
  return (
    <Stack gap="md">
      <ControlBlock title="Name" description="The stronghold's name also determines its URL." input={nameField} />
      <Text size="sm">
        The Stronghold type, symbol and frame are fixed. Edit the Decals and Body to make your own card.
      </Text>
    </Stack>
  );
}

function StrongholdDecals({
  draft,
  patch,
}: Readonly<{ draft: StrongholdDraft; patch: (update: Partial<StrongholdDraft>) => void }>) {
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={700} size="sm">
          Decals
        </Text>
        <ListLengthActions
          addLabel="Add decal"
          removeLabel="Remove last decal"
          addDisabled={draft.decals.length >= 16}
          removeDisabled={!draft.decals.length}
          onAdd={() =>
            patch({
              decals: [
                ...draft.decals,
                {
                  id: '/vector/decal/palace.svg',
                  muted: false,
                  outline: true,
                  scale: 1,
                  offset: [0, 0],
                },
              ],
            })
          }
          onRemove={() => patch({ decals: draft.decals.slice(0, -1) })}
        />
      </Group>
      {draft.decals.map((decal, index) => (
        <DecalControls
          key={index /* NOSONAR: only the final decal can be removed, so every remaining control keeps its position. */}
          value={decal}
          label={`decal ${index + 1}`}
          offsetRange={[450, 630]}
          onChange={(next) => patch({ decals: draft.decals.map((item, i) => (i === index ? next : item)) })}
        />
      ))}
    </Stack>
  );
}

function StrongholdBody({
  draft,
  patch,
}: Readonly<{ draft: StrongholdDraft; patch: (update: Partial<StrongholdDraft>) => void }>) {
  return (
    <Stack gap="md">
      <ControlBlock
        title="Body"
        description="The advantage gained by controlling this stronghold. Keep it short enough to fit the proof."
        input={
          <FormattedTextInput
            aria-label="Body"
            autosize
            minRows={4}
            value={draft.text}
            onChange={(text) => patch({ text })}
          />
        }
      />
    </Stack>
  );
}
