import { Text, UnstyledButton } from '@mantine/core';
import type { ReactNode } from 'react';

import styles from './PreviewChoice.module.css';

export type PreviewChoiceOption<T extends string> = {
  value: T;
  label: string;
  /**
   * What choosing this option produces, drawn through the real renderer rather than described.
   * Stretched to fill the tile, so it reads at the tile's shape rather than at its own natural size.
   * Omitted when there is nothing to draw yet, which paints the dashed reserved spot instead.
   */
  preview?: ReactNode;
  /** What the dashed reserved spot holds while there is nothing to preview, e.g. an icon naming the option. */
  emptyHint?: ReactNode;
  /** A control this option carries once it is chosen, e.g. narrowing a category to one of its members. */
  detail?: ReactNode;
};

/**
 * Chooses between a few options by showing what each one produces, rather than by naming them.
 *
 * For choices where the answer is a picture: a background, a token's back, a deck's cardback.
 * Reading a label tells you which words you picked;
 * a preview tells you what you will get, which is the only question being asked.
 * Callers own the aspect ratio, because a token, a card and a background disagree about shape and the row should not pretend otherwise.
 */
export function PreviewChoice<T extends string>({
  label,
  value,
  options,
  onChange,
  aspectRatio,
}: {
  /** Names the choice for assistive technology; the visible heading is the caller's ControlBlock. */
  label: string;
  value: T;
  options: readonly PreviewChoiceOption<T>[];
  onChange: (value: T) => void;
  /** CSS aspect-ratio for every tile's art, e.g. `'3 / 2'` for a background, `'1'` for a disc token. */
  aspectRatio: string;
}) {
  return (
    <div className={styles.row} role="group" aria-label={label}>
      {options.map((option) => {
        const chosen = option.value === value;
        return (
          <div key={option.value} className={styles.option}>
            <UnstyledButton
              type="button"
              className={styles.target}
              aria-pressed={chosen}
              onClick={() => onChange(option.value)}
            >
              <div className={option.preview ? styles.art : styles.emptyArt} style={{ aspectRatio }}>
                {option.preview ?? option.emptyHint}
              </div>
              <Text size="xs" fw={chosen ? 700 : 500} ta="center" mt={4} truncate>
                {option.label}
              </Text>
            </UnstyledButton>
            {chosen && option.detail ? <div className={styles.detail}>{option.detail}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
