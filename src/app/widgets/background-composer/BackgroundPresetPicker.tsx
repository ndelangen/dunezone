import { Text, UnstyledButton } from '@mantine/core';
import { Brush } from 'lucide-react';

import { BackgroundRenderer } from '@game/assets/utils/BackgroundRenderer';
import type { BackgroundData } from '@game/data/backgrounds';

import styles from './BackgroundPresetPicker.module.css';

export type BackgroundPreset = { key: string; label: string; background: BackgroundData };

/**
 * Chooses a Background from named presets by showing them: every option renders through the real background pipeline, so the tile is exactly what the card gets.
 * The Custom tile paints the current value once it diverges from every preset;
 * the caller opens the composer behind it.
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
    <div className={styles.row}>
      {presets.map((preset) => (
        <UnstyledButton
          key={preset.key}
          type="button"
          className={styles.option}
          aria-pressed={selected === preset.key}
          onClick={() => onSelect(preset.key)}
        >
          <BackgroundRenderer background={preset.background} className={styles.art} />
          <Text size="xs" fw={selected === preset.key ? 700 : 500} ta="center" mt={4} truncate>
            {preset.label}
          </Text>
        </UnstyledButton>
      ))}
      <UnstyledButton
        type="button"
        className={styles.option}
        aria-pressed={selected === 'custom'}
        onClick={() => onSelect('custom')}
      >
        {selected === 'custom' && customBackground ? (
          <BackgroundRenderer background={customBackground} className={styles.art} />
        ) : (
          <div className={styles.customArt}>
            <Brush size={20} aria-hidden />
          </div>
        )}
        <Text size="xs" fw={selected === 'custom' ? 700 : 500} ta="center" mt={4} truncate>
          Custom
        </Text>
      </UnstyledButton>
    </div>
  );
}
