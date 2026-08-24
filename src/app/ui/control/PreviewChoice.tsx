import { Text } from '@mantine/core';
import { useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';

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
   * The preview's own canvas size, when it draws at a fixed one (a proof drawn at 900 card-space pixels).
   * The tile then scales it to fit rather than cropping a native-size corner, which is what a fixed canvas inside a fluid tile otherwise shows.
   * Omitted for previews that size themselves from the box they are given.
   */
  canvas?: { width: number; height: number };
  /**
   * A control this option carries once it is chosen, e.g.
   * narrowing a category to one of its members.
   * Sits in flow at the foot of the tile taking its own clicks, and the art shrinks by exactly its height.
   * Any popover it opens must be portalled, because the tile clips its overflow so art can bleed to the edges.
   */
  detail?: ReactNode;
};

/*
 * Contain-fits a fixed-canvas preview to the tile's art box.
 * `CanvasScale` is the other way round and stays separate: there the canvas dictates the box, which is
 * why it sets an aspect ratio, and here the caller dictates the box and the canvas fits inside it.
 * The art box is its own container on both axes, so `min()` picks whichever of the two ratios binds,
 * and the centring is the flex box plus a scale about the centre rather than an offset anyone computes.
 */
function ContainFit({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        containerType: 'size',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        style={
          {
            width,
            height,
            flex: '0 0 auto',
            '--contain-fit-width': `${width}px`,
            '--contain-fit-height': `${height}px`,
            transform: 'scale(min(100cqw / var(--contain-fit-width), 100cqh / var(--contain-fit-height)))',
            pointerEvents: 'none',
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}

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
  labelPlacement = 'below',
}: {
  /** Names the choice for assistive technology; the visible heading is the caller's ControlBlock. */
  label: string;
  value: T;
  options: readonly PreviewChoiceOption<T>[];
  onChange: (value: T) => void;
  /** CSS aspect-ratio for every tile's frame, e.g. `'3 / 2'` for a background, `'1'` for a disc token. */
  aspectRatio: string;
  /**
   * Where each option's caption sits.
   * `below` is the default;
   * `inside` overlays it on the tile's lower edge, for rows of swatch-like options whose captions below would break the tiles' shared baseline (Norbert, 2026-08-21).
   * An inside caption paints over the frame's foot, so a row combining it with per-option `detail` controls should stay with `below`.
   */
  labelPlacement?: 'below' | 'inside';
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
                {option.preview && option.canvas ? (
                  <ContainFit width={option.canvas.width} height={option.canvas.height}>
                    {option.preview}
                  </ContainFit>
                ) : (
                  (option.preview ?? option.emptyHint)
                )}
              </div>
              {chosen && option.detail ? <div className={styles.detail}>{option.detail}</div> : null}
              {/* Inside the frame but a sibling of the art: the frame is pointer-events none, so the caption never sits in the radio's hit path. */}
              {labelPlacement === 'inside' ? (
                <Text
                  id={captionId}
                  size="xs"
                  fw={chosen ? 700 : 500}
                  ta="center"
                  truncate
                  className={styles.insideLabel}
                >
                  {option.label}
                </Text>
              ) : null}
            </div>
            {labelPlacement === 'below' ? (
              <Text id={captionId} size="xs" fw={chosen ? 700 : 500} ta="center" mt={4} truncate>
                {option.label}
              </Text>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
