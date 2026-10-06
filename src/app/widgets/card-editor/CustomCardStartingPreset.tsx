import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { PreviewChoice } from '@ui/control/PreviewChoice';
import { useState } from 'react';

import { CustomCard } from '@game/assets/card/Custom';
import { card } from '@game/data/sizes';

import { CUSTOM_CARD_PRESETS } from './customCardPresets';
import type { CustomCardDraft } from './customCardPresets';

type Patch = (update: Partial<CustomCardDraft>) => void;

export function CustomCardStartingPreset({ draft, patch }: { draft: CustomCardDraft; patch: Patch }) {
  const [pending, setPending] = useState<string | null>(null);
  const apply = (key: string) => {
    const preset = CUSTOM_CARD_PRESETS.find((candidate) => candidate.key === key);
    if (preset) {
      patch({
        format: preset.format,
        layers: preset.layers.map((layer) => ({ ...structuredClone(layer), layerId: crypto.randomUUID() })),
      });
    }
    setPending(null);
  };
  return (
    <Stack gap="sm">
      <PreviewChoice
        label="Starting preset"
        value=""
        onChange={(key) => (draft.layers.length ? setPending(key) : apply(key))}
        aspectRatio={String(card.width / card.height)}
        options={CUSTOM_CARD_PRESETS.map((preset) => ({
          value: preset.key,
          label: preset.label,
          preview: (
            <CustomCard {...draft} name="Custom card" subName="" format={preset.format} layers={preset.layers} />
          ),
          canvas: { width: card.width, height: card.height },
        }))}
      />
      {pending ? (
        <Alert title="Replace the current layers?" color="gray">
          <Stack gap="sm">
            <Text size="sm">
              This preset replaces all decals and text blocks. The name, type, Head background and About stay as they
              are.
            </Text>
            <Group>
              <Button variant="default" onClick={() => setPending(null)}>
                Keep current layers
              </Button>
              <Button onClick={() => apply(pending)}>Replace layers</Button>
            </Group>
          </Stack>
        </Alert>
      ) : null}
    </Stack>
  );
}
