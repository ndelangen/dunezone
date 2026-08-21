import { Text } from '@mantine/core';
import { useId } from 'react';
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
  /**
   * A control this option carries once it is chosen, e.g.
   * narrowing a category to one of its members.
   * Sits in flow at the foot of the tile taking its own clicks, and the art shrinks by exactly its height.
   * Any popover it opens must be portalled, because the tile clips its overflow so art can bleed to the edges.
   */
  detail?: ReactNode;
};

/**
 * Chooses between a few options by showing what each one produces, rather than by naming them.
 *
 * For choices where the answer is a picture: a background, a token's back, a deck's cardback.
 * Reading a label tells you which words you picked;
 * a preview tells you what you will get, which is the only question being asked.
 * Callers own the aspect ratio, because a token, a card and a background disagree about shape.
 *
 * The tile is a box, not a control.
 * A real radio is stretched invisibly across it and does the choosing, so grouping, arrow keys and the announcement are the platform's rather than ours.
 * An option's own control is a sibling of the art inside that box, never a descendant of the thing you press to choose, which is what a nested control would have been.
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
  /** CSS aspect-ratio for every tile's frame, e.g. `'3 / 2'` for a background, `'1'` for a disc token. */
  aspectRatio: string;
}) {
  /*
   * One radio group name per mounted instance.
   * A constant would merge every PreviewChoice on a page into a single native group, so arrow keys
   * would walk out of the background row into the backside row. The token editors render both.
   */
  const group = useId();

  return (
    <div className={styles.row} role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const chosen = option.value === value;
        /* Indexed rather than keyed by value, because option keys are caller data and need not be id-safe. */
        const captionId = `${group}-${index}`;
        return (
          <div key={option.value} className={styles.tile}>
            <input
              type="radio"
              className={styles.pick}
              name={group}
              value={option.value}
              checked={chosen}
              onChange={() => onChange(option.value)}
              aria-labelledby={captionId}
            />
            <div className={styles.frame} style={{ aspectRatio }} data-empty={option.preview ? undefined : true}>
              {/* Hidden from assistive technology: the caption names the option, and the picture has nothing to add. */}
              <div className={styles.art} aria-hidden>
                {option.preview ?? option.emptyHint}
              </div>
              {chosen && option.detail ? <div className={styles.detail}>{option.detail}</div> : null}
            </div>
            <Text id={captionId} size="xs" fw={chosen ? 700 : 500} ta="center" mt={4} truncate>
              {option.label}
            </Text>
          </div>
        );
      })}
    </div>
  );
}
