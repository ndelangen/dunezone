import { Grid, NumberInput, Slider, Stack, Switch } from '@mantine/core';
import type { Decal } from '@shared/assets/schema';
import { AssetSelect } from '@ui/control/AssetSelect';
import { ControlBlock } from '@ui/control/ControlBlock';
import type { z } from 'zod';

import {
  assetOptionToPreviewSrc,
  decalAssetOptions,
  decalAssetOptionToLabel,
} from '@app/widgets/faction-editor/factionFormAssetUtils';

export type DecalData = z.infer<typeof Decal>;

const decalOptions = decalAssetOptions.map((value) => ({
  value,
  label: decalAssetOptionToLabel(value),
}));

/**
 * The one decal control stack, asset, treatments, scale, and slider-based offsets, every decal-bearing editor installs identically (alliance cards, treachery cards).
 * Pure value/onChange;
 * the caller owns the decal collection and names the decal through `label` for assistive tech.
 */
export function DecalControls({
  value,
  onChange,
  label,
  offsetRange,
}: {
  value: DecalData;
  onChange: (decal: DecalData) => void;
  /** Names this decal in control aria-labels, e.g. "alliance decal 1". */
  label: string;
  /** Center-to-edge slider span per axis in card-space pixels; number inputs stay unclamped for legacy values. */
  offsetRange: readonly [number, number];
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
            limit={30}
            data={decalOptions}
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

      <ControlBlock
        title="Scale"
        description="Resize the decal from 0 (hidden) to 3; 1 is the full reference size."
        tool={
          <NumberInput
            aria-label={`Scale for ${label}`}
            w={96}
            min={0}
            max={3}
            step={0.01}
            decimalScale={2}
            value={value.scale}
            onChange={(next) => {
              if (typeof next === 'number') {
                onChange({ ...value, scale: next });
              }
            }}
          />
        }
        input={
          <Slider
            aria-label={`Scale slider for ${label}`}
            min={0}
            max={3}
            step={0.01}
            value={value.scale}
            label={(current) => current.toFixed(2)}
            onChange={(next) => onChange({ ...value, scale: next })}
          />
        }
      />

      <Grid>
        <Grid.Col span={{ base: 12, xs: 6 }}>
          <ControlBlock
            title="Horizontal offset"
            description="Move left with a negative value or right with a positive value."
            tool={
              <NumberInput
                aria-label={`Horizontal offset for ${label}`}
                w={96}
                step={1}
                value={value.offset[0]}
                onChange={(next) => {
                  if (typeof next === 'number') {
                    onChange({ ...value, offset: [next, value.offset[1]] });
                  }
                }}
              />
            }
            input={
              <Slider
                aria-label={`Horizontal offset slider for ${label}`}
                min={-offsetRange[0]}
                max={offsetRange[0]}
                step={1}
                value={value.offset[0]}
                onChange={(next) => onChange({ ...value, offset: [next, value.offset[1]] })}
              />
            }
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, xs: 6 }}>
          <ControlBlock
            title="Vertical offset"
            description="Move up with a negative value or down with a positive value."
            tool={
              <NumberInput
                aria-label={`Vertical offset for ${label}`}
                w={96}
                step={1}
                value={value.offset[1]}
                onChange={(next) => {
                  if (typeof next === 'number') {
                    onChange({ ...value, offset: [value.offset[0], next] });
                  }
                }}
              />
            }
            input={
              <Slider
                aria-label={`Vertical offset slider for ${label}`}
                min={-offsetRange[1]}
                max={offsetRange[1]}
                step={1}
                value={value.offset[1]}
                onChange={(next) => onChange({ ...value, offset: [value.offset[0], next] })}
              />
            }
          />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
