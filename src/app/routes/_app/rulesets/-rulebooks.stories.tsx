import preview from '@sb/preview';
import { createRulebookEditorialStarterContents } from '@shared/rulebooks/fixtures';
import { rulebookNameKey } from '@shared/rulebooks/metadata';
import { projectRulebookRenderDocument } from '@shared/rulebooks/projectRenderDocument';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { StorybookPage } from '../../-storybook';

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
    const contents = createRulebookEditorialStarterContents();
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
  const document = projectRulebookRenderDocument(createRulebookEditorialStarterContents(), {});
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

const meta = preview.meta({
  title: 'Rulesets/Rulebooks',
  component: StorybookPage,
  args: { path: '/rulesets/classicrules' },
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
    await expect(page.findByRole('menuitem', { name: 'Edit' })).resolves.toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/book-0/edit'
    );
    expect(within(list).queryByRole('menuitem')).toBeNull();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('menuitem')).toBeNull());
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
export const Creation = meta.story({ args: { path: '/rulesets/classicrules/rulebooks/create' } });
export const Clone = meta.story({
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
  parameters: { database: db(withPublishedRulebooks) },
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
    expect(page.getByText('HTML preparing')).toBeVisible();
    expect(page.getByText('PDF preparing')).toBeVisible();
    expect(page.queryByRole('button', { name: 'Rename Rulebook' })).toBeNull();
  },
});

/**
 * A clipped Block on the open Page reaches the header, and its warning opens the Block.
 * The Page in the path is the clipped one on purpose: clipping is measured from the rendered preview, which draws one Page, so the warning describes the Page the editor has open and no other (#976).
 * Naming a different Page here would read as proof that the warning is document-wide, and it would not be: the editor drops the requested Page on a fresh load (#977) and opens the first one, which is the Page this story is really about.
 */
export const ClippedAuthorWarning = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/edit#CHAP/details' },
  parameters: { database: db(withClippedRulebook) },
  globals: { viewport: { value: 'appAuthoringWide' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const warning = await page.findByRole('button', { name: 'Page 1 / Asset figure: is clipped' }, { timeout: 30_000 });
    expect(page.getByText('Needs attention')).toBeVisible();
    expect(page.queryByRole('alert', { name: 'Asset figure is clipped' })).toBeNull();
    expect(page.getByRole('button', { name: 'Publish' })).toBeEnabled();
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
    const second = page.getByRole('button', { name: 'Page 1 / Asset figure 2: is clipped' });
    expect(first).toBeVisible();
    await userEvent.click(second);
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
       visibility assertion that does not retry reads `opacity: 0`. */
    const confirmation = await page.findByRole('dialog', { name: 'Publish Edition 2?' }, { timeout: 30_000 });
    await waitFor(() => expect(confirmation).toBeVisible());
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
    await userEvent.click(await page.findByRole('button', { name: 'Publish' }, { timeout: 30_000 }));
    await userEvent.click(await page.findByRole('button', { name: 'Publish Edition 2' }));
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
    expect(within(list).queryByRole('button')).toBeNull();
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
