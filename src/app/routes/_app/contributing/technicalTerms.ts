/**
 * Technical glossary definitions for the contributing guide.
 * AGENTS.md defines the code-structure terms.
 * Game terms live in src/shared/glossary/terms.ts, and CONTEXT.md defines product terms.
 */

type TechnicalTopic = 'page' | 'structure' | 'assets' | 'data';

export type TechnicalTerm = {
  /** Stable anchor on the page; never reuse one for a different idea. */
  id: string;
  term: string;
  topic: TechnicalTopic;
  /** How the code spells it, when that differs from the term or is worth searching for. */
  code?: string;
  explanation: string;
  /** Repository path of the file or folder that owns the idea. */
  where: string;
  /** Words for the same idea we do not use, with the reason in the explanation when it is not obvious. */
  avoid?: readonly string[];
};

export const TECHNICAL_GLOSSARY: readonly TechnicalTerm[] = [
  {
    id: 'chrome',
    term: 'Chrome',
    topic: 'page',
    code: 'src/app/shell',
    explanation:
      'The frame around ordinary application pages. It includes the artwork band, site navigation and footer. Chrome is named for its position around the page, so it is separate from the six kit categories.',
    where: 'src/app/shell',
  },
  {
    id: 'band',
    term: 'Band',
    topic: 'page',
    code: 'AppHeader',
    explanation:
      'The artwork across the top of the application. The page header appears over it. On an immersive page, the band fills the window.',
    where: 'src/app/shell/AppHeader.tsx',
    avoid: ['hero', 'banner'],
  },
  {
    id: 'page-layout',
    term: 'PageLayout',
    topic: 'page',
    explanation:
      'The frame each application page renders. It has Header, Toolbar and Content slots. PageLayout responds to the window width; other layouts respond to their container width.',
    where: 'src/app/ui/layout/PageLayout.tsx',
  },
  {
    id: 'page-header',
    term: 'Page header',
    topic: 'page',
    code: 'PageLayout.Header',
    explanation:
      'The slot for the page title and introduction, over the artwork band. Pages that omit it use the compact layout.',
    where: 'src/app/ui/layout/PageLayout.tsx',
    avoid: ['PageHead'],
  },
  {
    id: 'page-toolbar',
    term: 'Page toolbar',
    topic: 'page',
    code: 'PageLayout.Toolbar',
    explanation: 'The slot between Header and Content. It holds a Toolbar for page-wide search, filters and actions.',
    where: 'src/app/ui/layout/PageLayout.tsx',
    avoid: ['PageToolbar'],
  },
  {
    id: 'page-content',
    term: 'Page content',
    topic: 'page',
    code: 'PageLayout.Content',
    explanation: "The slot for the page's main content. It provides the main landmark used by screen readers.",
    where: 'src/app/ui/layout/PageLayout.tsx',
  },
  {
    id: 'page-title',
    term: 'PageTitle',
    topic: 'page',
    explanation:
      "The page's top-level heading, with an optional short label above it. The route renders one PageTitle inside PageLayout.Header.",
    where: 'src/app/ui/block/PageTitle.tsx',
  },
  {
    id: 'toolbar',
    term: 'Toolbar',
    topic: 'page',
    explanation:
      'A pane with actions at the edges and search or filters in the centre. It has one primary action. At narrow widths, status labels collapse to icons instead of wrapping.',
    where: 'src/app/ui/surface/Toolbar.tsx',
  },
  {
    id: 'surface',
    term: 'Surface',
    topic: 'page',
    explanation:
      'A component that draws a pane with a background and border. Other kit components remain transparent. A Surface cannot contain another Surface.',
    where: 'src/app/ui/surface/Surface.tsx',
    avoid: ['card', 'panel', 'box'],
  },
  {
    id: 'section',
    term: 'Section',
    topic: 'page',
    explanation: 'A region of content with a heading. Its nesting depth determines the heading level and size.',
    where: 'src/app/ui/block/Section.tsx',
  },
  {
    id: 'app-footer',
    term: 'Footer',
    topic: 'page',
    code: 'AppFooter',
    explanation:
      'The links at the bottom of the application. AppFooter belongs to the shell. PageLayout has no footer slot.',
    where: 'src/app/shell/AppFooter.tsx',
    avoid: ['PageFooter'],
  },
  {
    id: 'slot',
    term: 'Slot',
    topic: 'page',
    code: '<TriptychLayout.Left>',
    explanation:
      'A named region that a layout positions, written as a child component such as PageLayout.Content. Every layout has at least two slots.',
    where: 'src/app/ui/layout',
  },
  {
    id: 'adornment',
    term: 'Adornment',
    topic: 'page',
    code: 'icon, action, tool',
    explanation:
      'An icon, action button or hover text attached to a component. These decorate the component and do not count towards its slot limit.',
    where: 'AGENTS.md',
  },
  {
    id: 'kit',
    term: 'Kit',
    topic: 'structure',
    code: '@ui/*',
    explanation:
      'The components under src/app/ui, grouped into Content, Controls, Lists, Layout, Surfaces and Blocks. They render caller-supplied data and report user actions through callbacks. They may use record types, but cannot fetch data or navigate. The kit belongs to this application.',
    where: 'src/app/ui',
    avoid: ['design system', 'component library'],
  },
  {
    id: 'membrane',
    term: 'Membrane',
    topic: 'structure',
    explanation:
      'The contract between a component and its caller. Data, values and slots enter through props. Chosen values and user intents leave through callbacks. The caller handles effects such as fetching, saving and navigation.',
    where: 'AGENTS.md',
    avoid: ['interface', 'API'],
  },
  {
    id: 'organ',
    term: 'Organ',
    topic: 'structure',
    explanation:
      'A file used only by its own feature or kit machinery. Nothing outside that feature may import it, and it has no story. An outside importer or a story means it needs a different classification.',
    where: 'AGENTS.md',
    avoid: ['internal', 'private', 'helper'],
  },
  {
    id: 'doorway',
    term: 'Doorway',
    topic: 'structure',
    explanation:
      'The only allowed import path to otherwise restricted code. src/app/db is the doorway to Convex. ApplicationChrome and AppNotFound are the doorway to the shell.',
    where: 'src/app/db',
    avoid: ['wrapper', 'gateway'],
  },
  {
    id: 'seam',
    term: 'Seam',
    topic: 'structure',
    explanation:
      'A place where one implementation can replace another, including in tests. The live-query module is the seam between the app and Convex.',
    where: 'src/app/db/core/live.ts',
  },
  {
    id: 'widget',
    term: 'Widget',
    topic: 'structure',
    explanation:
      'An assembly of components shared by at least two pages, such as the faction editor. A large widget may also split into child widgets. Widgets receive data and callbacks from their caller; they cannot fetch or navigate.',
    where: 'src/app/widgets',
  },
  {
    id: 'picker',
    term: 'Picker',
    topic: 'structure',
    explanation:
      'A control that loads its own options when opened, or when an open popover mounts it. It reads through src/app/db, releases the subscription when the options close and reports a choice through a callback. Pickers live outside the kit and are the only components allowed to fetch.',
    where: 'src/app/pickers',
  },
  {
    id: 'shared-contract',
    term: 'Shared contract',
    topic: 'structure',
    code: '@shared/*',
    explanation:
      'A schema or rule used by more than one part of the deployed system. For example, the browser app and Convex use the same faction schema. Shared contracts cannot import the app or game renderers.',
    where: 'src/shared',
  },
  {
    id: 'renderer',
    term: 'Renderer',
    topic: 'structure',
    code: 'src/game',
    explanation:
      'A component that draws a card, token or other game asset for screen and print. Renderers cannot import the app or Mantine. The app and publisher browser use the same rendering code.',
    where: 'src/game',
  },

  {
    id: 'publisher',
    term: 'Publisher',
    topic: 'assets',
    explanation:
      'The scheduled Worker that processes publication jobs. It opens each asset in a browser, captures its renderer and stores the image.',
    where: 'workers/publisher',
  },
  {
    id: 'publication-job',
    term: 'Publication job',
    topic: 'assets',
    explanation:
      'A request in Convex to render a new image of one asset. The publisher picks up these jobs on its scheduled runs.',
    where: 'src/shared/asset-publishing/publication.ts',
    avoid: ['asset generation'],
  },
  {
    id: 'renderer-revision',
    term: 'Renderer revision',
    topic: 'assets',
    explanation:
      "A number tracked for each asset type. Increasing it marks that type's published images as stale. The next release queues new captures.",
    where: 'src/shared/asset-publishing/renderer-revisions.ts',
    avoid: ['renderer version'],
  },
  {
    id: 'capture',
    term: 'Capture page',
    topic: 'assets',
    explanation: 'The page the publisher screenshots. It renders one asset without the application chrome.',
    where: 'src/app/print/capture',
  },
  {
    id: 'published-image',
    term: 'PublishedImage',
    topic: 'assets',
    explanation:
      "The component that displays a published image. It reserves the image's space with a placeholder, then reveals the loaded image with a blur transition.",
    where: 'src/app/ui/content/PublishedImage.tsx',
  },

  {
    id: 'live-query',
    term: 'Live query',
    topic: 'data',
    code: 'useLiveQuery',
    explanation:
      'A Convex subscription that updates when the records it reads change. A page uses at most one query for its page data. Private viewer data uses separate queries.',
    where: 'src/app/db/core/live.ts',
  },
  {
    id: 'slug',
    term: 'Slug',
    topic: 'data',
    explanation:
      "The readable part of a record's address, based on its name. A short suffix distinguishes records with the same name.",
    where: 'src/shared/slugify.ts',
  },
  {
    id: 'former-address',
    term: 'Former address',
    topic: 'data',
    code: 'former_slugs',
    explanation: 'An old slug kept after a rename. Requests to it redirect to the current address.',
    where: 'src/app/db/formerAddresses.ts',
  },
  {
    id: 'migration',
    term: 'Widen, migrate, narrow',
    topic: 'data',
    explanation:
      'A sequence for changing a schema while clients keep running. Accept both data shapes, migrate the stored records, then remove the old shape once records and clients no longer need it.',
    where: 'docs/convex-migrations.md',
  },
  {
    id: 'snapshot',
    term: 'Snapshot',
    topic: 'data',
    explanation:
      'An anonymised copy of published content used for local development and rebuilding the development database.',
    where: 'scripts/lib/snapshot-policy.ts',
  },
  {
    id: 'release-gate',
    term: 'Release gate',
    topic: 'data',
    code: 'release_gate',
    explanation:
      'The first deployment job. It checks the live Worker commits and skips releases that are already deployed or have been superseded.',
    where: '.github/workflows/deploy-main.yml',
  },
];
