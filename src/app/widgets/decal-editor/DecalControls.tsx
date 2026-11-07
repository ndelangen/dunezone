import { Grid, Stack, Switch } from '@mantine/core';
import type { Decal } from '@shared/assets/schema';
import { stockAssetOptions } from '@ui/content/stockAssetOptions';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import { RangeField } from '@ui/control/RangeField';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import { assetOptionToPreviewSrc, decalAssetOptions } from '@app/widgets/faction-editor/factionFormAssetUtils';

export type DecalData = z.infer<typeof Decal>;

const decalOptions = stockAssetOptions(decalAssetOptions);

/**
 * The one decal control stack every decal-bearing editor installs identically (alliance cards, treachery cards): asset, treatments, scale, and slider-based offsets.
 * Pure value/onChange;
 * the caller owns the decal collection and names the decal through `label` for assistive tech.
 */
export function DecalControls({
  value,
  onChange,
  label,
  offsetRange,
  placement,
  assetOptions,
}: {
  value: DecalData;
  assetOptions?: readonly string[];
  onChange: (decal: DecalData) => void;
  /** Names this decal in control aria-labels, e.g. "alliance decal 1". */
  label: string;
  /** Center-to-edge slider span per axis in card-space pixels; number inputs stay unclamped for legacy values. */
  offsetRange: readonly [number, number];
  /** Caller-supplied placement controls when the card uses a different coordinate system. */
  placement?: ReactNode;
}) {
  return (
    <Stack gap="md">
      <ControlBlock
        title="Decal asset"
        description="Layered onto the card in collection order."
        input={
          <AssetSelect
            aria-label={`Asset for ${label}`}
            allowDeselect={false}
            data={assetOptions ? stockAssetOptions(assetOptions) : decalOptions}
            getPreviewSrc={assetOptionToPreviewSrc}
            glyphPreviews
            value={value.id}
            onChange={(next) => {
              if (next) {
                onChange({ ...value, id: next as DecalData['id'] });
              }
            }}
          />
        }
      />

      <Grid>
        <Grid.Col span={{ base: 12, xs: 6 }}>
          <ControlBlock
            title="Muted treatment"
            description="Uses the decal as a subtle cutout layer."
            input={
              <Switch
                aria-label={`Muted treatment for ${label}`}
                checked={value.muted}
                onChange={(event) => onChange({ ...value, muted: event.currentTarget.checked })}
              />
            }
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, xs: 6 }}>
          <ControlBlock
            title="Outline"
            description="Adds a light border around an unmuted decal."
            input={
              <Switch
                aria-label={`Outline for ${label}`}
                checked={value.outline}
                onChange={(event) => onChange({ ...value, outline: event.currentTarget.checked })}
              />
            }
          />
        </Grid.Col>
      </Grid>

      <RangeField
        title="Scale"
        name={`Scale for ${label}`}
        description="Resize the decal from 0 (hidden) to 3; 1 is the full reference size."
        min={0}
        max={3}
        step={0.01}
        value={value.scale}
        onChange={(next) => onChange({ ...value, scale: next })}
      />

      {placement ?? (
        <Grid>
          <Grid.Col span={{ base: 12, xs: 6 }}>
            <RangeField
              title="Horizontal offset"
              name={`Horizontal offset for ${label}`}
              description="Move left with a negative value or right with a positive value."
              min={-offsetRange[0]}
              max={offsetRange[0]}
              decimals={2}
              typedBeyondRange
              value={value.offset[0]}
              onChange={(next) => onChange({ ...value, offset: [next, value.offset[1]] })}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, xs: 6 }}>
            <RangeField
              title="Vertical offset"
              name={`Vertical offset for ${label}`}
              description="Move up with a negative value or down with a positive value."
              min={-offsetRange[1]}
              max={offsetRange[1]}
              decimals={2}
              typedBeyondRange
              value={value.offset[1]}
              onChange={(next) => onChange({ ...value, offset: [value.offset[0], next] })}
            />
          </Grid.Col>
        </Grid>
      )}
    </Stack>
  );
}
