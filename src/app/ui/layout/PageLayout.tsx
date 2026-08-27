import { Children, createContext, isValidElement, useContext } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import styles from './PageLayout.module.css';

/**
 * What kind of header a page declares.
 * `compact` shrinks the band;
 * `hero` marks a page whose name is set in the display face.
 */
export type PageHeaderSize = 'default' | 'compact' | 'hero';

/** How much horizontal room the page content may claim. */
export type PageContentWidth = 'default' | 'viewport';

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

function Header(_: PropsWithChildren<{ size?: PageHeaderSize }>): null {
  return null;
}

function Toolbar(_: PropsWithChildren): null {
  return null;
}

function Content(_: PropsWithChildren<{ width?: PageContentWidth }>): null {
  return null;
}

/**
 * The frame every terminal route mounts: the hero band, an optional toolbar, and the content.
 *
 * It is the one Layout coupled to the shell: its children join `AppHeader`'s grid through `display: contents`, and it declares its state through `data-page-layout-*`, which `AppHeader.module.css` reads back with `:has()` to size the artwork band.
 * That is why it is the documented exemption from the container-query rule: it is the page frame, sized against the viewport in concert with the shell, not a container.
 *
 * Slots: `Header` (omit it to mark the page intentionally compact;
 * `size="compact"` shrinks the band, and `size="hero"` declares a page whose title takes the display treatment), `Toolbar`, and
 * `Content` (`width="viewport"` lets the content use the viewport between the shell gutters).
 */
function PageLayoutBase({ children }: PropsWithChildren) {
  let hasHeader = false;
  let header: ReactNode = null;
  let headerSize: PageHeaderSize = 'default';
  let toolbar: ReactNode = null;
  let content: ReactNode = null;
  let contentWidth: PageContentWidth = 'default';

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }
    if (child.type === Header) {
      hasHeader = true;
      const props = child.props as PropsWithChildren<{ size?: PageHeaderSize }>;
      header = props.children;
      headerSize = props.size ?? 'default';
      return;
    }
    if (child.type === Toolbar) {
      toolbar = (child.props as PropsWithChildren).children;
      return;
    }
    if (child.type === Content) {
      const props = child.props as PropsWithChildren<{ width?: PageContentWidth }>;
      content = props.children;
      contentWidth = props.width ?? 'default';
    }
  });

  return (
    <div
      className={styles.layout}
      data-page-layout-compact={hasHeader ? undefined : 'true'}
      data-page-layout-header-size={hasHeader ? headerSize : undefined}
    >
      {/* data-scheme-paper: header content always sits on the light artwork band, so it keeps
          its light-scheme rendering in both schemes (see tokens.css). */}
      {hasHeader && (
        <div className={styles.headerContent} data-scheme-paper>
          <InsidePageHeader.Provider value>{header}</InsidePageHeader.Provider>
        </div>
      )}
      <main className={styles.content}>
        {toolbar != null && (
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

type PageLayoutComponent = ((props: PropsWithChildren) => ReactNode) & {
  Header: typeof Header;
  Toolbar: typeof Toolbar;
  Content: typeof Content;
};

export const PageLayout = Object.assign(PageLayoutBase, {
  Header,
  Toolbar,
  Content,
}) as PageLayoutComponent;
