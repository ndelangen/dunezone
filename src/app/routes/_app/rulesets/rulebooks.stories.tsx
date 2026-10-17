/* The Ruleset's Rulebooks page, the reader and the edition history, as the owner, a member, a reader and a signed-out visitor see them (#1590). */
import preview from '@sb/preview';
import { waitForFrame } from '@sb/storyWaits';
import { install } from '@sinonjs/fake-timers';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { SEED_REF_TOKEN, db } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { expectWithinWidth } from '../../pagePlay';
import {
  rulebooksMeta,
  withFailedRulebookPreview,
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

/** The Rulebook cards once the list has loaded. */
async function findCards(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const list = await page.findByRole('list', { name: 'Rulebooks' }, { timeout: 30_000 });
  return within(list).getAllByRole('listitem');
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
    await expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    await expect(within(list).queryByText('Deleted Rulebook')).toBeNull();
    await expect(within(list).getAllByRole('img', { name: /^First page of .+: preview unavailable$/ })).toHaveLength(2);
    const editions = within(list).getAllByRole('img', { name: 'Edition 1' });
    await expect(editions).toHaveLength(2);
    for (const edition of editions) {
      await expect(edition).toHaveTextContent('v1');
    }
    await expect(within(list).queryByText('Edition 1')).toBeNull();
    /* The toolbar follows the viewer, which the browser resolves after the shared page. */
    const add = await page.findByRole('link', { name: 'Add Rulebook' }, { timeout: 30_000 });
    await expect(add).toHaveAttribute('href', '/rulesets/classicrules/rulebooks/create');
    await expect(page.queryByRole('button', { name: /Move .* up/ })).toBeNull();
    await expect(page.queryByRole('button', { name: /Rename/ })).toBeNull();
    await expect(within(list).queryByRole('button', { name: /Delete/ })).toBeNull();
    await expect(within(list).queryByRole('button', { name: /View / })).toBeNull();
    await expect(within(list).queryByRole('link', { name: /Edit / })).toBeNull();
    await expect(within(list).getByRole('link', { name: 'Read Rules' })).toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/book-0'
    );
    await expect(within(list).getByRole('link', { name: 'Read Quick reference' })).toHaveAttribute(
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
    await expect(actions.closest('a')).toBeNull();
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
    await expect(html).toMatch(/^\/published\/rulebooks\/[^/]+\/editions\/1\/rulebook\.html$/);
    await expect(html).not.toContain(SEED_REF_TOKEN);
    await expect(page.queryByRole('menuitem', { name: 'Open PDF' })).toBeNull();
    await expect(page.findByRole('menuitem', { name: 'Edit' })).resolves.toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/book-0/edit'
    );
    await expect(within(list).queryByRole('menuitem')).toBeNull();
    await closeMenuWithEscape(page, actions);
  },
});

export const FailedPreview = meta.story({
  parameters: { database: db(withFailedRulebookPreview) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('img', { name: 'First-page preview failed for Rules' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Actions for Rules' }));
    const retry = await waitForFrame(() => page.getByRole('menuitem', { name: 'Retry preview' }));
    await expect(retry).toBeEnabled();
    /* The retry schedules a new capture, and the tile reads its state back from the database. */
    await userEvent.click(retry);
    await expect(
      page.findByRole('img', { name: 'First-page preview preparing for Rules' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.queryByRole('img', { name: 'First-page preview failed for Rules' })).toBeNull();
  },
});

/** Five Rulebooks, one deleted, so the grid holds four cards. */
export const Grid = meta.story({
  parameters: { database: db(withManyRulebooks) },
  globals: { viewport: { value: 'appAuthoringWide' } },
  play: async ({ canvasElement }) => {
    await expect(findCards(canvasElement)).resolves.toHaveLength(4);
  },
});

/** On a phone the four cards wrap onto more than one row and stay inside the width. */
export const GridNarrow = meta.story({
  parameters: { database: db(withManyRulebooks) },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const cards = await findCards(canvasElement);
    await expect(cards).toHaveLength(4);
    const rows = new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top)));
    await expect(rows.size).toBeGreaterThan(1);
    await expectWithinWidth(canvasElement, cards);
  },
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
    await expect(card).toHaveFocus();
    await expect(getComputedStyle(card).outlineStyle).toBe('solid');
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
    await expect(page.getByText('Edition 1', { exact: true })).toBeVisible();
    await expect(page.getAllByRole('article', { name: /Rulebook page:/ })).toHaveLength(3);
    await expect(page.queryByRole('button', { name: 'Save' })).toBeNull();
    await expect(page.queryByRole('button', { name: 'Delete Rulebook' })).toBeNull();
    await expect(page.queryByRole('link', { name: 'Edit Rulebook' })).toBeNull();
  },
});

export const EditFromReader = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const edit = await page.findByRole('link', { name: 'Edit Rulebook' }, { timeout: 30_000 });
    await expect(edit).toHaveAttribute('href', '/rulesets/classicrules/rulebooks/book-0/edit');
    await userEvent.hover(edit);
    await waitForFrame(() => expect(page.getByRole('tooltip')).toHaveTextContent('Edit Rulebook'));
  },
});

export const DeleteFromReader = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const remove = await page.findByRole('button', { name: 'Delete Rulebook' }, { timeout: 30_000 });
    const clock = install({ toFake: ['setInterval', 'clearInterval'], shouldClearNativeTimers: true });
    try {
      await userEvent.pointer({ target: remove, keys: '[MouseLeft>]' });
      await clock.tickAsync(5000);
    } finally {
      try {
        await userEvent.pointer({ target: remove, keys: '[/MouseLeft]' });
      } finally {
        clock.uninstall();
      }
    }
    const list = await page.findByRole('list', { name: 'Rulebooks' }, { timeout: 30_000 });
    await expect(within(list).queryByRole('link', { name: 'Read Rules' })).toBeNull();
    await expect(within(list).getByRole('link', { name: 'Read Quick reference' })).toBeVisible();
  },
});

export const MemberReader = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0' },
  parameters: { identity: { subjectKey: 'member', name: 'Member' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('region', { name: 'Rules contents' }, { timeout: 30_000 });
    /* The links follow the viewer, which the browser resolves after the shared page, so wait for them. */
    const edit = await page.findByRole('link', { name: 'Edit Rulebook' }, { timeout: 30_000 });
    await expect(edit).toHaveAttribute('href', '/rulesets/classicrules/rulebooks/book-0/edit');
    await expect(page.queryByRole('button', { name: 'Delete Rulebook' })).toBeNull();
  },
});

/** The signed-out reader on a phone: every page fits the width. */
export const ViewerNarrow = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0' },
  parameters: { identity: null },
  globals: { viewport: { value: 'appMobile' } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('region', { name: 'Rules contents' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expectWithinWidth(canvasElement, page.getAllByRole('article', { name: /Rulebook page:/ }));
  },
});

export const EditionHistorySingle = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-0/editions' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Rules', level: 1 }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.getByText('1 Edition')).toBeVisible();
    const list = within(page.getByRole('list', { name: 'Editions' }));
    await expect(list.getAllByRole('listitem')).toHaveLength(1);
    await expect(list.getByText('Current')).toBeVisible();
    await expect(list.getByRole('link', { name: 'Read Edition 1' })).toHaveAttribute(
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
    await expect(page.queryByRole('list', { name: 'Editions' })).not.toBeInTheDocument();
  },
});

export const ViewerDeleted = meta.story({
  args: { path: '/rulesets/classicrules/rulebooks/book-2' },
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('heading', { name: 'Page not found' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('article', { name: /Rulebook page:/ })).toBeNull();
  },
});

export const Manage = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const list = await page.findByRole('list', { name: 'Rulebooks' }, { timeout: 30_000 });
    await userEvent.click(page.getByRole('button', { name: 'Move Quick reference up' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Quick reference'));
    await expect(page.getByRole('button', { name: 'Move Quick reference up' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Delete Quick reference' })).toBeEnabled();
    await expect(page.queryByRole('button', { name: /Rename/ })).toBeNull();
  },
});

/** A ruleset with no Rulebooks says so, and its owner can still add one. */
export const Empty = meta.story({
  parameters: { database: db((baseline) => baseline) },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText('No Rulebooks yet. Add one from the toolbar.', {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await expect(page.findByRole('link', { name: 'Add Rulebook' }, { timeout: 30_000 })).resolves.toBeVisible();
    await expect(page.queryByRole('list', { name: 'Rulebooks' })).toBeNull();
  },
});

/** A square Rulebook and a tall one: each card takes its own Rulebook's proportions. */
export const MixedSizes = meta.story({
  parameters: { database: db(withSizedRulebooks) },
  play: async ({ canvasElement }) => {
    await findCards(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const ratio = (name: string) => {
      const { width, height } = page
        .getByRole('img', { name: `First page of ${name}: preview unavailable` })
        .getBoundingClientRect();
      return height / width;
    };
    await expect(ratio('Rules')).toBeCloseTo(1, 1);
    await expect(ratio('Quick reference')).toBeCloseTo(297 / 105, 1);
  },
});

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
    await expect(opening).toHaveAttribute('data-rulebook-size', 'square');
    await expect(opening).toHaveAttribute('data-rulebook-design', 'illustrated');
    const following = page.getByRole('article', { name: 'Rulebook page: Movement' });
    await expect(following).toHaveAttribute('data-rulebook-page-number', '2');
    await expect(following).toHaveAttribute('data-rulebook-page-side', 'left');
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
    await expect(page.queryByRole('button', { name: 'Move Quick reference up' })).toBeNull();
    await expect(page.queryByRole('button', { name: 'Rename Rules' })).toBeNull();
    await expect(page.queryByRole('button', { name: 'Delete Rules' })).toBeNull();
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
    await expect(page.queryByRole('button', { name: 'Delete Rules' })).toBeNull();
    await expect(page.getByText('Only the ruleset owner can rename it.')).toBeVisible();
  },
});

export const Reader = meta.story({
  parameters: { identity: null },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const list = await page.findByRole('list', { name: 'Rulebooks' }, { timeout: 30_000 });
    await expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    /* The history is a read path, so a signed-out reader gets the card menu too, minus the editing entries. */
    await expect(within(list).getAllByRole('button')).toHaveLength(2);
    await userEvent.click(within(list).getByRole('button', { name: 'Actions for Rules' }));
    await expect(waitForFrame(() => page.getByRole('menuitem', { name: 'Editions' }))).resolves.toHaveAttribute(
      'href',
      '/rulesets/classicrules/rulebooks/book-0/editions'
    );
    await expect(page.getByRole('menuitem', { name: 'Open HTML' })).toHaveAttribute('target', '_blank');
    await expect(page.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();
  },
});

/** The manage list at 260 px keeps its reorder and delete controls inside the width. */
export const ManageNarrow = meta.story({
  args: { path: '/rulesets/classicrules/edit' },
  globals: { viewport: { value: 'contentNarrow' } },
  play: async ({ canvasElement }) => {
    const list = within(
      await within(canvasElement.ownerDocument.body).findByRole('list', { name: 'Rulebooks' }, { timeout: 30_000 })
    );
    const controls = list.getAllByRole('button', { name: /^(Move|Delete) / });
    await expect(controls.length).toBeGreaterThan(0);
    await expectWithinWidth(canvasElement, controls);
  },
});
