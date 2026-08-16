import clsx from 'clsx';
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { RenderRoot } from '../renderRoot';
import styles from './Surface.module.css';

/**
 * Tracks whether a surface is already open above this one.
 *
 * Nesting is a brand rule rather than a technical constraint, and it is broken by composition — a page wraps a list in
 * a Card, and three files away the list opens a pane of its own. Neither author can see the other, so the check has to
 * happen where the two meet: at render.
 */
const InsideSurface = createContext(false);

export interface SurfaceProps {
  children: ReactNode;
  /**
   * `none` when the children manage their own insets — a full-bleed image, a table that owns its cell padding. Anything
   * else would double the gutter. Steps match the theme spacing scale.
   */
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  /** Semantic element. The pane is often a `section` or `article`, not a bare box. */
  as?: 'div' | 'section' | 'article' | 'aside';
  /**
   * Names the pane for assistive tech. Required in practice whenever `as` is not `div`: an unnamed `section` or `aside`
   * is not exposed as a landmark at all, so the semantic element buys the tag and none of the meaning. Use
   * `aria-labelledby` when a visible heading already says it, and `aria-label` when nothing on screen does.
   */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  /**
   * Lifts on hover and focus. Only for a surface that is itself the click target; a surface containing controls should
   * stay still.
   */
  interactive?: boolean;
  /** Makes the surface an anchor or button rather than a plain box. */
  renderRoot?: RenderRoot;
  /** Placement only — grid area, width. The surface owns its own appearance. */
  className?: string;
}

/**
 * The pane that content sits on.
 *
 * Callers own what goes inside and where the pane sits. This component owns the one treatment that makes a pane read as
 * a pane here: a pale border, a translucent infill, the blur that lets the desert artwork through, and the soft shadow
 * that lifts it off the page.
 *
 * It exists because that treatment had been written out three separate times — once against the `--panel-*` tokens,
 * once as a `color-mix` of white, and once inside the Mantine theme — so panes that should have been identical differed
 * in border weight, blur radius and translucency depending on which copy the author happened to find first.
 *
 * **Surfaces never nest.** Two panes stacked doubles the border and the blur, and the artwork the translucency exists
 * to reveal disappears behind two layers of frosting. Use dividers within one pane instead — that is what `List` is
 * for. Nesting warns in development.
 */
export function Surface({
  children,
  padding = 'none',
  as: Element = 'div',
  interactive = false,
  renderRoot,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: SurfaceProps) {
  const insideSurface = useContext(InsideSurface);

  if (import.meta.env.DEV && insideSurface) {
    console.warn(
      '[Surface] A surface is nested inside another surface. Surfaces never nest: the doubled ' +
        'border and blur hide the artwork the translucency exists to reveal. Drop the inner ' +
        'surface, or separate the content with dividers inside the outer one.'
    );
  }

  const surfaceClass = clsx(
    styles.surface,
    padding !== 'none' && styles[padding],
    interactive && styles.interactive,
    className
  );

  return (
    <InsideSurface.Provider value>
      {renderRoot ? (
        renderRoot({
          className: surfaceClass,
          children,
          'aria-label': ariaLabel,
          'aria-labelledby': ariaLabelledBy,
        })
      ) : (
        <Element className={surfaceClass} aria-label={ariaLabel} aria-labelledby={ariaLabelledBy}>
          {children}
        </Element>
      )}
    </InsideSurface.Provider>
  );
}
