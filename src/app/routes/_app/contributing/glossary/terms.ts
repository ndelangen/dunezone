/**
 * The names Dune Zone's code gives its own ideas and interface parts, for the contributing guide's technical glossary.
 * Game words live in `src/shared/glossary/terms.ts` and product words in CONTEXT.md;
 * the canonical statements of the code-structure words are in AGENTS.md, and an entry here explains them for a newcomer.
 */

export type TechnicalTopic = 'page' | 'structure' | 'board' | 'assets' | 'data';

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

export const TECHNICAL_TOPICS: readonly { id: TechnicalTopic; label: string; summary: string }[] = [
  { id: 'page', label: 'Parts of a page', summary: 'What we call each region of a screen, from the frame inwards.' },
  {
    id: 'structure',
    label: 'How the code is organised',
    summary: 'The words for how the code is built and kept apart.',
  },
  { id: 'board', label: 'Boards and the Play table', summary: 'What the code calls the things on and around a board.' },
  { id: 'assets', label: 'Pictures and publishing', summary: 'How game artwork is drawn, stored and served.' },
  { id: 'data', label: 'Data and delivery', summary: 'How records reach a page and a release reaches the site.' },
];

export const TECHNICAL_GLOSSARY: readonly TechnicalTerm[] = [
  {
    id: 'chrome',
    term: 'Chrome',
    topic: 'page',
    code: 'src/app/shell',
    explanation:
      'The frame every ordinary page sits in: the artwork band at the top, the site navigation and the footer. It is decided by where it sits, not by what it is handed, so it is not a kit category.',
    where: 'src/app/shell',
  },
  {
    id: 'band',
    term: 'Band',
    topic: 'page',
    code: 'AppHeader',
    explanation:
      "The strip of artwork across the top of the chrome. A page's header sits on it, and an immersive page lets it grow to fill the window.",
    where: 'src/app/shell/AppHeader.tsx',
    avoid: ['hero', 'banner'],
  },
  {
    id: 'page-layout',
    term: 'PageLayout',
    topic: 'page',
    explanation:
      'The frame every page mounts itself, with three slots: Header, Toolbar and Content. It is the one layout that sizes itself by the window rather than by its container.',
    where: 'src/app/ui/layout/PageLayout.tsx',
  },
  {
    id: 'page-header',
    term: 'Page header',
    topic: 'page',
    code: 'PageLayout.Header',
    explanation:
      "The slot that sits on the band and holds the page's title and introduction. A page can leave it out, which makes the page compact.",
    where: 'src/app/ui/layout/PageLayout.tsx',
    avoid: ['PageHead'],
  },
  {
    id: 'page-toolbar',
    term: 'Page toolbar',
    topic: 'page',
    code: 'PageLayout.Toolbar',
    explanation:
      'The slot between the header and the content, holding one Toolbar with the search and actions for the whole page.',
    where: 'src/app/ui/layout/PageLayout.tsx',
    avoid: ['PageToolbar'],
  },
  {
    id: 'page-content',
    term: 'Page content',
    topic: 'page',
    code: 'PageLayout.Content',
    explanation: 'The slot for everything else on the page, and the main landmark a screen reader jumps to.',
    where: 'src/app/ui/layout/PageLayout.tsx',
  },
  {
    id: 'page-title',
    term: 'PageTitle',
    topic: 'page',
    explanation:
      "The page's one top-level heading, with an optional eyebrow above it. It is mounted once, inside the page header.",
    where: 'src/app/ui/block/PageTitle.tsx',
  },
  {
    id: 'toolbar',
    term: 'Toolbar',
    topic: 'page',
    explanation:
      'A pane with actions at its edges and the search or filters in its centre. It holds one primary action, and when it runs out of room it folds its statuses into glyphs instead of wrapping.',
    where: 'src/app/ui/surface/Toolbar.tsx',
  },
  {
    id: 'surface',
    term: 'Surface',
    topic: 'page',
    explanation:
      'A pane: the only kind of component that paints a background and border. Everything else is see-through, and a Surface never sits inside another Surface.',
    where: 'src/app/ui/surface/Surface.tsx',
    avoid: ['card', 'panel', 'box'],
  },
  {
    id: 'section',
    term: 'Section',
    topic: 'page',
    explanation:
      'A titled region of content. Its heading level follows how deep it sits, so a caller never picks a heading size.',
    where: 'src/app/ui/block/Section.tsx',
  },
  {
    id: 'app-footer',
    term: 'Footer',
    topic: 'page',
    code: 'AppFooter',
    explanation:
      'The row of links at the bottom of the chrome. It belongs to the shell, so a page has no footer slot of its own.',
    where: 'src/app/shell/AppFooter.tsx',
    avoid: ['PageFooter'],
  },
  {
    id: 'slot',
    term: 'Slot',
    topic: 'page',
    code: '<TriptychLayout.Left>',
    explanation:
      'A named place a layout lays content into, written as a child component such as PageLayout.Content. Every layout has at least two.',
    where: 'src/app/ui/layout',
  },
  {
    id: 'adornment',
    term: 'Adornment',
    topic: 'page',
    code: 'icon, action, tool',
    explanation:
      "A glyph, an action button or hover text that decorates a component. Adornments never count as one of a component's slots.",
    where: 'AGENTS.md',
  },
  {
    id: 'kit',
    term: 'Kit',
    topic: 'structure',
    code: '@ui/*',
    explanation:
      'Our own components, in six categories under src/app/ui: Content, Controls, Lists, Layout, Surfaces and Blocks. Kit components know nothing about Dune Zone records and are never published as a package.',
    where: 'src/app/ui',
    avoid: ['design system', 'component library'],
  },
  {
    id: 'membrane',
    term: 'Membrane',
    topic: 'structure',
    explanation:
      'Everything that crosses between a component and its caller: data and slots flow in, chosen values and intents flow out through callbacks. Effects never cross, so a component never fetches or navigates on its own.',
    where: 'AGENTS.md',
    avoid: ['interface', 'API'],
  },
  {
    id: 'organ',
    term: 'Organ',
    topic: 'structure',
    explanation:
      'A file only its own feature uses. Nothing outside may import it and it has no story; the day either changes, it needs a proper home.',
    where: 'AGENTS.md',
    avoid: ['internal', 'private', 'helper'],
  },
  {
    id: 'doorway',
    term: 'Doorway',
    topic: 'structure',
    explanation:
      'The one sanctioned way in to something otherwise off-limits. src/app/db is the doorway to Convex; ApplicationChrome and AppNotFound are the doorway to the shell.',
    where: 'src/app/db',
    avoid: ['wrapper', 'gateway'],
  },
  {
    id: 'seam',
    term: 'Seam',
    topic: 'structure',
    explanation:
      'A joint where one implementation can be swapped for another, and so the place tests attach. The live query wrapper is the seam between the app and Convex.',
    where: 'src/app/db/core/live.ts',
  },
  {
    id: 'widget',
    term: 'Widget',
    topic: 'structure',
    explanation:
      'A domain assembly two or more pages install whole, such as the faction editor. It renders what the page hands it and never fetches or routes.',
    where: 'src/app/widgets',
  },
  {
    id: 'picker',
    term: 'Picker',
    topic: 'structure',
    explanation:
      'A control that loads its own list of options, only when it opens and only to read. It is the one kind of component allowed to fetch.',
    where: 'src/app/pickers',
  },
  {
    id: 'shared-contract',
    term: 'Shared contract',
    topic: 'structure',
    code: '@shared/*',
    explanation:
      'A schema or rule the app, Convex and the Workers all read, such as the faction schema. It may not import the app.',
    where: 'src/shared',
  },
  {
    id: 'renderer',
    term: 'Renderer',
    topic: 'structure',
    code: 'src/game',
    explanation:
      'A component that draws a game artifact, such as a card or a token, exactly as it prints. Renderers import nothing from the app or Mantine, so the same code draws in the browser, in print and in a Worker.',
    where: 'src/game',
  },
  {
    id: 'tint',
    term: 'Tint',
    topic: 'board',
    explanation:
      'A coloured highlight over a set of territories. It has a see-through fill or an outline only, and can carry stickers. The Play table and Spice cards draw tints from the same data.',
    where: 'src/shared/boards/tints.ts',
    avoid: ['highlight', 'overlay'],
  },
  {
    id: 'sticker',
    term: 'Sticker',
    topic: 'board',
    code: 'TINT_STAMPS',
    explanation:
      "A small symbol a tint places on each of its territories, such as a sietch or Shai-Hulud. The code's older name is stamp; the panel and the game log say sticker.",
    where: 'src/shared/boards/tints.ts',
    avoid: ['stamp'],
  },
  {
    id: 'board-asset',
    term: 'Board',
    topic: 'board',
    explanation:
      'An authored round map, made of territories with a name, a type and their own decals. The classic board of Arrakis is one of them.',
    where: 'src/shared/boards/schema.ts',
  },
  {
    id: 'table',
    term: 'Table',
    topic: 'board',
    code: 'GameTable',
    explanation:
      'The shared 3D play surface of a hosted game, with the board in the middle and every piece the players move.',
    where: 'src/app/routes/_app/play/GameTable.tsx',
  },
  {
    id: 'seat',
    term: 'Seat',
    topic: 'board',
    explanation: 'A fixed place at a table that one player takes. Each seat sits at a station on the board rim.',
    where: 'src/shared/play/seatLimit.ts',
    avoid: ['slot', 'role'],
  },
  {
    id: 'spectator',
    term: 'Spectator',
    topic: 'board',
    explanation: 'Someone watching a game without a seat.',
    where: 'CONTEXT.md',
    avoid: ['observer', 'guest'],
  },
  {
    id: 'room',
    term: 'Room',
    topic: 'board',
    code: 'GameRoom',
    explanation: 'The game Worker object that holds one hosted game: its live table, its seats and its log.',
    where: 'workers/game/index.ts',
  },
  {
    id: 'stage',
    term: 'Stage',
    topic: 'board',
    explanation:
      'Where a hosted game is in its life: drafting, swapping, setup, play, finished or discarded. A phase is a step inside the play stage, never a stage.',
    where: 'src/shared/play/phases.ts',
    avoid: ['status', 'state', 'mode'],
  },
  {
    id: 'hidden-zone',
    term: 'Hidden zone',
    topic: 'board',
    explanation: "A faction's private patch of table beside its hand, which other players see only face down.",
    where: 'src/shared/play/hiddenZone.ts',
  },
  {
    id: 'game-log',
    term: 'Game log',
    topic: 'board',
    explanation: 'The public record of a game, one sentence per thing that happened.',
    where: 'src/shared/play/log.ts',
    avoid: ['event log', 'history feed'],
  },
  {
    id: 'publisher',
    term: 'Publisher',
    topic: 'assets',
    explanation:
      'The scheduled Worker that picks up publication jobs, screenshots each asset with its renderer in a browser, and stores the image.',
    where: 'workers/publisher',
  },
  {
    id: 'publication-job',
    term: 'Publication job',
    topic: 'assets',
    explanation: 'A short-lived request to draw one asset again, stored in Convex until the publisher takes it.',
    where: 'src/shared/asset-publishing/publication.ts',
    avoid: ['asset generation'],
  },
  {
    id: 'renderer-revision',
    term: 'Renderer revision',
    topic: 'assets',
    explanation:
      'A number per asset type. Raising it marks every published image of that type stale, and the next release queues them all to be drawn again.',
    where: 'src/shared/asset-publishing/renderer-revisions.ts',
    avoid: ['renderer version'],
  },
  {
    id: 'capture',
    term: 'Capture page',
    topic: 'assets',
    explanation: 'The bare page the publisher screenshots: one renderer, one asset, no chrome.',
    where: 'src/app/print/capture',
  },
  {
    id: 'published-image',
    term: 'PublishedImage',
    topic: 'assets',
    explanation:
      'How the app shows a published picture: a faint placeholder at its exact size, then the image developing out of a blur.',
    where: 'src/app/ui/content/PublishedImage.tsx',
  },
  {
    id: 'decal',
    term: 'Decal',
    topic: 'assets',
    explanation: 'A stock vector picture placed on a card or a territory, clipped to its shape.',
    where: 'src/game/assets/card/Decals.tsx',
  },
  {
    id: 'edition',
    term: 'Edition',
    topic: 'assets',
    explanation: 'A published, permanent version of a Rulebook, with its own HTML and PDF.',
    where: 'src/shared/rulebooks/editionArtifacts.ts',
  },
  {
    id: 'live-query',
    term: 'Live query',
    topic: 'data',
    code: 'useLiveQuery',
    explanation:
      'A Convex subscription a page holds while it is open, so what it shows updates by itself. A page holds at most one for its data.',
    where: 'src/app/db/core/live.ts',
  },
  {
    id: 'slug',
    term: 'Slug',
    topic: 'data',
    explanation:
      "The readable part of an address, made from a record's name. Two records with the same name get a short suffix.",
    where: 'src/shared/slugify.ts',
  },
  {
    id: 'former-address',
    term: 'Former address',
    topic: 'data',
    code: 'former_slugs',
    explanation: 'An old slug kept after a rename, so links to the old address still arrive.',
    where: 'src/app/db/formerAddresses.ts',
  },
  {
    id: 'migration',
    term: 'Widen, migrate, narrow',
    topic: 'data',
    explanation:
      'How a breaking schema change ships: accept both shapes, move the records, then drop the old shape once none is left.',
    where: 'docs/convex-migrations.md',
  },
  {
    id: 'snapshot',
    term: 'Snapshot',
    topic: 'data',
    explanation:
      'An anonymised copy of the published content, for running the app locally or rebuilding the dev database.',
    where: 'scripts/lib/snapshot-policy.ts',
  },
  {
    id: 'release-gate',
    term: 'Release gate',
    topic: 'data',
    code: 'release_gate',
    explanation:
      'The first job of every deploy. It asks production which commit it runs and skips the deploy when that commit is already live.',
    where: '.github/workflows/deploy-main.yml',
  },
];
