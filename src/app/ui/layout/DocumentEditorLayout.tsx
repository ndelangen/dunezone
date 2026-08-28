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

interface LayoutSlots {
  sidebar: ReactNode;
  preview: ReactNode;
}

interface PaneGeometryDependencies extends LayoutSlots {
  fit: DocumentEditorFit;
  ratio: number;
}

function paneHeight(element: HTMLElement) {
  return Math.max(element.scrollHeight, element.getBoundingClientRect().height);
}

function readLayoutSlots(children: ReactNode): LayoutSlots {
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

  return { sidebar, preview };
}

function resolveStickyPane(sidebarHeight: number, previewHeight: number): StickyPane {
  const difference = sidebarHeight - previewHeight;
  if (difference < -1) {
    return 'sidebar';
  }
  if (difference > 1) {
    return 'preview';
  }
  return null;
}

function setStickyTop(element: HTMLElement, height: number, viewportHeight: number, stickyInset: number) {
  const top = Math.min(stickyInset, viewportHeight - stickyInset - height);
  element.style.setProperty('--document-editor-pane-sticky-top', `${top}px`);
}

function measurePaneGeometry(
  root: HTMLElement,
  sidebarContent: HTMLElement,
  previewFrame: HTMLElement,
  setStickyPane: (pane: StickyPane) => void
) {
  const previewHeight = paneHeight(previewFrame);
  const sidebarHeight = paneHeight(sidebarContent);
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const stickyInset = Number.parseFloat(getComputedStyle(root).getPropertyValue('--document-editor-sticky-inset'));
  const resolvedStickyInset = Number.isFinite(stickyInset) ? stickyInset : 16;

  setStickyTop(sidebarContent, sidebarHeight, viewportHeight, resolvedStickyInset);
  setStickyTop(previewFrame, previewHeight, viewportHeight, resolvedStickyInset);

  const previewHeightValue = `${previewHeight}px`;
  if (root.style.getPropertyValue('--document-editor-preview-height') !== previewHeightValue) {
    root.style.setProperty('--document-editor-preview-height', previewHeightValue);
  }

  setStickyPane(resolveStickyPane(sidebarHeight, previewHeight));
}

function isValidRatio(ratio: number) {
  return Number.isFinite(ratio) && ratio > 0;
}

function observeElementSizes(elements: HTMLElement[], scheduleMeasure: () => void) {
  if (typeof ResizeObserver === 'undefined') {
    return () => undefined;
  }

  const observer = new ResizeObserver(scheduleMeasure);
  elements.forEach((element) => observer.observe(element));
  return () => observer.disconnect();
}

function observeVisualViewport(scheduleMeasure: () => void) {
  const visualViewport = window.visualViewport;
  if (!visualViewport) {
    return () => undefined;
  }

  visualViewport.addEventListener('resize', scheduleMeasure);
  visualViewport.addEventListener('scroll', scheduleMeasure);
  return () => {
    visualViewport.removeEventListener('resize', scheduleMeasure);
    visualViewport.removeEventListener('scroll', scheduleMeasure);
  };
}

function observePaneGeometry(
  root: HTMLElement,
  sidebarContent: HTMLElement,
  previewFrame: HTMLElement,
  setStickyPane: (pane: StickyPane) => void
) {
  let animationFrame = 0;
  const measure = () => measurePaneGeometry(root, sidebarContent, previewFrame, setStickyPane);
  const scheduleMeasure = () => {
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(measure);
  };

  measure();
  const stopObservingSizes = observeElementSizes([root, sidebarContent, previewFrame], scheduleMeasure);
  const stopObservingViewport = observeVisualViewport(scheduleMeasure);
  window.addEventListener('resize', scheduleMeasure);
  window.addEventListener('scroll', scheduleMeasure, { passive: true });

  return () => {
    cancelAnimationFrame(animationFrame);
    stopObservingSizes();
    stopObservingViewport();
    window.removeEventListener('resize', scheduleMeasure);
    window.removeEventListener('scroll', scheduleMeasure);
  };
}

function usePaneGeometry({ fit, ratio, preview, sidebar }: PaneGeometryDependencies) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const previewFrameRef = useRef<HTMLDivElement>(null);
  const [stickyPane, setStickyPane] = useState<StickyPane>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const sidebarContent = sidebarContentRef.current;
    const previewFrame = previewFrameRef.current;
    if (!root) {
      return;
    }
    if (!sidebarContent) {
      return;
    }
    if (!previewFrame) {
      return;
    }

    return observePaneGeometry(root, sidebarContent, previewFrame, setStickyPane);
  }, [fit, ratio, preview, sidebar]);

  return { rootRef, sidebarContentRef, previewFrameRef, stickyPane };
}

/*
 * Places an editor Sidebar beside a ratio-correct Preview without owning either pane's content.
 * The document owns vertical scrolling. The Layout owns pane allocation, the narrow horizontal track,
 * and which shorter pane can remain visible while its taller neighbour continues through the document.
 */
function DocumentEditorLayoutBase({ ratio, fit, children }: DocumentEditorLayoutProps) {
  if (!isValidRatio(ratio)) {
    throw new RangeError('DocumentEditorLayout ratio must be a positive finite number.');
  }

  const { sidebar, preview } = readLayoutSlots(children);
  const { rootRef, sidebarContentRef, previewFrameRef, stickyPane } = usePaneGeometry({
    fit,
    ratio,
    preview,
    sidebar,
  });

  return (
    <div className={styles.container} style={{ '--document-editor-ratio': ratio } as CSSProperties}>
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
