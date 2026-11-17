/*
 * What the creator tutorials read off the practice copy's pages to see a task done, shared so each chapter reads only as its tasks.
 * The faction editor is the same on the creator and on a variant's edit page, so its fields and tabs are found the same way on both.
 */

/** Where the practice copy of the site is, for the tasks that move between its pages. */
export type PracticePage = Readonly<{ pathname: () => string }>;

const TABS = '[role="tablist"][aria-label="Faction editor sections"]';

/** A field of the creator, and the tab it sits on when it is not on the first. */
export type Field = Readonly<{ selector: string; tab?: string }>;

export const find = (field: Field) => document.querySelector(field.selector);

/** The creator's tab that holds the field. Its words start with the label: a count of the section's warnings may follow. */
export const tabOf = (field: Field): Element | null =>
  (field.tab &&
    [...document.querySelectorAll(`${TABS} [role="tab"]`)].find((tab) =>
      tab.textContent?.trim().startsWith(field.tab!)
    )) ||
  null;

/* In a narrow editor the tabs give way to a section picker, which is where the learner changes section then. */
const SECTION_PICKER = '[data-connected-tabs-mobile-picker] [aria-label="Faction editor sections"]';

const shown = (element: Element | null) => element !== null && element.getBoundingClientRect().width > 0;

/** What the learner uses to open the field's tab: the tab itself, or the section picker while the tabs are hidden. */
export const tabControl = (field: Field): Element | null => {
  const tab = tabOf(field);
  return tab && !shown(tab) ? (document.querySelector(SECTION_PICKER) ?? tab) : tab;
};

/** The field when its tab is open, otherwise the tab that opens it. */
export const fieldOrTab = (field: Field) => () => find(field) ?? tabControl(field);

export const valueOf = (element: Element | null): string | null => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return element.value;
  }
  return element === null ? null : (element.textContent ?? '');
};

/** A button of the page whose words or label are exactly `name`. */
export const pageButton = (name: string) => (): Element | null =>
  [...document.querySelectorAll('[data-tutorial-pages] button, [data-tutorial-pages] a')].find(
    (button) => button.getAttribute('aria-label') === name || button.textContent?.trim() === name
  ) ?? null;

/*
 * A text task counts any change the learner makes, once they pause (Norbert, 2026-11-02): two seconds after the last
 * keystroke in a one-line box, four in a text box, where they may still be thinking, or as soon as they leave it.
 * Leaving the box as it was, or emptying it, does not count. The task remembers the last text it saw, as opening
 * another tab takes the box away.
 */
const ONE_LINE_PAUSE = 2000;
const TEXT_PAUSE = 4000;

/* `first` is null until the box is on screen: a box on a tab not yet open has no starting text to compare with. */
type Typed = { first: string | null; last: string; changedAt: number; area: boolean };

/* Records what the box shows now, restarting the pause when it changed. */
function track(watch: Typed, box: Element | null): string {
  const text = valueOf(box);
  if (text === null) {
    return watch.last;
  }
  watch.first ??= text;
  if (text !== watch.last) {
    watch.last = text;
    watch.changedAt = Date.now();
  }
  watch.area ||= box instanceof HTMLTextAreaElement;
  return text;
}

export const typed = (field: Field) => ({
  anchor: { kind: 'page' as const, element: fieldOrTab(field) },
  begin: (): Typed => {
    const first = valueOf(find(field));
    return { first, last: first ?? '', changedAt: Date.now(), area: false };
  },
  done: (watch: Typed) => {
    const box = find(field);
    const text = track(watch, box).trim();
    const changed = text.length > 0 && watch.first !== null && text !== watch.first.trim();
    const paused = Date.now() - watch.changedAt >= (watch.area ? TEXT_PAUSE : ONE_LINE_PAUSE);
    const left = box === null || document.activeElement !== box;
    return changed && (paused || left);
  },
});
