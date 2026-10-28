# ADR-0005: A story shows only the states its own component owns

**Status:** Accepted (2026-10-27)

## Context

Every kit component has stories, and so do the widgets, the Play windows, the shell, every page and
every Rulebook block editor. Each level is covered, yet the levels keep showing each other's states
again. A page story hovers three toolbar actions to read their tooltips and watch them close. Another
holds Publish for five real seconds to prove that a hold-to-confirm action waits for the hold, which
`useHoldToConfirm` already proves. A toolbar capture shows its Save tooltip open and its status list
unfolded. A Play story about one window's content renders the whole table to reach it.

Each repeat costs something. Chromatic bills the capture (ADR-0004). The story shard spends seconds on
it. The play breaks when a kit component changes its timing or its fade, though the composed
component did not change. And a reviewer cannot tell what a story is about when it shows three things
at once.

Norbert named the rule behind all of this on 27 Oct 2026: "We do not need to show button's active
states, because buttons are their own component, and their states are already covered in THEIR
stories." And about a story of the Alliances window: "do not mix signals in stories, when a story is
about Offering, do not show an extended offer from another player." The first remark is about
ownership and the second about focus. ADR-0004 decided what kind a story is. This record decides what
a story is about.

## Decision

### Every state has one owner

A component owns a state when its own code decides it, from the props across its membrane, its own
local state or its own derivation. The owner of a state is the lowest component with stories whose
code decides it. A story shows and tests the states its own component owns, and no others.

The component under story owns:

- what it renders from its data: which children appear, in what arrangement, with which words, and
  its own empty, overflow, narrow and wide forms;
- which actions it offers, hides or turns off, and the reason it gives;
- what its callbacks report and when, which is the intent that leaves through its membrane;
- its own local interaction state, such as the chapter it has open or a draft only it keeps.

A child it composes owns:

- how the child looks and behaves in any state the child decides: hover, focus, pressed, active,
  checked, disabled, loading, pending and error;
- the mechanics of floating layers: a tooltip opening on hover and fading in, a popover or menu
  opening and closing, Escape or an outside click closing it, arrow keys moving through a menu or
  listbox;
- timed and gestured mechanics: a hold-to-confirm countdown and its short-press no-op, a sortable
  list's drag threshold and reorder animation, `PublishedImage`'s arrival and missing states;
- its own transitions and its reduced-motion form.

Every story answers one question: **if this story were deleted, whose regression would go
unnoticed?** When the only answer is a child's, the story belongs to the child and moves there.

### Deciding a child's state is owned; the state itself is not

A composed component often decides a child's state. The Shared table inventory turns "Draw random
tech token" off once the inventory is empty, and says why. The decision and its reason belong to the
inventory. How a disabled button looks, and how its reason opens on hover, belong to the button. So:

- the inventory's testing story asserts the decision through the child's contract, with
  `toBeDisabled()` and `toHaveAccessibleDescription(reason)`;
- the inventory gets a visual story for its empty state only when the inventory itself renders
  something different there, such as an empty message. A capture whose only difference from the
  baseline is a child in another state repeats the child's story.

Words belong to the component that writes them, wherever they render. The kit publishes a tooltip's
words as the control's accessible name or description, as `IconAction` does with its disabled reason
and `HelpMark` with its text, so a caller can assert its words without opening the tooltip. A kit
tooltip that does not publish its words yet gains that before the stories that depend on it move.

### Floating content: the opening is the camera, not the subject

Sometimes a component's own content lives inside a child's floating layer: the links `SiteNavigation`
moves into its overflow menu, or the Battle plan's Adjust popover. A story may open that layer to show
the content. The content is the subject, and the opening only points the camera at it. The story
asserts the content and never the layer's opening, closing or focus handling.

Giving that content a component of its own, with its own stories, is still the better fix, because
then the composed story never opens anything. The open-layer story is the fallback for content that
has no other home.

### Route-local composition is owned by the route

A composition that one page uses lives in its route as local functions, without stories of its own
(AGENTS.md: one page, route). Its states belong to the route, and the page stories own them. That is
not repetition.

When a piece leaves the route and becomes a widget, a Picker or a Play panel, its states and their
stories move with it in the same pull request. The page keeps only the wiring. The Play panels'
overhaul (#2579) is this move for the Play windows.

### One signal per story

A visual story changes one thing from its component's baseline story and shows nothing else that
varies. The baseline is the component's ordinary state: `Default`, or for a panel its ordinary
mid-game moment. Every other visual story is that baseline plus one named change.

The name is the signal, so a name that needs "and" is two stories. A story about Offering shows the
viewer's own outstanding offer and no incoming one. The incoming offer from another player is a story
of its own.

One signal is:

- one owned state, such as Offering, Allied, Finished or Observer;
- one capability along one axis, such as a width ladder, or a comparison matrix whose purpose is the
  side-by-side view (ADR-0004's comparative catalogues);
- one data shape the component handles differently, such as an overlong name or an empty list.

A testing story proves one behaviour, so a failure names the behaviour that broke. A testing story
whose subject is a sequence, such as a game walkthrough, a tutorial chapter or a journey, has one
behaviour: the sequence. It asserts that the steps advance and leaves each step's details to the
stories that own them.

### Mechanics are tested at the owner, wiring above it

Interaction is covered once, at the lowest level that owns it. The kit's testing stories, and hook
tests such as `useHoldToConfirm.test.tsx`, prove the mechanics: hover, focus, keyboard, hold, latch,
Escape and drag. Every level above proves only its wiring:

- **data in:** the right data reaches the child, asserted through the child's accessible contract
  (role, name, value, description, checked, disabled), never by hovering or opening it;
- **intents out:** activating the child with its simplest gesture calls the right callback, or on a
  page sends the right command or mutation, asserted on the spy or on the resulting data;
- **decisions:** a state of the composed component changes the child's props as it should, whether
  that turns it on or off, hides it or names it.

A page story also owns what only a page has: the server round trip, access gates, refusals, an
unreachable server and navigation. At page level, a hold-to-confirm action proves that a completed
hold sends its mutation. It does not prove that a short press sends nothing, read the "hold to"
tooltip or watch the countdown.

### Fixtures follow the data and set only the membrane

- A story sets only the props across its own component's membrane. It never forces a child's state:
  no `defaultOpened` on a child's popover, no hovered or pressed flag, no `pending` that reaches past
  the component into a child.
- Each component keeps one baseline fixture and builds each variant as the baseline plus one change,
  named for the signal, such as `offeringSnapshot()`. One signal per story is then visible in the
  fixture itself.
- A composed component's fixture derives its children's props from the same source data, through the
  same mapping the product uses. The Play panels build theirs from a table snapshot with `tableOf` and
  the panel hook's pure mapping, so a parent's story and a child's story cannot show the same data two
  ways.
- Page fixtures stay production-copied (docs/README.md, *Page stories*).

### Coverage stays complete without repeats

Every state has one owner, and every owner covers its states, so each state is shown once and tested
once.

| Level | Visual stories capture | Testing stories prove |
|---|---|---|
| Kit | how each owned state looks: rest, hover, focus, disabled, pending, error | the mechanics: hover, keyboard, hold, latch, Escape, drag |
| Widget, Picker, Play panel, shell | the arrangement and owned content, one signal each | wiring: data in, intents out, decisions |
| Page | the page's own states: gates, loading, refusal, unreachable, widths | the server round trip, navigation, and route-local composition |
| Journey, tutorial | the moment a reader meets | that the sequence advances |

Taking a story off a composed level is a move, not a deletion. Before it goes, the child's stories
must cover the state; when they do not, the story moves down to the child first. As in ADR-0004,
moving never loses a check. A child the app uses that has no stories of its own, such as Mantine's
`Button` used directly, gets its kit story before the composed stories drop the state.

### Enforcement

- **A lint rule for the mechanical part.** `local/story-owns-its-states`, in
  `scripts/oxlint-local-plugin.ts`, rejects `userEvent.hover`, `userEvent.unhover` and any
  `ByRole('tooltip')` query in a story file outside `src/app/ui`. The story files that predate the
  rule sit in that override's `excludeFiles` in `.oxlintrc.json`. Each one leaves the list in the pull
  request that cleans it up, and no file joins it. A story whose subject needs a tooltip open as its
  precondition, such as Escape closing a review while the opening button's tooltip still shows, keeps
  that one query behind a disable comment that says so.
- **Review for the judgment part.** No lint rule can tell one signal from two, or tell a composed
  capture whose only difference is a child's state. Code review checks both against this record. A
  story's doc comment names its one signal, so the reviewer compares the comment with the canvas.
- **More rules once their offenders are clean.** Candidates are hold gestures (`[MouseLeft>]` held on a
  hold-to-confirm action, `[Space>]`) outside the kit; Escape or arrow keys in a menu, listbox or
  popover outside the kit; and a visual story outside the kit whose play opens a floating layer.

## Consequences

- An audit on 27 Oct 2026 read all 1,243 stories. Outside the kit it found 18 stories in 12 files that
  hover or read a tooltip, about a dozen that drive a hold-to-confirm action's own mechanics, 20
  candidates that drive Escape or arrow keys inside a kit menu or listbox, about 124 Play page stories
  that show one window's content (which #2579 is moving to panel stories), a handful of composed
  captures of a child's open or pending state, and several stories that mix two signals. Most of the
  kit is clean already, because each kit component is the owner of what it shows.
- Chromatic captures fall as composed captures of child states go, and the story shards get faster as
  page stories stop waiting on real hold timers and tooltip fades.
- A kit change to timing, focus or a fade breaks one story, the kit's, rather than every page that
  happened to hover.
- Kit tooltips publish their words as accessible descriptions. `HelpMark` and `IconAction` already do,
  so the composed stories that use them can move today.
- New Play panel stories follow this from the start: args-only panel stories, one signal each, and
  page stories reduced to the round trip per window.

## Considered options

- Keeping composed re-tests as integration coverage. Rejected: they cover the kit's mechanics a second
  time rather than the integration. The integration is the wiring, which a composed story proves
  through the child's accessible contract without driving the child.
- A source scan in `scripts/` that counts offenders per file. Rejected for a lint rule, which ADR-0001
  prefers wherever a rule can express the guarantee.
- Per-line disable comments in the existing offenders. Rejected: they touch a dozen story files that
  other branches are rewriting, while the exclusion list sits in one place and visibly shrinks.
