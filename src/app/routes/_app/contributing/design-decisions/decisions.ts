/**
 * The design decisions the contributing guide presents, each with what it gives the product and the code.
 * The canonical statements live in docs/technical/ui-design-decisions.md, AGENTS.md and the ADRs;
 * an entry here summarises one for a newcomer and links to it.
 */

export type DecisionGroup = 'components' | 'layout' | 'data' | 'look' | 'code';

/** How a decision is held: by a machine on every pull request, by a warning while developing, or by review. */
export type DecisionGuard = 'lint' | 'check' | 'test' | 'warning' | 'review';

export type DesignDecision = {
  /** Stable anchor on the page. */
  id: string;
  group: DecisionGroup;
  title: string;
  /** The rule itself, in one sentence. */
  rule: string;
  /** What a player or author gets from it. */
  product: string;
  /** What the codebase gets from it. */
  code: string;
  guard: DecisionGuard;
  /** The script, test or file that holds it; a review-held decision names none. */
  guardName?: string;
  /** Repository path, with an anchor, of the canonical statement. */
  source: string;
};

export const DECISION_GROUPS: readonly { id: DecisionGroup; label: string; summary: string }[] = [
  { id: 'components', label: 'Components', summary: 'What a component may do, and where it lives.' },
  { id: 'layout', label: 'Layout and spacing', summary: 'How a page takes its shape at every width.' },
  { id: 'data', label: 'Data', summary: 'How a page reads and holds what it shows.' },
  { id: 'look', label: 'Look and interaction', summary: 'How the interface says what things mean.' },
  { id: 'code', label: 'Code and tests', summary: 'How we write, test and explain the code.' },
];

const UI = 'docs/technical/ui-design-decisions.md';

export const DESIGN_DECISIONS: readonly DesignDecision[] = [
  {
    id: 'renders-what-it-is-given',
    group: 'components',
    title: 'A component renders what it is given',
    rule: 'Kit components never fetch data and never navigate; they take data and report what the reader did.',
    product: 'A screen behaves the same wherever its parts appear, so nothing changes under the reader unexpectedly.',
    code: "Every component works in a story and on a second page, and a screen's behaviour stays in its route.",
    guard: 'lint',
    guardName: '.oxlintrc.json',
    source: `${UI}#a-component-renders-what-it-is-given`,
  },
  {
    id: 'six-categories',
    group: 'components',
    title: 'Six categories, one home each',
    rule: 'Every kit component is Content, a Control, a List, a Layout, a Surface or a Block, decided by what its caller hands it.',
    product: 'The same idea looks the same on every page, because it is drawn by the same component.',
    code: 'There is one obvious place to look for a component and one obvious place to put a new one.',
    guard: 'check',
    guardName: 'bun run check:app-layout',
    source: `${UI}#six-categories-one-home-each`,
  },
  {
    id: 'surfaces-never-nest',
    group: 'components',
    title: 'Only Surfaces paint, and they never nest',
    rule: 'Only a Surface draws a pane, and a pane never sits inside another pane.',
    product: 'Pages stay calm and flat instead of boxes inside boxes, and the content keeps the room.',
    code: 'Padding and backgrounds have one owner, so they do not stack up when components combine.',
    guard: 'warning',
    guardName: 'Surface.tsx',
    source: 'AGENTS.md#component-taxonomy',
  },
  {
    id: 'widgets-last-resort',
    group: 'components',
    title: 'One page composes in its route; two pages earn a widget',
    rule: 'Composition that one page needs stays in its route file; only an assembly two pages install whole becomes a widget.',
    product: 'Each page can be shaped for its own job without compromising another.',
    code: 'No component exists for a single caller, so no file has to be read just to understand one page.',
    guard: 'review',
    source: `${UI}#widgets-are-the-last-resort`,
  },
  {
    id: 'pickers-fetch',
    group: 'components',
    title: 'Pickers are the one place a component may fetch',
    rule: 'A control that chooses from a large list loads its options itself, only once it opens, and only to read.',
    product: 'A page with a "pick a user" control does not load every user before anyone opens it.',
    code: 'The one exception to the fetch ban is named and bounded instead of leaking everywhere.',
    guard: 'review',
    source: `${UI}#pickers-are-the-one-place-a-component-may-fetch`,
  },
  {
    id: 'renderers-isolated',
    group: 'components',
    title: 'Renderers stay isolated',
    rule: 'Game renderers import nothing from the app, Mantine or Radix.',
    product: 'A card looks exactly the same on screen, in print and in its published image.',
    code: 'One renderer serves the browser, print and the Worker without dragging the app along.',
    guard: 'test',
    guardName: 'rendererIsolation.test.ts',
    source: `${UI}#renderers-stay-isolated`,
  },
  {
    id: 'spacing-scale',
    group: 'layout',
    title: 'Spacing comes from the scale',
    rule: 'Every gap is one of five steps, xs to xl, chosen by what it separates, and the steps shrink on smaller screens.',
    product: 'Panes beside each other agree, and the whole app tightens together on a phone.',
    code: 'Changing the rhythm of the app is one edit to the tokens, not a hunt through every stylesheet.',
    guard: 'review',
    source: `${UI}#spacing-comes-from-the-scale-and-the-scale-is-responsive`,
  },
  {
    id: 'breakpoints',
    group: 'layout',
    title: 'Breakpoints are one ladder',
    rule: 'Only 30, 48 and 62rem, and only the window frame asks the window; everything inside asks its container.',
    product: 'A component looks right whether it sits in a narrow rail or across the whole page.',
    code: 'There are three widths to test, and a component carries its own responsiveness wherever it goes.',
    guard: 'check',
    guardName: 'bun run check:breakpoints',
    source: `${UI}#breakpoints-are-one-ladder-and-only-the-window-asks-the-window`,
  },
  {
    id: 'layouts-own-spacing',
    group: 'layout',
    title: 'Layouts own spacing and lay out through named slots',
    rule: 'Space between things belongs to a Layout with named slots, never to the things themselves.',
    product: 'Pages line up, because their spacing comes from a few layouts rather than from each part.',
    code: 'A page reads top-down as its slots, instead of as nested stacks and grids.',
    guard: 'check',
    guardName: 'bun run check:breakpoints',
    source: `${UI}#layouts-own-spacing-and-lay-out-through-named-slots`,
  },
  {
    id: 'floating-ui',
    group: 'layout',
    title: 'Floating UI is small and single-layer',
    rule: 'Popovers and menus hold a few controls at most, and never open another floating pane.',
    product: 'Nothing clips off screen or stacks into a maze; a real editor opens in place.',
    code: 'Positioning bugs that come with nested floating panes cannot happen.',
    guard: 'review',
    source: `${UI}#floating-ui-is-small-and-single-layer`,
  },
  {
    id: 'terminal-routes',
    group: 'layout',
    title: 'Every page mounts PageLayout',
    rule: 'Each page renders PageLayout itself and fills the slots it needs; parent routes only pass through.',
    product: 'Every page has the same frame, title placement and landmarks.',
    code: "A page's whole composition is in one file, not split across router metadata and the shell.",
    guard: 'test',
    guardName: 'PageLayout.architecture.test.ts',
    source: `${UI}#terminal-routes-mount-pagelayout`,
  },
  {
    id: 'one-query',
    group: 'data',
    title: 'One Convex query per route',
    rule: 'A page subscribes to at most one query for its data, which hands it everything already shaped.',
    product: 'A page loads at once rather than in pieces, and costs the backend one subscription.',
    code: "A screen's data has one shape in one place, and loading states stay simple.",
    guard: 'review',
    source: `${UI}#one-convex-query-per-route`,
  },
  {
    id: 'local-reducer',
    group: 'data',
    title: 'State past one primitive is a local reducer',
    rule: 'A screen with several pieces of related state keeps them in one reducer with named events.',
    product: 'Reset and Load always undo everything, including the field added last.',
    code: 'What each transition does is written in one place instead of across loose setters.',
    guard: 'review',
    source: `${UI}#state-past-one-primitive-is-a-local-reducer`,
  },
  {
    id: 'variants-not-colours',
    group: 'look',
    title: 'Variants, not colours',
    rule: 'Components take a meaning such as positive or negative, and the theme decides the colour.',
    product: 'Colours mean the same thing everywhere, in light and dark.',
    code: 'A change of palette is one edit to the theme, and no call site names a hue.',
    guard: 'review',
    source: `${UI}#variants-not-colours`,
  },
  {
    id: 'one-primary',
    group: 'look',
    title: 'One primary per toolbar',
    rule: 'Each toolbar has one clear primary action, and an icon-only action always has a name.',
    product: 'The reader always knows the main thing to do next, and a screen reader can name every button.',
    code: 'The kit carries the choice, so pages do not argue about emphasis.',
    guard: 'review',
    source: `${UI}#one-primary-per-toolbar-and-an-icon-only-action-says-what-it-is`,
  },
  {
    id: 'held-delete',
    group: 'look',
    title: 'Destructive actions are held, not asked twice',
    rule: 'A delete fires only after its button is held for five seconds.',
    product: 'Nobody deletes something by clicking through a dialog on autopilot.',
    code: 'Every delete goes through one of three kit controls that share one hold.',
    guard: 'review',
    source: `${UI}#destructive-actions-are-held-not-asked-twice`,
  },
  {
    id: 'topic-icons',
    group: 'look',
    title: 'One icon per recurring topic',
    rule: 'A topic that appears in several places always wears the same icon, from TopicIcon.',
    product: 'Readers recognise a topic at a glance on every page.',
    code: 'The mapping lives in one file, so icons cannot drift apart.',
    guard: 'review',
    source: `${UI}#one-canonical-icon-per-recurring-topic`,
  },
  {
    id: 'published-image',
    group: 'look',
    title: 'A published image arrives through PublishedImage',
    rule: 'Every published picture loads through one component, with a placeholder at its exact size.',
    product: 'Pictures arrive smoothly, without jumps, and a missing image never looks like loading.',
    code: 'Loading, missing and reduced-motion behaviour are solved once.',
    guard: 'review',
    source: `${UI}#a-published-image-arrives-through-publishedimage`,
  },
  {
    id: 'one-owner-stylesheet',
    group: 'code',
    title: 'One owner per stylesheet',
    rule: 'Exactly one component imports each stylesheet, and nothing reaches into another component to restyle it.',
    product: 'A change to one part of the interface cannot break the look of another.',
    code: 'Every style can be found by searching for the component that owns it.',
    guard: 'check',
    guardName: 'bun run check:css-orphans',
    source: `${UI}#one-owner-per-stylesheet-no-composes`,
  },
  {
    id: 'contracts',
    group: 'code',
    title: 'Contracts over expressions',
    rule: 'Types derive from the server contract, and tests check behaviour through the same seam callers use.',
    product: 'Fewer bugs reach players, because the checks guard what users actually depend on.',
    code: 'Refactors do not break tests that were only checking how the code was written.',
    guard: 'review',
    source: 'docs/adr/0001-contracts-over-expressions.md',
  },
  {
    id: 'confidence-stack',
    group: 'code',
    title: 'The confidence stack',
    rule: 'Confidence comes from types first, tests at the seams second, and a few end-to-end runs on top.',
    product: 'Releases ship every merge without a manual test pass.',
    code: 'Most mistakes fail at compile time, where they are cheapest to fix.',
    guard: 'review',
    source: 'docs/adr/0002-confidence-stack.md',
  },
  {
    id: 'comments-earned',
    group: 'code',
    title: 'A comment has to earn its place',
    rule: 'A comment says what the code cannot, or prevents a mistake someone would realistically make.',
    product: 'Contributors spend their time on the product instead of on stale explanations.',
    code: 'Every comment that remains is worth reading and stays true.',
    guard: 'review',
    source: `${UI}#a-comment-is-a-claim-and-the-claim-has-to-be-earned`,
  },
];
