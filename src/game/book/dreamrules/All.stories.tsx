import preview from '@sb/preview';

import { Book } from '../utils/Book';
import * as rulebook from './Pages.stories';

const meta = preview.meta({
  title: 'Dreamrules',

  component: Book,
  args: {},
  globals: {
    viewport: {
      value: 'page',
    },
  },
});

const pagesIds =
  ((rulebook as any).__namedExportsOrder as Exclude<keyof typeof rulebook, 'default'>[]) ||
  Object.keys(rulebook);

export const All = meta.story({
  args: {
    cover: rulebook.default.input?.parameters?.cover,
    pages: pagesIds
      .filter((key) => !key.match('default') && !key.startsWith('_'))
      // oxlint-disable-next-line import/namespace -- The story intentionally accesses every export.
      .map((key) => rulebook[key]?.input.args.children),

    ratio: rulebook.default.input.args.ratio,
  },
});
