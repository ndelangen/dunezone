import { Children, isValidElement, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PropsWithChildren, ReactNode } from 'react';

import styles from './DocumentEditorLayout.module.css';

export type DocumentEditorFit = 'height' | 'width';

export interface DocumentEditorLayoutProps extends PropsWithChildren {
  /** Preview width divided by Preview height. */
  ratio: number;
  /** The preferred fit. Useful pane widths may overrule it. */
  fit: DocumentEditorFit;
}

function Sidebar(_: PropsWithChildren): null {
  return null;
}

function Preview(_: PropsWithChildren): null {
  return null;
}

type StickyPane = 'preview' | 'sidebar' | null;

function paneHeight(element: HTMLElement) {
  return Math.max(element.scrollHeight, element.getBoundingClientRect().height);
}

/*
 * Places an editor Sidebar beside a ratio-correct Preview without owning either pane's content.
 * The document owns vertical scrolling. The Layout owns pane allocation, the narrow horizontal track,
 * and which shorter pane can remain visible while its taller neighbour continues through the document.
 */
function DocumentEditorLayoutBase({ ratio, fit, children }: DocumentEditorLayoutProps) {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new RangeError('DocumentEditorLayout ratio must be a positive finite number.');
  }

  let sidebar: ReactNode = null;
  let preview: ReactNode = null;

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }
    if (child.type === Sidebar) {
      sidebar = (child.props as PropsWithChildren).children;
      return;
    }
    if (child.type === Preview) {
      preview = (child.props as PropsWithChildren).children;
    }
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const [stickyPane, setStickyPane] = useState<StickyPane>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const sidebarContent = sidebarContentRef.current;
    const previewFrame = previewFrameRef.current;
    if (!root || !sidebarContent || !previewFrame) {
      return;
    }

    let animationFrame = 0;
    const measure = () => {
      const previewHeight = paneHeight(previewFrame);
      const sidebarHeight = paneHeight(sidebarContent);
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const stickyInset = Number.parseFloat(getComputedStyle(root).getPropertyValue('--document-editor-sticky-inset'));
      const resolvedStickyInset = Number.isFinite(stickyInset) ? stickyInset : 16;
      const difference = sidebarHeight - previewHeight;

      sidebarContent.style.setProperty(
        '--document-editor-pane-sticky-top',
        `${Math.min(resolvedStickyInset, viewportHeight - resolvedStickyInset - sidebarHeight)}px`
      );
      previewFrame.style.setProperty(
        '--document-editor-pane-sticky-top',
        `${Math.min(resolvedStickyInset, viewportHeight - resolvedStickyInset - previewHeight)}px`
      );

      const previewHeightValue = `${previewHeight}px`;
      if (root.style.getPropertyValue('--document-editor-preview-height') !== previewHeightValue) {
        root.style.setProperty('--document-editor-preview-height', previewHeightValue);
      }

      let nextStickyPane: StickyPane = null;
      if (difference < -1) {
        nextStickyPane = 'sidebar';
      } else if (difference > 1) {
        nextStickyPane = 'preview';
      }
      setStickyPane((current) => (current === nextStickyPane ? current : nextStickyPane));
    };

    const scheduleMeasure = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(measure);
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    observer?.observe(root);
    observer?.observe(sidebarContent);
    observer?.observe(previewFrame);
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    window.visualViewport?.addEventListener('scroll', scheduleMeasure);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
      window.visualViewport?.removeEventListener('scroll', scheduleMeasure);
    };
  }, [fit, ratio, preview, sidebar]);

  return (
    <div
      className={styles.container}
      style={{ '--document-editor-ratio': ratio } as CSSProperties}
    >
      <div
        ref={rootRef}
        className={styles.root}
        data-document-editor-layout
        data-fit={fit}
        data-sticky-pane={stickyPane ?? undefined}
      >
        <div className={styles.track}>
          <div className={styles.sidebarPane} data-document-editor-sidebar>
            <div
              ref={sidebarContentRef}
              className={styles.sidebarContent}
              data-sticky={stickyPane === 'sidebar' || undefined}
            >
              {sidebar}
            </div>
          </div>
          <div className={styles.previewPane} data-document-editor-preview>
            <div
              ref={previewFrameRef}
              className={styles.previewFrame}
              data-sticky={stickyPane === 'preview' || undefined}
            >
              <div className={styles.previewContent}>{preview}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type DocumentEditorLayoutComponent = ((props: DocumentEditorLayoutProps) => ReactNode) & {
  Sidebar: typeof Sidebar;
  Preview: typeof Preview;
};

export const DocumentEditorLayout = Object.assign(DocumentEditorLayoutBase, {
  Sidebar,
  Preview,
}) as DocumentEditorLayoutComponent;
