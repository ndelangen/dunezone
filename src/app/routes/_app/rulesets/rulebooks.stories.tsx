/* The Ruleset's Rulebooks page, the reader and the edition history, as the owner, a member, a reader and a signed-out visitor see them (#1590). */
import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { SEED_REF_TOKEN, db } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import {
  rulebooksMeta,
  withFailedRulebookPreview,
  withPublishedRulebooks,
  withRulebooks,
  withSizedRulebooks,
} from './rulebooks.stories.fixture';

const meta = preview.meta({
  ...rulebooksMeta,
  title: 'Rulesets/Rulebooks',
});

function withManyRulebooks(baseline: StorybookDatabase) {
  return withRulebooks(baseline, ['Rules', 'Quick reference', 'Deleted Rulebook', 'Battle reference', 'Appendices']);
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
  await waitForFrame(() => {
    const remaining = page.queryAllByRole('menuitem').length;
    if (dropdown.isConnected || remaining > 0) {
      throw new Error(
        `Escape went to ${keyboardTarget} and the menu is still mounted with ${remaining} items, while the trigger reports aria-expanded="${trigger.getAttribute('aria-expanded')}".`
      );
    }
  });
}

export const Owner = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const list = await page.findByRole('list', { name: 'Rulebooks' }, { timeout: 30_000 });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).queryByText('Deleted Rulebook')).toBeNull();
    expect(within(list).getAllByRole('img', { name: /^First page of .+: preview unavailable$/ })).toHaveLength(2);
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
    await waitForFrame(() => expect(page.getByRole('tooltip')).toHaveTextContent('Add Rulebook'));
    await userEvent.unhover(page.getByRole('link', { name: 'Add Rulebook' }));
    await waitForFrame(() => expect(page.queryByRole('tooltip')).toBeNull());
    await userEvent.hover(editions[0]!);
    await waitForFrame(() => expect(page.getByRole('tooltip')).toHaveTextContent('Edition 1'));
    await userEvent.unhover(editions[0]!);
    await waitForFrame(() => expect(page.queryByRole('tooltip')).toBeNull());
    const actions = within(list).getByRole('button', { name: 'Actions for Rules' });
    expect(actions.closest('a')).toBeNull();
    await userEvent.hover(actions);
    await waitForFrame(() => expect(page.getByRole('tooltip')).toHaveTextContent('Actions for Rules'));
    await userEvent.unhover(actions);
    await waitForFrame(() => expect(page.queryByRole('tooltip')).toBeNull());
    await userEvent.click(actions);
    await expect(waitForFrame(() => page.getByRole('menuitem', { name: 'Editions' }))).resolves.toHaveAttribute(
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
 * The card wiring, not the rendered image: Storybook serves nothing under /published, so each preview falls to the
 * missing state once the request fails.
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
    expect(await waitForFrame(() => page.getByRole('menuitem', { name: 'Retry preview' }))).toBeEnabled();
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
    await expect(waitForFrame(() => page.getByRole('menuitem', { name: 'Edit' }))).resolves.toHaveAttribute(
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

export const Empty = meta.story({ parameters: { database: db((baseline) => baseline) } });

export const Narrow = meta.story({ globals: { viewport: { value: 'contentNarrow' } } });

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

export const Reader = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const list = await page.findByRole('list', { name: 'Rulebooks' }, { timeout: 30_000 });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    /* The history is a read path, so a signed-out reader gets the card menu too, minus the editing entries. */
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    await userEvent.click(within(list).getByRole('button', { name: 'Actions for Rules' }));
    await expect(waitForFrame(() => page.getByRole('menuitem', { name: 'Editions' }))).resolves.toHaveAttribute(
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
