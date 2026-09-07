import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite';

const rootRoute = fileURLToPath(new URL('../src/app/routes/__root.tsx', import.meta.url));
const pageStylesheet = fileURLToPath(new URL('../src/app/styles/page.css', import.meta.url));
const stub = fileURLToPath(new URL('./page-stylesheet-stub.css', import.meta.url));

/**
 * Keeps the document stylesheet out of the root route's import graph under Storybook.
 * The application's root route imports the stylesheet for its side effect, and every page story reaches that route through the generated route tree, so the stylesheet lands in the preview document the moment a page story's module loads and never leaves.
 * In the browser test run, where story files share one iframe per session, it then rewrote the geometry of every later file: the stylesheet's root rule widens the root element to the full viewport, and a layout story measured its content 15px further right than the isolated run it was calibrated against.
 * Under Storybook the stylesheet is a per-story resource instead: the page fixture carries it for the lifetime of the page it renders, the way the shell stories already do, through the inline import that this plugin leaves untouched.
 */
export function pageStylesheetStaysWithItsStory(): Plugin {
  return {
    name: 'dunezone:page-stylesheet-stays-with-its-story',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (importer !== rootRoute) {
        return null;
      }
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (resolved === null || resolved.id.split('?')[0] !== pageStylesheet) {
        return null;
      }
      return stub;
    },
  };
}
