import { createContext, useContext } from 'react';

/**
 * What kind of header a page declares.
 * `compact` shrinks the band;
 * `hero` marks a page whose name is set in the display face.
 */
export type PageHeaderSize = 'default' | 'compact' | 'hero';

/**
 * The declared header size, readable by what the header contains.
 *
 * `PageLayout` already publishes this as `data-page-layout-header-size` for stylesheets to read.
 * This is the same declaration for the parts that cannot be reached from CSS, such as a Mantine tone prop.
 * Reading it is the same direction of travel as Content knowing the theme: a leaf knowing its context, never a Layout knowing its contents.
 */
const PageHeaderSizeContext = createContext<PageHeaderSize>('default');

export const PageHeaderSizeProvider = PageHeaderSizeContext.Provider;

export function usePageHeaderSize(): PageHeaderSize {
  return useContext(PageHeaderSizeContext);
}
