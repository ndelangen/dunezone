import { PreviewChoice } from '@ui/control/PreviewChoice';
import { Brush } from 'lucide-react';

import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';
import type { BackgroundData } from '@game/data/backgrounds';

export type BackgroundPreset = { key: string; label: string; background: BackgroundData };

/**
 * Chooses a Background from named presets by showing them: every option renders through the real background pipeline, so the tile is exactly what the card gets.
 * The Custom tile paints the current value once it diverges from every preset;
 * the caller opens the composer behind it.
 *
 * The row, the selected treatment and the dashed reserved spot are `PreviewChoice`'s, which this was the first caller of;
 * what stays here is the one thing only a background knows, that its preview is a `BackgroundRenderer` at 3:2.
 */
export function BackgroundPresetPicker({
  presets,
  selected,
  onSelect,
  customBackground,
}: {
  presets: readonly BackgroundPreset[];
  /** A preset key, or 'custom'. */
  selected: string;
  onSelect: (key: string) => void;
  /** Painted on the Custom tile while it is selected, so the row keeps showing the truth. */
  customBackground?: BackgroundData;
}) {
  return (
    <PreviewChoice
      label="Background"
      value={selected}
      onChange={onSelect}
      aspectRatio="3 / 2"
      options={[
        ...presets.map((preset) => ({
          value: preset.key,
          label: preset.label,
          preview: <BackgroundRenderer background={preset.background} />,
        })),
        {
          value: 'custom',
          label: 'Custom',
          preview:
            selected === 'custom' && customBackground ? (
              <BackgroundRenderer background={customBackground} />
            ) : undefined,
          emptyHint: <Brush size={20} aria-hidden />,
        },
      ]}
    />
  );
}
