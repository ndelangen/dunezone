import preview from '@sb/preview';
import { rulebookLocalIdAlphabet } from '@shared/rulebooks/contents';
import { rulebookEditionArtifactPath } from '@shared/rulebooks/editionArtifacts';
import { createRulebookEditorialStarterContents, createRulebookStarterContents } from '@shared/rulebooks/fixtures';
import { rulebookNameKey } from '@shared/rulebooks/metadata';
import { projectRulebookRenderDocument } from '@shared/rulebooks/projectRenderDocument';
import { DEFAULT_RULEBOOK_SETTINGS } from '@shared/rulebooks/settings';
import type { RulebookSettings } from '@shared/rulebooks/settings';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { SEED_REF_TOKEN, db, ref, refText, useStorybookDatabaseClient } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { StorybookPage, syncPreviewFrameHash } from '../../storybook';
import { Route as RulebookEditorRoute } from './$rulesetSlug/rulebooks/$rulebookSlug/edit/route';

/* Publication IDs are stored as strings, while the seed resolver can still replace its nested reference object. */
const publicationRef = (key: string) => ref(key) as unknown as string;

function withRulebooks(baseline: StorybookDatabase, names = ['Rules', 'Quick reference', 'Deleted Rulebook']) {
  const now = '2026-08-31T00:00:00.000Z';
  for (const [order, name] of names.entries()) {
    const key = `rulebook:${order}`;
    baseline.rulebooks.push({
      $key: key,
      ruleset_id: ref('ruleset:classicrules'),
      name,
      name_key: rulebookNameKey(name),
      slug: `book-${order}`,
      sort_order: order,
      current_edition_number: 1,
      created_by: ref('storybook-viewer'),
      created_at: now,
      updated_at: now,
      is_deleted: order === 2,
      deleted_at: order === 2 ? now : null,
    });
    const contents = createRulebookStarterContents();
    baseline.rulebook_drafts.push({
      rulebook_id: ref(key),
      contents,
      revision: 1,
      updated_at: now,
      updated_by: ref('storybook-viewer'),
    });
    baseline.rulebook_editions.push({
      $key: `rulebook-edition:${order}`,
      rulebook_id: ref(key),
      edition_number: 1,
      created_at: now,
      created_by: ref('storybook-viewer'),
    });
    baseline.rulebook_edition_contents.push({
      edition_id: ref(`rulebook-edition:${order}`),
      contents,
    });
  }
  /* The first Rulebook's HTML is ready and its PDF is not, so one card shows a file entry and the absence of the other. */
  for (const [kind, status] of [
    ['html', 'ready'],
    ['pdf', 'preparing'],
  ] as const) {
    baseline.rulebook_edition_artifacts.push({
      rulebook_id: ref('rulebook:0'),
      edition_id: ref('rulebook-edition:0'),
      edition_number: 1,
      kind,
      status,
      path: refText('rulebook:0', rulebookEditionArtifactPath(SEED_REF_TOKEN, 1, kind)),
      failure_reason: null,
      created_at: now,
      updated_at: now,
    });
  }
  baseline.users.push({ $key: 'member', name: 'Member' });
  baseline.users.push({ $key: 'outsider', name: 'Outsider' });
  baseline.group_members.push({
    group_id: ref('group:arrakeen-rules-council'),
    user_id: ref('member'),
    status: 'active',
    requested_at: now,
    approved_at: now,
    approved_by: ref('storybook-viewer'),
  });
  return baseline;
}

function withPublishedRulebooks(baseline: StorybookDatabase) {
  withRulebooks(baseline);
  for (const order of [0, 1]) {
    baseline.publication_assets.push({
      asset_type: 'rulebook-first-page',
      asset_id: publicationRef(`rulebook-edition:${order}`),
      cache_token: `storybook-edition-${order}`,
      published_at: Date.parse('2026-08-31T01:00:00.000Z'),
    });
  }
  return baseline;
}

function withSizedRulebooks(baseline: StorybookDatabase) {
  withRulebooks(baseline);
  const settings: RulebookSettings[] = [
    { size: 'square', design: 'illustrated' },
    { size: 'tall', design: 'restrained' },
  ];
  for (const [index, value] of settings.entries()) {
    const rulebook = baseline.rulebooks.find((book) => book.$key === `rulebook:${index}`)!;
    const edition = baseline.rulebook_editions.find((entry) => entry.$key === `rulebook-edition:${index}`)!;
    rulebook.settings = value;
    edition.settings = value;
    if (value.size === 'tall') {
      baseline.rulebook_drafts[index]!.contents = createRulebookEditorialStarterContents();
      baseline.rulebook_edition_contents[index]!.contents = createRulebookEditorialStarterContents();
    }
  }
  return baseline;
}

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
  if (!draft || block?.kind !== 'asset-figure') {
    throw new Error('Rulebook clipping Story needs its chapter Asset figure');
  }
  block.text = 'The rule continues below the fixed Page. '.repeat(80).trim();
  return baseline;
}

function withRepeatedClippedRulebook(baseline: StorybookDatabase) {
  withClippedRulebook(baseline);
  const draft = baseline.rulebook_drafts[0];
  const page = draft?.contents.pagesById.CHAP;
  const block = page?.blocksById.HERA;
  if (!page || block?.kind !== 'asset-figure') {
    throw new Error('Repeated clipping Story needs its chapter Asset figure');
  }
  page.blocksById.HERB = {
    ...structuredClone(block),
    id: 'HERB',
    text: 'A second clipped Asset figure.',
  };
  page.blockOrderByRegion.feature?.push('HERB');
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

function withFailedRulebookPreview(baseline: StorybookDatabase) {
  withRulebooks(baseline);
  baseline.publication_jobs.push({
    asset_type: 'rulebook-first-page',
    asset_id: publicationRef('rulebook-edition:0'),
    asset_data: {
      rulebookId: ref('rulebook:0'),
      editionId: ref('rulebook-edition:0'),
      editionNumber: 1,
      page: projectFirstRulebookPage(),
    },
    status: 'error',
    attempt_counter: 10,
    error: 'Storybook capture failure',
    created_at: Date.parse('2026-08-31T00:30:00.000Z'),
    updated_at: Date.parse('2026-08-31T00:40:00.000Z'),
  });
  return baseline;
}

function projectFirstRulebookPage() {
  const document = projectRulebookRenderDocument(
    createRulebookEditorialStarterContents(),
    {},
    DEFAULT_RULEBOOK_SETTINGS
  );
  const firstPageId = document.pageOrder[0];
  const page = firstPageId ? document.pagesById[firstPageId] : undefined;
  if (!page) {
    throw new Error('Rulebook Story must have a first Page');
  }
  return page;
}

function withManyRulebooks(baseline: StorybookDatabase) {
  return withRulebooks(baseline, ['Rules', 'Quick reference', 'Deleted Rulebook', 'Combat reference', 'Appendices']);
}

function describeFocus(storyDocument: Document) {
  const active = storyDocument.activeElement;
  if (!active) {
    return 'no element';
  }
  /* Mantine parks focus on an unnamed placeholder inside the dropdown, so name it rather than reporting a bare div. */
  if (active.hasAttribute('data-autofocus')) {
    return "the dropdown's focus placeholder";
  }
  const name = active.getAttribute('aria-label') ?? active.textContent?.trim().slice(0, 40) ?? '';
  const tag = active.tagName.toLowerCase();
  return name ? `<${tag}> "${name}"` : `<${tag}>`;
}

/*
 * Mantine hands focus to an opened dropdown from a timer, and the dropdown's own capture listener is what answers
 * Escape, so a key pressed before focus arrives lands on the trigger and leaves the menu open. The Story waits for
 * focus to enter rather than placing it, because that is the order a keyboard user meets: the menu takes focus, and
 * only then is Escape worth pressing. Both waits name what they saw, so a menu that stayed open is not reported as
 * duplicate menu items.
 */
async function closeMenuWithEscape(page: ReturnType<typeof within>, trigger: HTMLElement) {
  const storyDocument = trigger.ownerDocument;
  const dropdown = await page.findByRole('menu');
  await waitFor(() => {
    if (!dropdown.contains(storyDocument.activeElement)) {
      throw new Error(`The menu opened without taking focus, which rests on ${describeFocus(storyDocument)}.`);
    }
  });
  const keyboardTarget = describeFocus(storyDocument);
  await userEvent.keyboard('{Escape}');
  await waitFor(() => {
    const remaining = page.queryAllByRole('menuitem').length;
    if (dropdown.isConnected || remaining > 0) {
      throw new Error(
        `Escape went to ${keyboardTarget} and the menu is still mounted with ${remaining} items, while the trigger reports aria-expanded="${trigger.getAttribute('aria-expanded')}".`
      );
    }
  });
}

const meta = preview.meta({
  title: 'Rulesets/Rulebooks',
  component: StorybookPage,
  args: { path: '/rulesets/classicrules' },
  beforeEach: syncPreviewFrameHash,
  parameters: { layout: 'fullscreen', database: db(withRulebooks) },
});

export const Owner = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const list = await page.findByRole('list', { name: 'Rulebooks' }, { timeout: 30_000 });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).queryByText('Deleted Rulebook')).toBeNull();
    expect(within(list).getAllByRole('img', { name: /First-page preview unavailable/ })).toHaveLength(2);
    const editions = within(list).getAllByRole('img', { name: 'Edition 1' });
    expect(editions).toHaveLength(2);
    for (const edition of editions) {
      expect(edition).toHaveTextContent('v1');
    }
    expect(within(list).queryByText('Edition 1')).toBeNull();
    expect(page.getByRole('link', { name: 'Add Rulebook' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/create'
    );
    expect(page.queryByRole('button', { name: /Move .* up/ })).toBeNull();
    expect(page.queryByRole('button', { name: /Rename/ })).toBeNull();
    expect(within(list).queryByRole('button', { name: /Delete/ })).toBeNull();
    expect(within(list).queryByRole('button', { name: /View / })).toBeNull();
    expect(within(list).queryByRole('link', { name: /Edit / })).toBeNull();
    expect(within(list).getByRole('link', { name: 'Read Rules' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/book-0'
    );
    expect(within(list).getByRole('link', { name: 'Read Quick reference' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/book-1'
    );
    await userEvent.hover(page.getByRole('link', { name: 'Add Rulebook' }));
    await waitFor(() => expect(page.getByRole('tooltip')).toHaveTextContent('Add Rulebook'));
    await userEvent.unhover(page.getByRole('link', { name: 'Add Rulebook' }));
    await waitFor(() => expect(page.queryByRole('tooltip')).toBeNull());
    await userEvent.hover(editions[0]!);
    await waitFor(() => expect(page.getByRole('tooltip')).toHaveTextContent('Edition 1'));
    await userEvent.unhover(editions[0]!);
    await waitFor(() => expect(page.queryByRole('tooltip')).toBeNull());
    const actions = within(list).getByRole('button', { name: 'Actions for Rules' });
    expect(actions.closest('a')).toBeNull();
    await userEvent.hover(actions);
    await waitFor(() => expect(page.getByRole('tooltip')).toHaveTextContent('Actions for Rules'));
    await userEvent.unhover(actions);
    await waitFor(() => expect(page.queryByRole('tooltip')).toBeNull());
    await userEvent.click(actions);
    await expect(page.findByRole('menuitem', { name: 'Editions' })).resolves.toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/book-0/editions'
    );
    const html = page.getByRole('menuitem', { name: 'Open HTML' }).getAttribute('href') ?? '';
    expect(html).toMatch(/^\/published\/rulebooks\/[^/]+\/editions\/1\/rulebook\.html$/);
    expect(html).not.toContain(SEED_REF_TOKEN);
    expect(page.queryByRole('menuitem', { name: 'Open PDF' })).toBeNull();
    await expect(page.findByRole('menuitem', { name: 'Edit' })).resolves.toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/book-0/edit'
    );
    expect(within(list).queryByRole('menuitem')).toBeNull();
    await closeMenuWithEscape(page, actions);
  },
});

/*
 * The card wiring, not the rendered image: Storybook serves nothing under /published, so each preview falls to its
 * placeholder once the request fails.
 * `RulebookPreview.stories.tsx` covers the loaded image, every publication state, and replacement after a failure.
 */
export const PublishedPreviews = meta.story({
  parameters: { database: db(withPublishedRulebooks) },
});

export const FailedPreview = meta.story({
  parameters: { database: db(withFailedRulebookPreview) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('img', { name: 'First-page preview failed for Rules' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Actions for Rules' }));
    expect(await page.findByRole('menuitem', { name: 'Retry preview' })).toBeEnabled();
  },
});

export const Grid = meta.story({
  parameters: { database: db(withManyRulebooks) },
  globals: { viewport: { value: 'appAuthoringWide' } },
});

export const GridNarrow = meta.story({
  parameters: { database: db(withManyRulebooks) },
  globals: { viewport: { value: 'appMobile' } },
});

export const UtilitiesMenu = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Actions for Quick reference' }, { timeout: 30_000 })
    );
    await expect(page.findByRole('menuitem', { name: 'Edit' })).resolves.toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/book-1/edit'
    );
  },
});

export const FocusedCard = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const card = await page.findByRole('link', { name: 'Read Quick reference' }, { timeout: 30_000 });
    await userEvent.click(page.getByRole('link', { name: 'Read Rules' }));
    await userEvent.tab();
    await userEvent.tab();
    expect(card).toHaveFocus();
    expect(getComputedStyle(card).outlineStyle).toBe('solid');
  },
});

export const Viewer = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-1' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('region', { name: 'Quick reference contents' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.getByText('Edition 1', { exact: true })).toBeVisible();
    expect(page.getAllByRole('article', { name: /Rulebook page:/ })).toHaveLength(3);
    expect(page.queryByRole('button', { name: 'Save' })).toBeNull();
  },
});

export const ViewerNarrow = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0' },
  parameters: { identity: null },
  globals: { viewport: { value: 'appMobile' } },
});

export const EditionHistorySingle = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/editions' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Rules', level: 1 }, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.getByText('1 Edition')).toBeVisible();
    const list = within(page.getByRole('list', { name: 'Editions' }));
    expect(list.getAllByRole('listitem')).toHaveLength(1);
    expect(list.getByText('Current')).toBeVisible();
    expect(list.getByRole('link', { name: 'Read Edition 1' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/book-0'
    );
  },
});

export const EditionHistoryDeleted = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-2/editions' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Rulebook not found', {}, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByRole('list', { name: 'Editions' })).not.toBeInTheDocument();
  },
});

export const ViewerDeleted = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-2' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByText('Rulebook not found', undefined, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByRole('article', { name: /Rulebook page:/ })).toBeNull();
  },
});

export const Manage = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const list = await page.findByRole('list', { name: 'Rulebooks' }, { timeout: 30_000 });
    await userEvent.click(page.getByRole('button', { name: 'Move Quick reference up' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Quick reference'));
    expect(page.getByRole('button', { name: 'Move Quick reference up' })).toBeDisabled();
    expect(page.getByRole('button', { name: 'Delete Quick reference' })).toBeEnabled();
    expect(page.queryByRole('button', { name: /Rename/ })).toBeNull();
  },
});

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
    await waitFor(() => expect(page.getByText('Battle reference', { exact: true })).toBeVisible());
    expect(page.queryByRole('textbox', { name: 'Rulebook name' })).toBeNull();
    expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    const title = page.getByRole('textbox', { name: 'Title' });
    await userEvent.type(title, ' revised');
    expect(page.getByRole('button', { name: 'Rename Rulebook' })).toBeDisabled();
  },
});

export const Empty = meta.story({ parameters: { database: db((baseline) => baseline) } });
export const RenameForm = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Rename Rulebook' }, { timeout: 30_000 }));
    expect(page.getByRole('textbox', { name: 'Rulebook name' })).toBeVisible();
  },
});
export const Narrow = meta.story({ globals: { viewport: { value: 'contentNarrow' } } });
export const Creation = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('radio', { name: 'A4 210 × 297 mm' }, { timeout: 30_000 })).resolves.toBeChecked();
    expect(page.getByRole('radio', { name: 'Illustrated classic' })).toBeChecked();
  },
});

export const CreationNarrow = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  globals: { viewport: { value: 'contentNarrow' } },
});

export const CreateTallRestrained = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await page.findByRole('textbox', { name: 'Rulebook name' }, { timeout: 30_000 }),
      'Tall rules'
    );
    await userEvent.click(page.getByRole('radio', { name: 'Tall 105 × 297 mm' }));
    await userEvent.click(page.getByRole('radio', { name: 'Restrained expansion' }));
    await userEvent.click(page.getByRole('button', { name: 'Create Rulebook' }));
    await expect(page.findByRole('button', { name: 'Save' }, { timeout: 30_000 })).resolves.toBeDisabled();
    const preview = page.getByRole('article', { name: 'Rulebook page: Introduction' });
    expect(preview).toHaveAttribute('data-rulebook-size', 'tall');
    expect(preview).toHaveAttribute('data-rulebook-design', 'restrained');
    expect(preview).toHaveAttribute('data-rulebook-page-number', '1');
    expect(page.queryByRole('radiogroup', { name: 'Rulebook Size' })).not.toBeInTheDocument();
  },
});

export const CloneKeepsSize = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: { database: db(withSizedRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('radio', { name: 'Saved Rulebook' }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('combobox', { name: 'Rulebook to copy' }));
    await userEvent.click(await page.findByRole('option', { name: 'Quick reference' }));
    expect(page.queryByRole('radiogroup', { name: 'Rulebook Size' })).not.toBeInTheDocument();
    expect(page.getByText('This copy keeps the Tall size, 105 × 297 mm.')).toBeVisible();
    expect(page.getByRole('radio', { name: 'Restrained expansion' })).toBeChecked();
    await userEvent.click(page.getByRole('radio', { name: 'Illustrated classic' }));
    await userEvent.type(page.getByRole('textbox', { name: 'Rulebook name' }), 'Illustrated copy');
    await userEvent.click(page.getByRole('button', { name: 'Create Rulebook' }));
    await expect(page.findByRole('button', { name: 'Save' }, { timeout: 30_000 })).resolves.toBeDisabled();
    const preview = page.getByRole('article', { name: 'Rulebook page: Introduction' });
    expect(preview).toHaveAttribute('data-rulebook-size', 'tall');
    expect(preview).toHaveAttribute('data-rulebook-design', 'illustrated');
  },
});

export const MixedSizes = meta.story({ parameters: { database: db(withSizedRulebooks) } });

export const SquareReader = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0' },
  parameters: { database: db(withSizedRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const opening = await page.findByRole(
      'article',
      { name: 'Rulebook page: Welcome to Arrakis' },
      { timeout: 30_000 }
    );
    expect(opening).toHaveAttribute('data-rulebook-size', 'square');
    expect(opening).toHaveAttribute('data-rulebook-design', 'illustrated');
    const following = page.getByRole('article', { name: 'Rulebook page: Movement' });
    expect(following).toHaveAttribute('data-rulebook-page-number', '2');
    expect(following).toHaveAttribute('data-rulebook-page-side', 'left');
  },
});
export const Clone = meta.story({
  parameters: { database: db(withFinalRulebooks) },
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('radio', { name: 'Saved Rulebook' }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('combobox', { name: 'Rulebook to copy' }));
    const rules = await page.findByRole('option', { name: 'Rules' });
    expect(page.queryByRole('option', { name: 'Deleted Rulebook' })).toBeNull();
    await userEvent.click(rules);
    await userEvent.type(page.getByRole('textbox', { name: 'Rulebook name' }), 'Copied rules');
    await userEvent.click(page.getByRole('button', { name: 'Create Rulebook' }));
    await expect(page.findByRole('button', { name: 'Save' }, { timeout: 30_000 })).resolves.toBeDisabled();
    expect(page.getByText('Revision 1', { exact: true })).toBeVisible();
  },
});

export const CloneWithPublishedPreviews = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: {
    database: db((baseline) => {
      withPublishedRulebooks(baseline);
      replaceWithFinalContents(baseline);
      return baseline;
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('radio', { name: 'Saved Rulebook' }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('combobox', { name: 'Rulebook to copy' }));
    expect(await page.findByRole('option', { name: 'Rules' })).toBeVisible();
  },
});

export const ActiveMember = meta.story({
  parameters: { identity: { subjectKey: 'member', name: 'Member' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Add Rulebook' }, { timeout: 30_000 })).resolves.toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/create'
    );
    expect(page.queryByRole('button', { name: 'Move Quick reference up' })).toBeNull();
    expect(page.queryByRole('button', { name: 'Rename Rules' })).toBeNull();
    expect(page.queryByRole('button', { name: 'Delete Rules' })).toBeNull();
  },
});

export const MemberCreation = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: { identity: { subjectKey: 'member', name: 'Member' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await page.findByRole('textbox', { name: 'Rulebook name' }, { timeout: 30_000 }),
      'Member rules'
    );
    await userEvent.click(page.getByRole('button', { name: 'Create Rulebook' }));
    await expect(page.findByRole('button', { name: 'Save' }, { timeout: 30_000 })).resolves.toBeDisabled();
  },
});

export const MemberManagement = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  parameters: { identity: { subjectKey: 'member', name: 'Member' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('button', { name: 'Move Quick reference up' }, { timeout: 30_000 })
    ).resolves.toBeEnabled();
    expect(page.queryByRole('button', { name: 'Delete Rules' })).toBeNull();
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
    expect(page.getByRole('button', { name: 'Publish' })).toBeEnabled();
    expect(page.getByText('Edition 1')).toBeVisible();
    expect(page.getByText('HTML ready')).toBeVisible();
    expect(page.getByText('PDF preparing')).toBeVisible();
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
    await page.findByRole('button', { name: 'Page 1 / Asset figure: is clipped' }, { timeout: 30_000 });
    expect(page.getByText('Needs attention')).toBeVisible();
    expect(page.queryByRole('alert', { name: 'Asset figure is clipped' })).toBeNull();
    expect(page.getByRole('button', { name: 'Publish' })).toBeEnabled();
    if (canvasElement.ownerDocument.defaultView) {
      canvasElement.ownerDocument.defaultView.location.hash = '#RULE/details';
    }
    await expect(page.findByRole('region', { name: 'Movement editor' })).resolves.toBeVisible();
    /* The header reads a report the hidden Pages publish a commit after they mount or unmount, so the warning is read under a retry rather than from the header the open Page arrived with.
     * The warning comes before the Page count inside the retry, so a measurement that stops covering every Page reports the warning it lost rather than the elements it stopped drawing. */
    await waitFor(
      () => {
        expect(page.getByRole('button', { name: 'Page 1 / Asset figure: is clipped' })).toBeVisible();
        expect(renderedPageCount(canvasElement)).toBe(4);
      },
      { timeout: 30_000 }
    );
    expect(canvasElement.ownerDocument.querySelectorAll('#movement')).toHaveLength(1);
    /* Changing the open Page replaces the header's measurement report, so use its current warning. */
    const warning = page.getByRole('button', { name: 'Page 1 / Asset figure: is clipped' });
    await userEvent.hover(warning);
    await expect(page.findByRole('tooltip')).resolves.toHaveTextContent(
      'Part of this Block will not be visible in the published Rulebook.'
    );
    await userEvent.click(warning);
    await waitFor(() => expect(canvasElement.ownerDocument.defaultView?.location.hash).toBe('#CHAP/HERA'));
    const editor = page.getByRole('region', { name: 'Saved movement revision editor' });
    await expect(within(editor).findByRole('alert', { name: 'Asset figure is clipped' })).resolves.toHaveTextContent(
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
    const first = await page.findByRole('button', { name: 'Page 1 / Asset figure 1: is clipped' }, { timeout: 30_000 });
    expect(first).toBeVisible();
    expect(page.getByRole('button', { name: 'Page 1 / Asset figure 2: is clipped' })).toBeVisible();
    /* Both warnings name Page 1, so opening Page 2 is what proves they cover a Page the editor does not have open. */
    if (canvasElement.ownerDocument.defaultView) {
      canvasElement.ownerDocument.defaultView.location.hash = '#RULE/details';
    }
    await expect(page.findByRole('region', { name: 'Movement editor' })).resolves.toBeVisible();
    await waitFor(
      () => {
        expect(page.getByRole('button', { name: 'Page 1 / Asset figure 1: is clipped' })).toBeVisible();
        expect(page.getByRole('button', { name: 'Page 1 / Asset figure 2: is clipped' })).toBeVisible();
        expect(renderedPageCount(canvasElement)).toBe(4);
      },
      { timeout: 30_000 }
    );
    await userEvent.click(page.getByRole('button', { name: 'Page 1 / Asset figure 2: is clipped' }));
    await waitFor(() => expect(canvasElement.ownerDocument.defaultView?.location.hash).toBe('#CHAP/HERB'));
    const editor = page.getByRole('region', { name: 'Saved movement revision editor' });
    expect(within(editor).getByRole('alert', { name: 'Asset figure is clipped' })).toBeVisible();
    expect((within(editor).getByRole('textbox', { name: 'Caption' }) as HTMLTextAreaElement).value).toBe(
      'A second clipped Asset figure.'
    );
  },
});

export const PublishConfirmation = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  parameters: { database: db(withUnpublishedRulebook) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await page.findByRole('button', { name: 'Publish' }, { timeout: 30_000 });
    await userEvent.click(trigger);
    /* Two waits, because the pane arrives in two steps: the dropdown mounts a frame after the trigger
       reports itself expanded, so an eager `getByRole` throws, and it then fades in over 150ms, so a
       visibility assertion that does not retry reads `opacity: 0`. Both use the editor's mount budget
       because opening frames can be delayed under load. */
    const confirmation = await page.findByRole('dialog', { name: 'Publish Edition 2?' }, { timeout: 30_000 });
    await waitFor(() => expect(confirmation).toBeVisible(), { timeout: 30_000 });
    /* The confirmation hangs off the control that opens it rather than floating free of it. */
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(confirmation).getByRole('button', { name: 'Publish Edition 2' })).toBeEnabled();
  },
});

export const PublishedEdition = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  parameters: { database: db(withUnpublishedRulebook) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await page.findByRole('button', { name: 'Publish' }, { timeout: 30_000 });
    await userEvent.click(trigger);
    /* The confirmation mounts and fades in after the trigger opens it, with the same mount budget as the editor. */
    const confirmation = await page.findByRole('dialog', { name: 'Publish Edition 2?' }, { timeout: 30_000 });
    await waitFor(() => expect(confirmation).toBeVisible(), { timeout: 30_000 });
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Publish Edition 2' }));
    await waitFor(() => expect(page.getByText('Edition 2')).toBeVisible());
    expect(
      page.getByText('The new Edition is now current. HTML and PDF are being prepared independently.')
    ).toBeVisible();
    expect(page.getByText('HTML preparing')).toBeVisible();
    expect(page.getByText('PDF preparing')).toBeVisible();
    expect(page.getByRole('button', { name: 'Publish' })).toBeDisabled();
  },
});

export const Reader = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const list = await page.findByRole('list', { name: 'Rulebooks' }, { timeout: 30_000 });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    /* The history is a read path, so a signed-out reader gets the card menu too, minus the editing entries. */
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    await userEvent.click(within(list).getByRole('button', { name: 'Actions for Rules' }));
    await expect(page.findByRole('menuitem', { name: 'Editions' })).resolves.toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/book-0/editions'
    );
    expect(page.getByRole('menuitem', { name: 'Open HTML' })).toHaveAttribute('target', '_blank');
    expect(page.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();
  },
});
export const ManageNarrow = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'contentNarrow' } },
});

async function expectDenied(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  await expect(
    page.findByRole('heading', { name: 'Rulebook creation is unavailable' }, { timeout: 30_000 })
  ).resolves.toBeVisible();
  expect(page.queryByRole('textbox', { name: 'Rulebook name' })).toBeNull();
}

export const Outsider = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: { identity: { subjectKey: 'outsider', name: 'Outsider' } },
  play: async ({ canvasElement }) => expectDenied(canvasElement),
});
export const InactiveMember = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: {
    identity: { subjectKey: 'member', name: 'Member' },
    database: db((baseline) => {
      withRulebooks(baseline);
      baseline.group_members[baseline.group_members.length - 1].status = 'removed';
    }),
  },
  play: async ({ canvasElement }) => expectDenied(canvasElement),
});
export const SignedOut = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/create' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('link', { name: 'Log in' }, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByRole('textbox', { name: 'Rulebook name' })).toBeNull();
  },
});

/**
 * Thirty Pages, and the guard for the one behaviour that size is about.
 * Without a play the Story ended while the database worker was still starting, so it reported a pass for an editor that never mounted.
 */
export const ThirtyPageEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit' },
  parameters: { database: db(withThirtyPages) },
  play: async ({ canvasElement }) => {
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
      /* One keystroke re-measures the Page it edited and no other, which is what the memo comparator on the hidden Pages buys.
       * Retrying the whole set rather than waiting for it to be non-empty first means an observer that never arrives reports the Pages it measured, not a count of nothing. */
      await waitFor(() => expect([...measured.observed]).toEqual(['CHAP']), { timeout: 30_000 });
      expect(renderedPageCount(canvasElement)).toBe(31);
    } finally {
      measured.restore();
    }
  },
});

function replaceWithFinalContents(baseline: StorybookDatabase) {
  for (const draft of baseline.rulebook_drafts) {
    draft.contents = createRulebookEditorialStarterContents();
  }
  for (const edition of baseline.rulebook_edition_contents) {
    edition.contents = createRulebookEditorialStarterContents();
  }
}

function withFinalRulebooks(baseline: StorybookDatabase) {
  withRulebooks(baseline);
  replaceWithFinalContents(baseline);
  const draft = baseline.rulebook_drafts[0]!;
  const page = draft.contents.pagesById.RULE!;
  page.blocksById.TEXT = {
    id: 'TEXT',
    kind: 'text',
    name: 'Ornithopters',
    text: 'Control Arrakeen or Carthag at the start of your movement to move a group up to three territories.',
  };
  page.blocksById.L5ST = {
    id: 'L5ST',
    kind: 'list',
    style: 'numbered',
    itemOrder: ['SHIP', 'MOVE'],
    itemsById: {
      SHIP: { id: 'SHIP', name: 'Shipment', text: 'Pay spice to bring reserves onto Dune.' },
      MOVE: { id: 'MOVE', name: 'Movement', text: 'Choose one group of forces to move.' },
    },
  };
  page.blocksById.HEAD = { id: 'HEAD', kind: 'section-heading', title: 'Faction advantages' };
  page.blockOrderByRegion.content!.unshift('HEAD');
  draft.contents.pageOrder.push('CVER');
  draft.contents.pagesById.CVER = {
    id: 'CVER',
    anchor: 'cover',
    title: 'Dreamrules',
    layoutId: 'cover',
    showHeading: true,
    controlValues: { cover: { subtitle: 'Rules for Arrakis', supportingText: '' } },
    blockOrderByRegion: {},
    blocksById: {},
  };
  return baseline;
}

export const FinalPageCatalogue = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Add Page' }, { timeout: 30_000 }));
    expect(page.queryByRole('menuitem', { name: 'Chapter opener' })).not.toBeInTheDocument();
    await expect(page.findByRole('menuitem', { name: 'Single column' })).resolves.toBeInTheDocument();
    expect(page.getByRole('menuitem', { name: 'Cover' })).toBeInTheDocument();
    await userEvent.click(page.getByRole('menuitem', { name: 'Narrow left / wide right' }));
    const preview = page.getByRole('article', { name: 'Rulebook page: New page' });
    expect(preview).toHaveAttribute('data-rulebook-layout', 'wide-narrow');
    expect(page.queryByRole('combobox', { name: /Wide position|Arrangement/i })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('switch', { name: 'Show page heading' }));
    expect(within(preview).queryByText('New page')).not.toBeInTheDocument();
    expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('New page');
    await userEvent.click(page.getByRole('button', { name: 'Add Block' }));
    await expect(page.findByRole('menuitem', { name: 'Question and answer' })).resolves.toBeInTheDocument();
    expect(page.queryByRole('menuitem', { name: 'Repeated text' })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole('menuitem', { name: 'Question and answer' }));
    expect(page.getByRole('textbox', { name: 'Question' })).toBeVisible();
  },
});

export const TallPageCatalogue = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: {
    database: db((baseline) => {
      withFinalRulebooks(baseline);
      baseline.rulebooks[0]!.settings = { size: 'tall', design: 'illustrated' };
      return baseline;
    }),
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Add Page' }, { timeout: 30_000 }));
    await page.findByRole('menuitem', { name: 'Single column' });
    expect(page.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Single column', 'Cover']);
  },
});

export const UnsavedFactionReference = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/HEAD' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    expect(page.queryByRole('textbox', { name: 'Search factions' })).not.toBeInTheDocument();
    await userEvent.click(await page.findByRole('button', { name: 'Choose faction' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('option', { name: /House Atreides/ }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Use faction' }));
    await expect(page.findByRole('button', { name: 'House Atreides' }, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.queryByRole('textbox', { name: 'Search factions' })).not.toBeInTheDocument();
    expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    const preview = page.getByRole('article', { name: 'Rulebook page: Introduction' });
    const heading = preview.querySelector('[data-rulebook-block-id="HEAD"]');
    await waitFor(() => expect(heading).toHaveAttribute('title', 'House Atreides'));
  },
});

export const UnsavedCoverArtwork = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#CVER/cover' },
  parameters: { database: db(withFinalRulebooks) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Choose artwork' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('option', { name: /Karama/ }, { timeout: 30_000 }));
    await expect(page.findByRole('button', { name: 'Karama' }, { timeout: 30_000 })).resolves.toBeVisible();
    expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(page.getByRole('textbox', { name: 'Subtitle' })).toHaveValue('Rules for Arrakis');
    expect(page.getByRole('article', { name: 'Rulebook page: Dreamrules' })).toHaveAttribute(
      'data-rulebook-page-number',
      '2'
    );
  },
});

export const WrittenRuleEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: { database: db(withFinalRulebooks) },
});
export const WrittenRuleEditorDark = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/details' },
  parameters: { database: db(withFinalRulebooks) },
  globals: { colorScheme: 'dark' },
});

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
    const asset = await page.findByRole('textbox', { name: 'Asset' }, { timeout: 30_000 });
    await userEvent.clear(asset);
    await userEvent.type(asset, 'local-asset');
    await waitFor(() => expect(page.getByRole('textbox', { name: 'Asset' })).toHaveValue('local-asset'));
    expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Revoke editing access' }));
    await expect(
      page.findByRole('heading', { name: 'You cannot edit this Rulebook' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.queryByRole('textbox', { name: 'Asset' })).not.toBeInTheDocument();
  },
});

function withLiveReferenceRulebook(baseline: StorybookDatabase) {
  withFinalRulebooks(baseline);
  const faction = baseline.factions.find((row) => row.$key === 'faction:house-atreides')!;
  const data = faction.data as { hero: { memberId?: string }; leaders: Array<{ memberId?: string }> };
  data.hero.memberId = '10000000-0000-4000-8000-000000000001';
  data.leaders.forEach((member, index) => {
    member.memberId = `10000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}`;
  });
  const page = baseline.rulebook_drafts[0]!.contents.pagesById.RULE!;
  page.title = 'Game components';
  page.blocksById = {
    ARTW: { id: 'ARTW', kind: 'referenced-illustration', caption: 'Choose a Leader for your battle plan.' },
    NVNT: {
      id: 'NVNT',
      kind: 'illustrated-inventory',
      title: 'Game components',
      introduction: '',
      itemOrder: ['MAPA'],
      itemsById: {
        MAPA: {
          id: 'MAPA',
          source: { kind: 'board', boardId: 'arrakis' },
          text: 'Place forces on the territories.',
          quantity: 1,
        },
      },
    },
    FACT: { id: 'FACT', kind: 'faction-introduction', text: 'A faction introduction belongs to the author.' },
  };
  page.blockOrderByRegion = { content: ['ARTW', 'NVNT', 'FACT'] };
  return baseline;
}

export const LiveReferenceEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/ARTW' },
  parameters: { database: db(withLiveReferenceRulebook) },
  globals: { colorScheme: 'dark' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    expect(page.queryByRole('textbox', { name: 'Search factions' })).not.toBeInTheDocument();
    await userEvent.click(await page.findByRole('button', { name: 'Choose source' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('combobox', { name: 'Source type' }));
    await userEvent.click(await page.findByRole('option', { name: 'Leader' }));
    await userEvent.click(await page.findByRole('option', { name: /House Atreides/ }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Choose Leader' }));
    await userEvent.click(await page.findByRole('button', { name: 'Gurney Halleck · Leader' }, { timeout: 30_000 }));
    expect(page.queryByRole('textbox', { name: 'Search factions' })).not.toBeInTheDocument();
    await expect(page.getByRole('textbox', { name: 'Caption' })).toHaveValue('Choose a Leader for your battle plan.');
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Save' }));
    await expect(page.findByRole('button', { name: 'Saved' }, { timeout: 30_000 })).resolves.toBeDisabled();
  },
});

export const InventoryEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/NVNT' },
  parameters: { database: db(withLiveReferenceRulebook) },
  globals: { colorScheme: 'dark' },
});

export const FactionIntroductionEditor = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#RULE/FACT' },
  parameters: { database: db(withLiveReferenceRulebook) },
  globals: { colorScheme: 'dark' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: 'Choose faction' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('option', { name: /House Atreides/ }, { timeout: 30_000 }));
    await userEvent.click(page.getByRole('button', { name: 'Use faction' }));
    await expect(page.findByRole('button', { name: 'House Atreides' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Introduction' })).toHaveValue(
      'A faction introduction belongs to the author.'
    );
    const preview = page.getByRole('article', { name: 'Rulebook page: Game components' });
    await expect(within(preview).findByRole('heading', { name: 'House Atreides' })).resolves.toBeVisible();
  },
});
