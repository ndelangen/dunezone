import type { PropsWithChildren, ReactNode } from 'react';

import { collectSlots } from './collectSlots';
import styles from './FigureCaptionLayout.module.css';

const Figure: (props: PropsWithChildren) => null = () => null;

const Caption: (props: PropsWithChildren) => null = () => null;

/**
 * A figure with its caption centred beneath it, as on a card.
 * From 26rem of its own width the figure stands beside its caption instead, where the caption still has the width to read.
 */
function FigureCaptionLayoutBase({ children }: PropsWithChildren) {
  const slots = collectSlots('FigureCaptionLayout', { Figure, Caption }, children);
  const figure = slots.Figure?.children;
  const caption = slots.Caption?.children;

  return (
    <div className={styles.root}>
      <div className={styles.layout}>
        <div>{figure}</div>
        <div className={styles.caption}>{caption}</div>
      </div>
    </div>
  );
}

type FigureCaptionLayoutComponent = ((props: PropsWithChildren) => ReactNode) & {
  Figure: typeof Figure;
  Caption: typeof Caption;
};

export const FigureCaptionLayout = Object.assign(FigureCaptionLayoutBase, {
  Figure,
  Caption,
}) as FigureCaptionLayoutComponent;
