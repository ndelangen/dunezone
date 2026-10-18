/**
 * Public pages with no record behind them: served by the Worker, rendered on the server, listed in the landing sitemap.
 * Imports nothing, so the Node-run release verification can load it directly.
 */
export const RECORDLESS_PUBLIC_PAGES = ['/glossary', '/contributing', '/future-plans', '/privacy', '/blog'];

/** Introductory topics in the guide's Start here tab group. */
export const CONTRIBUTING_INTRO_PAGES = [
  { slug: 'stack', title: 'Technology stack' },
  { slug: 'setup', title: 'Local setup' },
] as const;

/** Topics in the guide's subject tab groups. */
export const CONTRIBUTING_LESSONS = {
  code: [
    { slug: 'data', title: 'A page and its data' },
    { slug: 'interface', title: 'Building a page' },
    { slug: 'testing', title: 'Checks' },
  ],
  deployment: [
    { slug: 'publishing', title: 'Image publishing' },
    { slug: 'schema', title: 'Schema changes' },
  ],
  glossary: [
    { slug: 'page', title: 'Parts of a page' },
    { slug: 'structure', title: 'Code structure' },
    { slug: 'board', title: 'Boards and tints' },
    {
      slug: 'assets',
      title: 'Image terms',
    },
    {
      slug: 'data',
      title: 'Data terms',
    },
  ],
  decisions: [
    { slug: 'components', title: 'Components' },
    { slug: 'layout', title: 'Layout and spacing' },
    { slug: 'data', title: 'Data and state' },
    { slug: 'look', title: 'Interaction' },
    { slug: 'code', title: 'Code and tests' },
  ],
} as const;

export type ContributingCategory = keyof typeof CONTRIBUTING_LESSONS;

export function contributingLessonPath(category: ContributingCategory, slug: string) {
  const folder = category === 'decisions' ? 'design-decisions' : category;
  return '/contributing/' + folder + '/' + slug;
}

/** Earlier guide addresses redirect to the matching topic in the scrolling guide. */
export const CONTRIBUTING_SUBPAGES = [
  ...CONTRIBUTING_INTRO_PAGES.map((topic) => '/contributing/' + topic.slug),
  '/contributing/code',
  '/contributing/deployment',
  '/contributing/glossary',
  '/contributing/design-decisions',
  ...Object.entries(CONTRIBUTING_LESSONS).flatMap(([category, lessons]) =>
    lessons.map((lesson) => contributingLessonPath(category as ContributingCategory, lesson.slug))
  ),
];

/**
 * Record-less pages the page header links to, so the footer leaves them out;
 * every other one needs a footer link.
 */
export const HEADER_PUBLIC_PAGES = ['/blog'];

/**
 * The media library's game galleries, by path slug.
 * The Topic and Lucide icon libraries stay browser-only, because they show third-party icon sets rather than Dune Zone artwork.
 */
export const MEDIA_GALLERY_SLUGS = ['decals', 'symbols', 'emblems', 'icons', 'troops', 'leaders', 'planets', 'covers'];

/** The media overview and its galleries, served like the record-less pages above but without their descendants. */
export const MEDIA_PUBLIC_PAGES = ['/media', ...MEDIA_GALLERY_SLUGS.map((slug) => `/media/game/${slug}`)];
