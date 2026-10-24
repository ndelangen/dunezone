import { compareCodeUnits } from '@shared/compareText';
import { rulebookLocalIdAlphabet } from '@shared/rulebooks/contents';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import type { StorybookDatabase } from '@db/storybook';

import { withRulebooks } from './rulebooks.stories.fixture';

export function withUnpublishedRulebook(baseline: StorybookDatabase) {
  withRulebooks(baseline);
  const draft = baseline.rulebook_drafts[0];
  if (!draft) {
    throw new Error('Rulebook editor Story needs a saved draft');
  }
  const contents = structuredClone(draft.contents);
  contents.pagesById[contents.pageOrder[0]].title = 'Saved movement revision';
  draft.contents = contents;
  draft.revision = 2;
  return baseline;
}

/* Thirty Pages, the size this editor exists to author, so keystroke cost can be measured against Page count. */
export function withThirtyPages(baseline: StorybookDatabase) {
  withUnpublishedRulebook(baseline);
  const draft = baseline.rulebook_drafts[0];
  const rule = draft?.contents.pagesById.RULE;
  if (!draft || !rule) {
    throw new Error('Thirty-Page Story needs the Movement Page');
  }
  const contents = structuredClone(draft.contents);
  for (let index = 0; index < 27; index += 1) {
    const id = `PG${rulebookLocalIdAlphabet[index]}Z`;
    contents.pagesById[id] = {
      ...structuredClone(rule),
      id,
      anchor: `movement-${index + 1}`,
      title: `Movement ${index + 1}`,
    };
    contents.pageOrder.push(id);
  }
  draft.contents = contents;
  return baseline;
}

/*
 * Records which Page each ResizeObserver is pointed at, from the moment it is installed.
 * #981 named the cost this measures: a keystroke used to tear down and recreate an observer over every Region and Block of every Page.
 * Only observers built after the call are recorded, so a Story installs it once the editor is up and then counts the Pages one keystroke re-measures.
 */
function recordMeasuredPages(view: Window & typeof globalThis) {
  const observed = new Set<string>();
  const OriginalResizeObserver = view.ResizeObserver;
  /* The editor falls back to a window resize listener without one, which observes no Page and would leave this recorder silently empty. */
  if (!OriginalResizeObserver) {
    throw new Error('Measurement recording Story needs ResizeObserver');
  }
  class RecordingResizeObserver extends OriginalResizeObserver {
    override observe(target: Element, options?: ResizeObserverOptions) {
      const pageId = target.closest<HTMLElement>('[data-rulebook-page-id]')?.dataset.rulebookPageId;
      if (pageId) {
        observed.add(pageId);
      }
      super.observe(target, options);
    }
  }
  view.ResizeObserver = RecordingResizeObserver;
  return { observed, restore: () => (view.ResizeObserver = OriginalResizeObserver) };
}

/* Every Page is measured in its own hidden copy, and the open Page is drawn once more as the visible preview. */
export function renderedPageCount(canvasElement: HTMLElement) {
  return canvasElement.ownerDocument.querySelectorAll('[data-rulebook-page-id]').length;
}

export type EditorArrival = {
  canvasElement: HTMLElement;
  pathname: string | null;
  waitingFor: string | null;
  oldQueryHeld: boolean;
  earlyRename: boolean;
  oldWorkspaceRetired: boolean;
  releaseOldQuery: () => void;
  observe: (pathname: string) => void;
};

export const renamedEditorPath = '/rulesets/classicrules/rulebooks/battle-reference/edit';

export function loadEditorArrival({ canvasElement }: { canvasElement: HTMLElement }) {
  const arrival: EditorArrival = {
    canvasElement,
    pathname: null,
    waitingFor: null,
    oldQueryHeld: false,
    earlyRename: false,
    oldWorkspaceRetired: false,
    releaseOldQuery: () => {},
    observe: (pathname) => {
      arrival.pathname = pathname;
    },
  };
  return { editorArrival: arrival };
}

async function waitForEditorArrival(arrival: EditorArrival) {
  arrival.waitingFor = renamedEditorPath;
  await waitFor(() => expect(arrival.pathname).toBe(renamedEditorPath));
}

export async function renameRulebook(canvasElement: HTMLElement, arrival: EditorArrival) {
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('button', { name: 'Rename Rulebook' }, { timeout: 30_000 }));
  const form = page.getByRole('form', { name: 'Rename Rulebook' });
  await userEvent.clear(within(form).getByRole('textbox', { name: 'Rulebook name' }));
  await userEvent.type(within(form).getByRole('textbox', { name: 'Rulebook name' }), 'Battle reference');
  await expect(page.getByText(/bookmarks or shared links to the old one stop/)).toBeVisible();
  await userEvent.click(within(form).getByRole('button', { name: 'Rename Rulebook' }));
  await waitFor(() => expect(page.queryByRole('textbox', { name: 'Rulebook name' })).toBeNull());
  /* The old toolbar still answers this name until its slug's subscription refuses it.
   * Wait for the new address before reopening the form, then read back the saved name.
   */
  await waitForEditorArrival(arrival);
  const rename = await page.findByRole('button', { name: 'Rename Rulebook' }, { timeout: 30_000 });
  await waitFor(() => expect(rename).not.toHaveAttribute('aria-disabled'), { timeout: 30_000 });
  await userEvent.click(rename);
  await expect(page.findByRole('textbox', { name: 'Rulebook name' })).resolves.toHaveValue('Battle reference');
  /* The form's submit shares the name, and the toolbar's toggle comes first. */
  await userEvent.click(page.getAllByRole('button', { name: 'Rename Rulebook' })[0]!);
  await waitFor(() => expect(page.queryByRole('textbox', { name: 'Rulebook name' })).toBeNull());
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  const title = page.getByRole('textbox', { name: 'Title' });
  await userEvent.type(title, ' revised');
  await expect(page.getByRole('button', { name: 'Rename Rulebook' })).toHaveAttribute('aria-disabled', 'true');
}

export async function checkTitleMeasurements(canvasElement: HTMLElement, expectedPages: string[]) {
  const page = within(canvasElement.ownerDocument.body);
  const view = canvasElement.ownerDocument.defaultView;
  if (!view) {
    throw new Error('Thirty-Page Story needs a browser Window');
  }
  const title = await page.findByRole('textbox', { name: 'Title' }, { timeout: 30_000 });
  await waitFor(() => expect(renderedPageCount(canvasElement)).toBe(31), { timeout: 30_000 });

  const measured = recordMeasuredPages(view);
  try {
    await userEvent.type(title, 'x');
    /* One keystroke re-measures the edited Page and any Page that displays a reference to its title.
     * Retrying the whole set rather than waiting for it to be non-empty first means an observer that never arrives reports the Pages it measured, not a count of nothing. */
    await waitFor(() => expect([...measured.observed].sort(compareCodeUnits)).toEqual(expectedPages), {
      timeout: 30_000,
    });
    await expect(renderedPageCount(canvasElement)).toBe(31);
  } finally {
    measured.restore();
  }
}
