/* The Rulebook editor around its Pages: deep links, renaming, the clipping warnings, publishing, a stale draft and lost access (#1590). */
import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { rulebookContentsV1Schema, rulebookLocalIdAlphabet } from '@shared/rulebooks/contents';
import { createRulebookStarterContents } from '@shared/rulebooks/fixtures';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, useStorybookDatabaseClient } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';
import { parseClientBoundary } from '@app/db/core/clientBoundary';

import { StorybookPage } from '../../storybook';
import { Route as RulebookEditorRoute } from './$rulesetSlug/rulebooks/$rulebookSlug/edit/route';
import { rulebooksMeta, withRulebooks } from './rulebooks.stories.fixture';

const meta = preview.meta({
  ...rulebooksMeta,
  title: 'Rulesets/Rulebooks/Editor',
});

function withUnpublishedRulebook(baseline: StorybookDatabase) {
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

function withClippedRulebook(baseline: StorybookDatabase) {
  withUnpublishedRulebook(baseline);
  const draft = baseline.rulebook_drafts[0];
  const block = draft?.contents.pagesById.CHAP?.blocksById.HERA;
  if (!draft || block?.kind !== 'referenced-illustration') {
    throw new Error('Rulebook clipping Story needs its opening illustration');
  }
  /* A single-column region is the whole Page, so the caption has to outgrow a Page rather than a chapter band. */
  block.caption = 'The rule continues below the fixed Page. '.repeat(320).trim();
  return baseline;
}

function withRepeatedClippedRulebook(baseline: StorybookDatabase) {
  withClippedRulebook(baseline);
  const draft = baseline.rulebook_drafts[0];
  const page = draft?.contents.pagesById.CHAP;
  const block = page?.blocksById.HERA;
  if (!page || block?.kind !== 'referenced-illustration') {
    throw new Error('Repeated clipping Story needs its opening illustration');
  }
  page.blocksById.HERB = {
    ...structuredClone(block),
    id: 'HERB',
    caption: 'A second clipped illustration.',
  };
  page.blockOrderByRegion.content?.push('HERB');
  return baseline;
}

/* Thirty Pages, the size this editor exists to author, so keystroke cost can be measured against Page count. */
function withThirtyPages(baseline: StorybookDatabase) {
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
function renderedPageCount(canvasElement: HTMLElement) {
  return canvasElement.ownerDocument.querySelectorAll('[data-rulebook-page-id]').length;
}

export const Rename = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Rename Rulebook' }, { timeout: 30_000 }));
    const form = page.getByRole('form', { name: 'Rename Rulebook' });
    await userEvent.clear(within(form).getByRole('textbox', { name: 'Rulebook name' }));
    await userEvent.type(within(form).getByRole('textbox', { name: 'Rulebook name' }), 'Battle reference');
    expect(page.getByText(/bookmarks or shared links to the old one stop/)).toBeVisible();
    await userEvent.click(within(form).getByRole('button', { name: 'Rename Rulebook' }));
    await waitFor(() => expect(page.queryByRole('textbox', { name: 'Rulebook name' })).toBeNull());
    /* The toolbar carries no name any more, so the new one is read back from the form it was set in. */
    /* A rename re-slugs, so the editor remounts at its new address before the action is back, and it stays unavailable until the draft settles. */
    const rename = await page.findByRole('button', { name: 'Rename Rulebook' }, { timeout: 30_000 });
    await waitFor(() => expect(rename).not.toHaveAttribute('aria-disabled'), { timeout: 30_000 });
    await userEvent.click(rename);
    await expect(page.findByRole('textbox', { name: 'Rulebook name' })).resolves.toHaveValue('Battle reference');
    /* The form's submit shares the name, and the toolbar's toggle comes first. */
    await userEvent.click(page.getAllByRole('button', { name: 'Rename Rulebook' })[0]!);
    await waitFor(() => expect(page.queryByRole('textbox', { name: 'Rulebook name' })).toBeNull());
    expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    const title = page.getByRole('textbox', { name: 'Title' });
    await userEvent.type(title, ' revised');
    expect(page.getByRole('button', { name: 'Rename Rulebook' })).toHaveAttribute('aria-disabled', 'true');
  },
});

export const RenameForm = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Rename Rulebook' }, { timeout: 30_000 }));
    expect(page.getByRole('textbox', { name: 'Rulebook name' })).toBeVisible();
  },
});

export const MemberEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  parameters: {
    identity: { subjectKey: 'member', name: 'Member' },
    database: db(withUnpublishedRulebook),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('button', { name: 'Save' }, { timeout: 30_000 })).resolves.toBeDisabled();
    /* The next Edition's number is on the action that makes it; the toolbar states no Edition and no files. */
    expect(page.getByRole('button', { name: 'Publish Edition 2' })).not.toHaveAttribute('aria-disabled');
    expect(page.queryByRole('group', { name: 'Status' })).toBeNull();
    expect(page.queryByRole('button', { name: 'Rename Rulebook' })).toBeNull();
  },
});

export const DeepLinkedEditorBlock = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#REFS/TEXT' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const editor = await page.findByRole('region', { name: 'Markers and tokens editor' }, { timeout: 30_000 });
    expect(within(editor).getByRole('textbox', { name: 'Anchor' })).toHaveValue('marker-note');
    expect(page.getByRole('article', { name: 'Rulebook page: Markers and tokens' })).toBeVisible();
  },
});

export const DeepLinkedEditorPage = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#REFS/details' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const editor = await page.findByRole('region', { name: 'Markers and tokens editor' }, { timeout: 30_000 });
    expect(within(editor).getByRole('textbox', { name: 'Title' })).toHaveValue('Markers and tokens');
    expect(page.getByRole('article', { name: 'Rulebook page: Markers and tokens' })).toBeVisible();
  },
});

export const InvalidEditorDeepLink = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#MISSING/UNKNOWN' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const editor = await page.findByRole('region', { name: 'Welcome to Arrakis editor' }, { timeout: 30_000 });
    expect(within(editor).getByRole('textbox', { name: 'Title' })).toHaveValue('Welcome to Arrakis');
    expect(page.getByRole('article', { name: 'Rulebook page: Welcome to Arrakis' })).toBeVisible();
  },
});

/** A clipped Block reaches the header from another open Page, and its warning opens the Block. */
export const ClippedAuthorWarning = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#CHAP/details' },
  parameters: { database: db(withClippedRulebook) },
  globals: { viewport: { value: 'appAuthoringWide' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('button', { name: 'Page 1 / Referenced illustration: is clipped' }, { timeout: 30_000 });
    expect(page.getByText('Needs attention')).toBeVisible();
    expect(page.queryByRole('alert', { name: 'Referenced illustration is clipped' })).toBeNull();
    expect(page.getByRole('button', { name: 'Publish Edition 2' })).not.toHaveAttribute('aria-disabled');
    if (canvasElement.ownerDocument.defaultView) {
      canvasElement.ownerDocument.defaultView.location.hash = '#RULE/details';
    }
    await expect(page.findByRole('region', { name: 'Movement editor' })).resolves.toBeVisible();
    /* The header reads a report the hidden Pages publish a commit after they mount or unmount, so the warning is read under a retry rather than from the header the open Page arrived with.
     * The warning comes before the Page count inside the retry, so a measurement that stops covering every Page reports the warning it lost rather than the elements it stopped drawing. */
    await waitFor(
      () => {
        expect(page.getByRole('button', { name: 'Page 1 / Referenced illustration: is clipped' })).toBeVisible();
        expect(renderedPageCount(canvasElement)).toBe(4);
      },
      { timeout: 30_000 }
    );
    expect(canvasElement.ownerDocument.querySelectorAll('#movement')).toHaveLength(1);
    /* Changing the open Page replaces the header's measurement report, so use its current warning. */
    const warning = page.getByRole('button', { name: 'Page 1 / Referenced illustration: is clipped' });
    await userEvent.hover(warning);
    await waitForFrame(() =>
      expect(page.getByRole('tooltip')).toHaveTextContent(
        'Part of this Block will not be visible in the published Rulebook.'
      )
    );
    await userEvent.click(warning);
    await waitFor(() => expect(canvasElement.ownerDocument.defaultView?.location.hash).toBe('#CHAP/HERA'));
    const editor = page.getByRole('region', { name: 'Saved movement revision editor' });
    await expect(
      within(editor).findByRole('alert', { name: 'Referenced illustration is clipped' })
    ).resolves.toHaveTextContent(
      'Part of this Block will not be visible in the published Rulebook. Shorten the Block to show all of it.'
    );
    expect((within(editor).getByRole('textbox', { name: 'Caption' }) as HTMLTextAreaElement).value).toContain(
      'The rule continues below the fixed Page.'
    );
  },
});

/** Two clipped Blocks of one kind on the open Page each get their own warning, told apart by their ordinal. */
export const RepeatedClippedAuthorWarnings = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#CHAP/details' },
  parameters: { database: db(withRepeatedClippedRulebook) },
  globals: { viewport: { value: 'appAuthoringWide' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const first = await page.findByRole(
      'button',
      { name: 'Page 1 / Referenced illustration 1: is clipped' },
      { timeout: 30_000 }
    );
    expect(first).toBeVisible();
    expect(page.getByRole('button', { name: 'Page 1 / Referenced illustration 2: is clipped' })).toBeVisible();
    /* Both warnings name Page 1, so opening Page 2 is what proves they cover a Page the editor does not have open. */
    if (canvasElement.ownerDocument.defaultView) {
      canvasElement.ownerDocument.defaultView.location.hash = '#RULE/details';
    }
    await expect(page.findByRole('region', { name: 'Movement editor' })).resolves.toBeVisible();
    await waitFor(
      () => {
        expect(page.getByRole('button', { name: 'Page 1 / Referenced illustration 1: is clipped' })).toBeVisible();
        expect(page.getByRole('button', { name: 'Page 1 / Referenced illustration 2: is clipped' })).toBeVisible();
        expect(renderedPageCount(canvasElement)).toBe(4);
      },
      { timeout: 30_000 }
    );
    await userEvent.click(page.getByRole('button', { name: 'Page 1 / Referenced illustration 2: is clipped' }));
    await waitFor(() => expect(canvasElement.ownerDocument.defaultView?.location.hash).toBe('#CHAP/HERB'));
    const editor = page.getByRole('region', { name: 'Saved movement revision editor' });
    expect(within(editor).getByRole('alert', { name: 'Referenced illustration is clipped' })).toBeVisible();
    expect((within(editor).getByRole('textbox', { name: 'Caption' }) as HTMLTextAreaElement).value).toBe(
      'A second clipped illustration.'
    );
  },
});

/** Publishing is held, not clicked: a press short of five seconds publishes nothing, and the hover text says to hold (Norbert, 2026-09-29). */
export const PublishIsHeld = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  parameters: { database: db(withUnpublishedRulebook) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await page.findByRole('button', { name: 'Publish Edition 2' }, { timeout: 30_000 });
    await userEvent.hover(trigger);
    await waitForFrame(() => expect(page.getByRole('tooltip')).toHaveTextContent('hold to publish'));
    await userEvent.click(trigger);
    expect(
      page.queryByText('The new Edition is now current. HTML and PDF are being prepared independently.')
    ).toBeNull();
    expect(trigger).not.toHaveAttribute('aria-disabled');
  },
});

/** Holding Publish for five seconds publishes the next Edition, and the action then says there is nothing new to publish. */
export const PublishedEdition = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  parameters: { database: db(withUnpublishedRulebook) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await page.findByRole('button', { name: 'Publish Edition 2' }, { timeout: 30_000 });
    /* The keyboard holds too: Space held down runs the countdown, which is the one real five seconds this suite waits. */
    trigger.focus();
    await userEvent.keyboard('[Space>]');
    await waitFor(
      () =>
        expect(
          page.getByText('The new Edition is now current. HTML and PDF are being prepared independently.')
        ).toBeVisible(),
      { timeout: 15_000 }
    );
    await userEvent.keyboard('[/Space]');
    await waitFor(() =>
      expect(page.getByRole('button', { name: /^Publish Edition/ })).toHaveAttribute('aria-disabled', 'true')
    );
  },
});

/**
 * Thirty Pages, and the guard for the one behaviour that size is about.
 * Without a play the Story ended while the database worker was still starting, so it reported a pass for an editor that never mounted.
 */
export const ThirtyPageEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  parameters: { database: db(withThirtyPages) },
  play: async ({ canvasElement }) => checkTitleMeasurements(canvasElement, ['CHAP']),
});

export const ThirtyPageReferencedDestination = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  parameters: {
    database: db((baseline) => {
      withThirtyPages(baseline);
      const text = baseline.rulebook_drafts[0]?.contents.pagesById.REFS?.blocksById.TEXT;
      if (text?.kind !== 'text') {
        throw new Error('Referenced destination story needs its reference text');
      }
      text.references = [{ pageId: 'CHAP' }];
      return baseline;
    }),
  },
  play: async ({ canvasElement }) => checkTitleMeasurements(canvasElement, ['CHAP', 'REFS']),
});

async function checkTitleMeasurements(canvasElement: HTMLElement, expectedPages: string[]) {
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
    await waitFor(() => expect([...measured.observed].sort()).toEqual(expectedPages), { timeout: 30_000 });
    expect(renderedPageCount(canvasElement)).toBe(31);
  } finally {
    measured.restore();
  }
}

function ReferenceSubscriptionStory({ path }: { path: string }) {
  const client = useStorybookDatabaseClient();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          client.reset(
            db((baseline) => {
              withRulebooks(baseline);
              baseline.group_members = [];
              return baseline;
            }).create()
          )
        }
      >
        Revoke editing access
      </button>
      <StorybookPage path={path} />
    </>
  );
}

export const ReferenceEditsWithoutLoaderData = meta.story({
  render: (args) => <ReferenceSubscriptionStory {...args} />,
  parameters: { identity: { subjectKey: 'member', name: 'Member' } },
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/ASST' },
  beforeEach: () => {
    const loader = RulebookEditorRoute.options.loader;
    RulebookEditorRoute.options.loader = async () => null;
    return () => {
      RulebookEditorRoute.options.loader = loader;
    };
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const caption = await page.findByRole('textbox', { name: 'Caption' }, { timeout: 30_000 });
    await userEvent.clear(caption);
    await userEvent.type(caption, 'A local caption');
    await waitFor(() => expect(page.getByRole('textbox', { name: 'Caption' })).toHaveValue('A local caption'));
    expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Revoke editing access' }));
    await expect(
      page.findByRole('heading', { name: 'You cannot edit this Rulebook' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.queryByRole('textbox', { name: 'Caption' })).not.toBeInTheDocument();
  },
});

export const StaleEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  beforeEach: () => {
    const loader = RulebookEditorRoute.options.loader;
    RulebookEditorRoute.options.loader = async () => {
      parseClientBoundary(
        rulebookContentsV1Schema,
        { ...createRulebookStarterContents(), futureCatalogueOption: true },
        'Rulebook draft'
      );
      return null;
    };
    return () => {
      RulebookEditorRoute.options.loader = loader;
    };
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    /* A page story: the route is still loading when the play starts, as the sibling stories allow for. */
    expect(await page.findByRole('heading', { name: 'This page changed' }, { timeout: 30_000 })).toBeVisible();
    expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
    expect(page.queryByText(/unrecognized_keys/)).not.toBeInTheDocument();
  },
});
