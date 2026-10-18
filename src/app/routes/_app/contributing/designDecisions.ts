/**
 * Summaries of design decisions for the contributing guide.
 * Each entry links to its source in AGENTS.md, the UI decisions or an ADR.
 */

export type DecisionGroup = 'components' | 'layout' | 'data' | 'look' | 'code';

/** How we enforce a decision. */
export type DecisionGuard = 'lint' | 'check' | 'test' | 'warning' | 'review';

export type DesignDecision = {
  /** Stable anchor on the page. */
  id: string;
  group: DecisionGroup;
  title: string;
  /** The rule contributors should follow. */
  rule: string;
  /** What a player or author gets from it. */
  product: string;
  /** What the codebase gets from it. */
  code: string;
  guard: DecisionGuard;
  /** The script, test or file that checks the rule. Omitted for review-only rules. */
  guardName?: string;
  /** Which part a check covers when the rest still needs review. */
  guardScope?: string;
  /** Repository path, with an anchor, of the canonical statement. */
  source: string;
};

export const DECISION_GROUPS: readonly { id: DecisionGroup; label: string; summary: string }[] = [
  { id: 'components', label: 'Components', summary: 'What a component may do, and where it lives.' },
  { id: 'layout', label: 'Layout and spacing', summary: 'How layouts adapt to the available width.' },
  { id: 'data', label: 'Data', summary: 'How pages query data and manage editing state.' },
  { id: 'look', label: 'Look and interaction', summary: 'How statuses and actions appear in the interface.' },
  { id: 'code', label: 'Code and tests', summary: 'How we write, test and explain the code.' },
];

const UI = 'docs/technical/ui-design-decisions.md';

export const DESIGN_DECISIONS: readonly DesignDecision[] = [
  {
    id: 'renders-what-it-is-given',
    group: 'components',
    title: 'A component renders what it is given',
    rule: 'Kit components receive data and report user actions through callbacks. They cannot fetch or navigate.',
    product: 'A reused control behaves consistently because the page supplies its data and handles its actions.',
    code: 'Components can render in Storybook without a backend or router. Fetching and navigation stay in the route.',
    guard: 'lint',
    guardName: '.oxlintrc.json',
    source: `${UI}#a-component-renders-what-it-is-given`,
  },
  {
    id: 'six-categories',
    group: 'components',
    title: 'Classify components by their props',
    rule: 'Every kit component belongs to one of six categories. The props its caller supplies determine the category.',
    product: 'Pages reuse the same components for the same jobs.',
    code: 'The category tells contributors where to find a component and where to add one.',
    guard: 'check',
    guardName: 'bun run check:app-layout',
    guardScope: 'The script checks the top-level folders. Component categories are checked in review.',
    source: `${UI}#six-categories-one-home-each`,
  },
  {
    id: 'surfaces-never-nest',
    group: 'components',
    title: 'Surfaces own pane backgrounds and borders',
    rule: 'Only a Surface draws a pane. Surfaces cannot contain other Surfaces.',
    product: 'Content has more space because nested borders and pane padding do not accumulate.',
    code: 'One component owns each pane background and border.',
    guard: 'warning',
    guardName: 'Surface.tsx',
    source: 'AGENTS.md#component-taxonomy',
  },
  {
    id: 'widgets-last-resort',
    group: 'components',
    title: 'Page composition stays in the route',
    rule: 'Keep composition used by one page in its route file. Extract a widget when at least two pages need the same assembly. Large widgets may also split into child widgets.',
    product: 'Changing one page does not force changes on an unrelated page.',
    code: "Contributors can read a page's composition in its route. Shared widgets exist where callers need them.",
    guard: 'review',
    source: `${UI}#widgets-are-the-last-resort`,
  },
  {
    id: 'pickers-fetch',
    group: 'components',
    title: 'Pickers load their own options',
    rule: "A Picker loads its own options when opened. It may read, but cannot mutate or load the page's data.",
    product: 'A user picker loads users when someone opens it, rather than on every page visit.',
    code: 'Option loading has a defined home and ends when the options close.',
    guard: 'review',
    source: `${UI}#pickers-are-the-one-place-a-component-may-fetch`,
  },
  {
    id: 'renderers-isolated',
    group: 'components',
    title: 'Renderers stay isolated',
    rule: 'Game renderers cannot import the application, Mantine or Radix.',
    product: 'The screen, print output and published image use the same drawing.',
    code: 'The app and publisher browser can use a renderer without loading application UI dependencies.',
    guard: 'test',
    guardName: 'rendererIsolation.test.ts',
    source: `${UI}#renderers-stay-isolated`,
  },
  {
    id: 'spacing-scale',
    group: 'layout',
    title: 'Spacing comes from the scale',
    rule: 'Use the five spacing steps, xs through xl. Choose a step by what the gap separates. The theme reduces these steps on smaller screens.',
    product: 'Gaps shrink together on a phone, and neighbouring panes use consistent spacing.',
    code: 'Changing a spacing token updates every component that uses it.',
    guard: 'review',
    source: `${UI}#spacing-comes-from-the-scale-and-the-scale-is-responsive`,
  },
  {
    id: 'breakpoints',
    group: 'layout',
    title: 'Use the shared breakpoints',
    rule: 'Use 30, 48 and 62rem for width breakpoints. PageLayout and the window chrome respond to the viewport. Other layouts respond to their containers.',
    product: 'A layout adapts to the space it has, including inside a narrow column on a wide screen.',
    code: 'The shared breakpoints limit the widths contributors need to check. Container queries keep a layout responsive wherever it appears.',
    guard: 'check',
    guardName: 'bun run check:breakpoints',
    guardScope: 'The script checks width media queries. Container queries and documented exceptions need review.',
    source: `${UI}#breakpoints-are-one-ladder-and-only-the-window-asks-the-window`,
  },
  {
    id: 'layouts-own-spacing',
    group: 'layout',
    title: 'Layouts position named slots',
    rule: 'Layouts own the spacing between their named slots. Content components do not add page margins or padding.',
    product: 'Pages align because their layouts control the gaps.',
    code: 'Named slots show where content goes. Individual components do not need to know their position on a page.',
    guard: 'check',
    guardName: 'bun run check:breakpoints',
    guardScope: 'The script checks width media queries. Slot structure and spacing ownership need review.',
    source: `${UI}#layouts-own-spacing-and-lay-out-through-named-slots`,
  },
  {
    id: 'floating-ui',
    group: 'layout',
    title: 'Floating UI is small and single-layer',
    rule: 'Keep popovers and menus small. A floating pane cannot open another floating pane. Complex editors expand inline.',
    product: 'Editors remain in the page instead of stacking menus and popovers over one another.',
    code: 'A single floating layer avoids the positioning and focus problems caused by nested popovers.',
    guard: 'review',
    source: `${UI}#floating-ui-is-small-and-single-layer`,
  },
  {
    id: 'terminal-routes',
    group: 'layout',
    title: 'Every page mounts PageLayout',
    rule: 'Each page renders PageLayout and fills its own slots. Parent routes pass their children through.',
    product: 'Pages share title placement and accessible landmarks.',
    code: 'The route contains the page composition, so contributors can inspect it in one place.',
    guard: 'test',
    guardName: 'PageLayout.architecture.test.ts',
    source: `${UI}#terminal-routes-mount-pagelayout`,
  },
  {
    id: 'one-query',
    group: 'data',
    title: 'One query for page data',
    rule: 'A page uses at most one Convex query for its page data. Private profile, session and access queries stay separate.',
    product:
      'The page receives its content together. Visitors with the same arguments can share a public query result.',
    code: 'One query defines the page data shape. Keeping viewer identity out of it allows Convex to reuse the public result.',
    guard: 'review',
    source: `${UI}#one-convex-query-per-route`,
  },
  {
    id: 'local-reducer',
    group: 'data',
    title: 'Related state uses a local reducer',
    rule: 'Keep several related state values in one local reducer with named events.',
    product: 'Reset and Load update the whole draft, including fields added later.',
    code: 'Each event describes a complete state transition in one place.',
    guard: 'review',
    source: `${UI}#state-past-one-primitive-is-a-local-reducer`,
  },
  {
    id: 'variants-not-colours',
    group: 'look',
    title: 'Choose meaning through variants',
    rule: 'Pass a meaning such as positive or negative. Let the theme choose its colour.',
    product: 'A status keeps the same meaning across pages and in light and dark themes.',
    code: 'A palette change belongs in the theme. Callers keep their existing status values.',
    guard: 'review',
    source: `${UI}#variants-not-colours`,
  },
  {
    id: 'one-primary',
    group: 'look',
    title: 'One primary per toolbar',
    rule: 'Give each toolbar one primary action. Give every icon-only action an accessible name.',
    product: 'The main action has consistent emphasis, and screen readers can name every button.',
    code: 'Shared controls handle emphasis and labelling conventions.',
    guard: 'review',
    source: `${UI}#one-primary-per-toolbar-and-an-icon-only-action-says-what-it-is`,
  },
  {
    id: 'held-delete',
    group: 'look',
    title: 'Hold to delete',
    rule: 'A delete button fires after a five-second hold.',
    product: 'An accidental click cannot delete a record.',
    code: 'The three delete controls share the same hold behaviour.',
    guard: 'review',
    source: `${UI}#destructive-actions-are-held-not-asked-twice`,
  },
  {
    id: 'topic-icons',
    group: 'look',
    title: 'One icon per recurring topic',
    rule: 'Use TopicIcon for recurring topics so each topic has the same icon everywhere.',
    product: 'Readers can recognise a familiar topic by its icon.',
    code: 'One mapping defines the icons used throughout the app.',
    guard: 'review',
    source: `${UI}#one-canonical-icon-per-recurring-topic`,
  },
  {
    id: 'published-image',
    group: 'look',
    title: 'Use PublishedImage for published pictures',
    rule: 'Load published pictures through PublishedImage, which reserves their space with a placeholder.',
    product: 'Images load without moving surrounding content. Missing images have a distinct state.',
    code: 'One component handles loading, missing images and reduced motion.',
    guard: 'review',
    source: `${UI}#a-published-image-arrives-through-publishedimage`,
  },
  {
    id: 'one-owner-stylesheet',
    group: 'code',
    title: 'One owner per stylesheet',
    rule: 'Each stylesheet has one importing component. Components cannot reach into another component to override its styles.',
    product: 'A style change stays within the component that owns it.',
    code: 'The importing component identifies who owns each stylesheet.',
    guard: 'check',
    guardName: 'bun run check:css-orphans',
    source: `${UI}#one-owner-per-stylesheet-no-composes`,
  },
  {
    id: 'contracts',
    group: 'code',
    title: 'Test behaviour through contracts',
    rule: 'Derive types from the server contract. Test behaviour through the same seam callers use.',
    product: 'Tests check outcomes players depend on, such as whether another user can edit a record.',
    code: 'Tests continue to pass when an implementation changes but its behaviour stays the same.',
    guard: 'review',
    source: 'docs/adr/0001-contracts-over-expressions.md',
  },
  {
    id: 'confidence-stack',
    group: 'code',
    title: 'Types, seam tests and end-to-end checks',
    rule: 'Use types to catch incompatible values, seam tests to check behaviour, and a small set of end-to-end checks to verify the assembled system.',
    product: 'Automated checks support a release on every merge.',
    code: 'Each kind of check covers a specific failure. Use the smallest check that can catch the mistake.',
    guard: 'review',
    source: 'docs/adr/0002-confidence-stack.md',
  },
  {
    id: 'comments-earned',
    group: 'code',
    title: 'Comments explain what the code cannot',
    rule: 'Write a comment when it explains a constraint or prevents a plausible mistake. Omit comments that restate the code.',
    product: 'Contributors spend less time sorting useful explanations from repetition.',
    code: 'Fewer redundant comments means fewer explanations to update when code changes.',
    guard: 'review',
    source: `${UI}#a-comment-is-a-claim-and-the-claim-has-to-be-earned`,
  },
];
