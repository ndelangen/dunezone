import { Children, createContext, useContext, useLayoutEffect, useRef } from 'react';
import type { PropsWithChildren, ReactNode, RefObject } from 'react';

import { collectSlots } from './collectSlots';
import { IMMERSIVE_ENTER_EVENT, IMMERSIVE_LEAVE_EVENT } from './immersiveEvents';
import styles from './PageLayout.module.css';

/**
 * What kind of header a page declares.
 * `compact` shrinks the band;
 * `collapsed` keeps the accessible page title and reduces the band to navigation;
 * `hero` marks a page whose name is set in the display face;
 * `immersive` grows the band to fill the whole window, with the header content laid over its darker left side.
 */
export type PageHeaderSize = 'default' | 'compact' | 'collapsed' | 'hero' | 'immersive';

/**
 * Where the header content sits across the band.
 * `center` (the default) centres the title group;
 * `start` sets it on the band's one left edge, the same inset on every page that asks for it, so left-aligned titles line up from page to page.
 * It is for a `PageTitle` header: a `PageIdentity` band keeps its own centred column.
 */
type PageHeaderAlign = 'center' | 'start';

/** How much horizontal room the page content may claim. */
type PageContentWidth = 'default' | 'viewport';

type PageLayoutProps = PropsWithChildren<{ height?: 'document' | 'fullscreen' }>;

/** The id of the page's `main`, the target of the shell's skip link. One page mounts one PageLayout, so it is unique. */
export const PAGE_CONTENT_ID = 'page-content';

const InsidePageHeader = createContext(false);

/**
 * Whether the caller is rendering inside `PageLayout.Header`.
 *
 * `PageTitle` reads this to warn when a page title is rendered outside the band.
 * The band is the only place the header treatment is correct: `data-scheme-paper` is set on the header content alone, while `data-page-layout-header-size` sits on the layout root, which `display: contents` leaves matching selectors for everything inside the layout, `Content` included.
 */
export function useInsidePageHeader(): boolean {
  return useContext(InsidePageHeader);
}

/**
 * The size a worded action renders at: every one in the band is `md`, beside the page's `CallToAction` (Norbert, 2026-11-07).
 * A caller that asks for another size there is told so in development, since the band would otherwise drop the request without a word.
 */
export function useHeaderActionSize<Size>(component: string, size: Size | undefined): Size | 'md' | undefined {
  const insideHeader = useInsidePageHeader();
  if (!insideHeader) {
    return size;
  }
  if (import.meta.env.DEV && size !== undefined && size !== 'md') {
    console.warn(
      `[${component}] size="${String(size)}" is ignored inside PageLayout.Header, where every worded action is md. Drop the size prop.`
    );
  }
  return 'md';
}

const Header: (props: PropsWithChildren<{ size?: PageHeaderSize; align?: PageHeaderAlign }>) => null = () => null;

const Toolbar: (props: PropsWithChildren) => null = () => null;

const Content: (props: PropsWithChildren<{ width?: PageContentWidth }>) => null = () => null;

/**
 * The frame every terminal route mounts: the hero band, an optional toolbar, and the content.
 *
 * It is the one Layout coupled to the shell: its children join `AppHeader`'s grid through `display: contents`, and it declares its state through `data-page-layout-*`, which `AppHeader.module.css` reads back with `:has()` to size the artwork band.
 * That is why it is the documented exemption from the container-query rule: it is the page frame, sized against the viewport in concert with the shell, not a container.
 *
 * Slots: `Header` (omit it to mark the page intentionally compact;
 * `size="compact"` shrinks the band;
 * `size="hero"` declares a page whose title takes the display treatment;
 * `size="immersive"` grows the band edge to edge over the whole window, for a page that is one invitation such as sign-in;
 * `align="start"` sets the header content on the band's one shared left edge instead of centring it), `Toolbar`, and
 * `Content` (`width="viewport"` lets the content use the viewport between the shell gutters).
 * The default `height="document"` keeps the shell's band and footer and scrolls the document.
 * `height="fullscreen"` removes the shell chrome and gives the content the whole viewport.
 * The header remains accessible but visually hidden;
 * the child owns any scrolling.
 *
 * Landmarks: the header content is the page's one `header` (banner), since the shell's band above it is artwork and site navigation;
 * the toolbar and content are its one `main`, with the id `PAGE_CONTENT_ID` the shell's skip link moves to.
 */
/* How long the band takes to shrink back from an immersive page; matches the immersive transition in the AppHeader stylesheet. */
/*
 * Tells the shell's frame when an immersive page arrives and leaves, so the band can grow to fill the window and shrink back.
 * Both run in the commit that mounts or removes the page, before the browser restyles, so the band can still read where it stood.
 */
function useAnnounceImmersive(layoutRef: RefObject<HTMLDivElement | null>, immersive: boolean) {
  useLayoutEffect(() => {
    const frame = immersive ? layoutRef.current?.closest<HTMLElement>('[data-app-frame]') : null;
    if (!frame) {
      return;
    }
    frame.dispatchEvent(new Event(IMMERSIVE_ENTER_EVENT));
    return () => {
      frame.dispatchEvent(new Event(IMMERSIVE_LEAVE_EVENT));
    };
  }, [layoutRef, immersive]);
}

function PageLayoutBase({ children, height = 'document' }: PageLayoutProps) {
  const slots = collectSlots('PageLayout', { Header, Toolbar, Content }, children);
  const hasHeader = slots.Header !== undefined;
  const header = slots.Header?.children;
  const headerSize: PageHeaderSize = slots.Header?.size ?? 'default';
  const headerAlign: PageHeaderAlign = slots.Header?.align ?? 'center';
  const toolbar = slots.Toolbar?.children;
  const content = slots.Content?.children;
  const contentWidth: PageContentWidth = slots.Content?.width ?? 'default';

  const hasToolbarContent = Children.toArray(toolbar).length > 0;
  const layoutRef = useRef<HTMLDivElement>(null);
  useAnnounceImmersive(layoutRef, hasHeader && headerSize === 'immersive');

  return (
    <div
      ref={layoutRef}
      className={styles.layout}
      data-page-layout-compact={!hasHeader || headerSize === 'collapsed' ? 'true' : undefined}
      data-page-layout-header-size={hasHeader ? headerSize : undefined}
      data-page-layout-height={height === 'document' ? undefined : height}
    >
      {/* data-scheme-paper: header content always sits on the light artwork band, so it keeps
          its light-scheme rendering in both schemes (see tokens.css). */}
      {hasHeader && (
        <header
          className={styles.headerContent}
          data-scheme-paper
          data-page-layout-header-align={headerAlign === 'start' ? 'start' : undefined}
        >
          <InsidePageHeader.Provider value>{header}</InsidePageHeader.Provider>
        </header>
      )}
      <main className={styles.content} id={PAGE_CONTENT_ID}>
        {hasToolbarContent && (
          <div className={styles.toolbar} data-page-layout-toolbar>
            {toolbar}
          </div>
        )}
        <div className={styles.pageContent} data-page-layout-content data-page-layout-content-width={contentWidth}>
          {content}
        </div>
      </main>
    </div>
  );
}

type PageLayoutComponent = ((props: PageLayoutProps) => ReactNode) & {
  Header: typeof Header;
  Toolbar: typeof Toolbar;
  Content: typeof Content;
};

export const PageLayout = Object.assign(PageLayoutBase, {
  Header,
  Toolbar,
  Content,
}) as PageLayoutComponent;
