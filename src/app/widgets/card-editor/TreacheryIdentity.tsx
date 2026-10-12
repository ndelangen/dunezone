import { Select, Stack, TextInput } from '@mantine/core';
import type { Treachery } from '@shared/assets/schema';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { TopicIcon } from '@ui/content/TopicIcon';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { assetOptionToPreviewSrc, vectorDecalAssetOptions } from '@app/widgets/faction-editor/factionFormAssetUtils';
import { TREACHERY_STYLES, treacheryStyle } from '@game/assets/treachery/treacheryStyle';

type Draft = z.infer<typeof Treachery>;
const symbolOptions = stockAssetOptions(vectorDecalAssetOptions);

/* Treachery authors choose card content and a standard category, never independent styling. */
export function treacheryIdentityChapters({
  draft,
  patch,
  nameField,
}: {
  draft: Draft;
  patch: (update: Partial<Draft>) => void;
  nameField: ReactNode;
}) {
  const style = treacheryStyle(draft);
  const symbols = symbolOptions.filter(
    (option) => option.value.startsWith('/vector/icon/') || option.value === draft.icon[1]
  );
  return [
    {
      value: 'head' as const,
      label: 'Head',
      icon: <TopicIcon topic="head" size={21} />,
      panel: (
        <Stack gap="md">
          <ControlBlock
            title="Name"
            description="Names the card and determines its URL. Long titles resize to fit."
            input={nameField}
          />
          <ControlBlock
            title="Type"
            description="Shown under the name, for example Weapon - Projectile."
            input={
              <TextInput
                aria-label="Type"
                value={draft.subName}
                onChange={(event) => patch({ subName: event.currentTarget.value })}
              />
            }
          />
          <ControlBlock
            title="Category"
            description="Uses the standard head and matching symbol background for this category."
            input={
              <Select
                aria-label="Category"
                allowDeselect={false}
                value={style.key}
                data={TREACHERY_STYLES.map(({ key, label }) => ({ value: key, label }))}
                onChange={(key) => {
                  const next = TREACHERY_STYLES.find((candidate) => candidate.key === key);
                  if (next) {
                    patch({ head: next.head, icon: [next.striped, draft.icon[1]] });
                  }
                }}
              />
            }
          />
        </Stack>
      ),
    },
    {
      value: 'icon' as const,
      label: 'Symbol',
      icon: <TopicIcon topic="symbol" size={21} />,
      panel: (
        <ControlBlock
          title="Icon"
          description="Choose the card's vector symbol. Its placement and styling are fixed."
          input={
            <AssetSelect
              aria-label="Icon"
              allowDeselect={false}
              data={symbols}
              getPreviewSrc={assetOptionToPreviewSrc}
              glyphPreviews
              value={draft.icon[1]}
              onChange={(value) => {
                if (value) {
                  patch({ icon: [style.striped, value as Draft['icon'][1]] });
                }
              }}
            />
          }
        />
      ),
    },
  ];
}
