import { Children, isValidElement } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import styles from './FigureCaptionLayout.module.css';
import { warnDroppedChild } from './warnDroppedChild';

const FIGURE_SLOTS = ['FigureCaptionLayout.Figure', 'FigureCaptionLayout.Caption'] as const;

const Figure: (props: PropsWithChildren) => null = () => null;

const Caption: (props: PropsWithChildren) => null = () => null;

/**
 * A figure with its caption centred beneath it, as on a card.
 * From 26rem of its own width the figure stands beside its caption instead, where the caption still has the width to read.
 */
function FigureCaptionLayoutBase({ children }: PropsWithChildren) {
  let figure: ReactNode = null;
  let caption: ReactNode = null;

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      warnDroppedChild('FigureCaptionLayout', FIGURE_SLOTS, child);
      return;
    }
    if (child.type === Figure) {
      figure = (child.props as PropsWithChildren).children;
      return;
    }
    if (child.type === Caption) {
      caption = (child.props as PropsWithChildren).children;
      return;
    }
    warnDroppedChild('FigureCaptionLayout', FIGURE_SLOTS, child);
  });

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
