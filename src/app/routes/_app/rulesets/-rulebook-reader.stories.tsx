import preview from '@sb/preview';
import { createRulebookEditorialStarterContents } from '@shared/rulebooks/fixtures';
import { rulebookNameKey } from '@shared/rulebooks/metadata';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { db, ref } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { StorybookPage } from '../../-storybook';
import { encodeRulebookTextLocator } from './$rulesetSlug/rulebooks/$rulebookSlug/-rulebookReaderLinks';
import type { RulebookTextLocator } from './$rulesetSlug/rulebooks/$rulebookSlug/-rulebookReaderLinks';

const readerPath = '/rulesets/classicrules/rulebooks/rules-of-arrakis';
const movementLocator: RulebookTextLocator = {
  v: 1,
  path: [
    { kind: 'page', id: 'RULE' },
    { kind: 'block', id: 'MVVE' },
  ],
  exact: 'Movement sequence',
  suffix: 'Choose a force',
};
const staleLocator = encodeRulebookTextLocator({
  ...movementLocator,
  exact: 'Words removed from this Edition',
});
const missingLocator = encodeRulebookTextLocator({
  v: 1,
  path: [{ kind: 'page', id: 'ZZZZ' }],
  exact: 'Missing Page',
});

function withRulebookReader(baseline: StorybookDatabase) {
  const rulebookKey = 'rulebook:reader';
  const editionOne = createRulebookEditorialStarterContents();
  const editionTwo = structuredClone(editionOne);
  editionTwo.pagesById[editionTwo.pageOrder[0]]!.title = 'The gathered rules';
  baseline.rulebooks.push({
    $key: rulebookKey,
    ruleset_id: ref('ruleset:classicrules'),
    name: 'Rules of Arrakis',
    name_key: rulebookNameKey('Rules of Arrakis'),
    slug: 'rules-of-arrakis',
    sort_order: 0,
    current_edition_number: 2,
    created_by: ref('storybook-viewer'),
    created_at: '2026-07-01T12:00:00.000Z',
    updated_at: '2026-08-31T12:00:00.000Z',
    is_deleted: false,
    deleted_at: null,
  });
  baseline.rulebook_editions.push(
    {
      $key: 'rulebook-edition:reader:1',
      rulebook_id: ref(rulebookKey),
      edition_number: 1,
      created_by: ref('storybook-viewer'),
      created_at: '2026-07-01T12:00:00.000Z',
    },
    {
      $key: 'rulebook-edition:reader:2',
      rulebook_id: ref(rulebookKey),
      edition_number: 2,
      created_by: ref('storybook-viewer'),
      created_at: '2026-08-31T12:00:00.000Z',
    }
  );
  baseline.rulebook_edition_contents.push(
    {
      edition_id: ref('rulebook-edition:reader:1'),
      contents: editionOne,
    },
    {
      edition_id: ref('rulebook-edition:reader:2'),
      contents: editionTwo,
    }
  );
  return baseline;
}

const meta = preview.meta({
  title: 'Rulesets/Rulebook reader',
  component: StorybookPage,
  args: { path: readerPath },
  parameters: { layout: 'fullscreen', database: db(withRulebookReader) },
});

export const CurrentEdition = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Rules of Arrakis', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.getByText('Edition 2')).toBeVisible();
    expect(page.getByRole('heading', { name: 'The gathered rules' })).toBeVisible();
    const articles = page.getAllByRole('article');
    expect(articles).toHaveLength(3);
    expect(canvasElement.ownerDocument.defaultView?.getComputedStyle(articles[1]!).contentVisibility).toBe('auto');
  },
});

export const HistoricalEdition = meta.story({
  args: { path: `${readerPath}?edition=1` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Rules of Arrakis', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    /* The label goes through the dates module, so this reads the same in every locale and time zone rather than only in the one the runner happens to use. */
    expect(page.getByRole('combobox', { name: 'Rulebook Edition' })).toHaveValue('Edition 1, Jul 1, 2026');
    expect(page.getByRole('heading', { name: 'Welcome to Arrakis' })).toBeVisible();
    expect(page.queryByRole('heading', { name: 'The gathered rules' })).not.toBeInTheDocument();
  },
});

export const StaleSelectedText = meta.story({
  args: { path: `${readerPath}?loc=${staleLocator}` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByText(/The words changed, but the stable Page or Block link/, {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.getByRole('button', { name: 'Unpin linked target' })).toBeVisible();
    expect(page.getByRole('heading', { name: 'Movement' })).toBeVisible();
  },
});

export const HostileLocator = meta.story({
  args: { path: `${readerPath}?loc=%25%25%25` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('alert', {}, { timeout: 30_000 })).resolves.toHaveTextContent(
      'The link contains an invalid or oversized locator'
    );
    expect(canvasElement.ownerDocument.body).not.toHaveTextContent('<script>');
  },
});

export const MissingLocator = meta.story({
  args: { path: `${readerPath}?loc=${missingLocator}` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.findByRole('alert', {}, { timeout: 30_000 })).resolves.toHaveTextContent(
      'The linked target does not exist'
    );
    expect(page.getByRole('heading', { name: 'The gathered rules' })).toBeVisible();
  },
});

export const SelectedTextLink = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const heading = await page.findByRole('heading', { name: 'Movement sequence' }, { timeout: 30_000 });
    const selection = canvasElement.ownerDocument.defaultView?.getSelection();
    const range = canvasElement.ownerDocument.createRange();
    range.selectNodeContents(heading);
    selection?.removeAllRanges();
    selection?.addRange(range);
    await userEvent.click(page.getByRole('button', { name: 'Copy link to selected text' }));
    await expect(
      page.findByText(/Selected-text link copied|The link could not be copied/, {}, { timeout: 30_000 })
    ).resolves.toBeVisible();
  },
});

export const AnchoredPage = meta.story({
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const storyWindow = canvasElement.ownerDocument.defaultView;
    if (!storyWindow) {
      throw new Error('Rulebook reader Story requires a browser Window');
    }
    await expect(
      page.findByRole('heading', { name: 'Rules of Arrakis', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    storyWindow.location.hash = 'movement';
    await expect(
      page.findByRole('button', { name: 'Unpin linked target' }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    await userEvent.click(page.getByRole('button', { name: 'Unpin linked target' }));
    await expect(page.findByText('Tracking')).resolves.toBeVisible();
    await waitFor(() => expect(page.queryByRole('button', { name: 'Unpin linked target' })).not.toBeInTheDocument());

    storyWindow.location.hash = 'missing-page';
    await expect(page.findByRole('alert', {}, { timeout: 30_000 })).resolves.toHaveTextContent(
      'The linked target does not exist'
    );
    storyWindow.history.replaceState(
      storyWindow.history.state,
      '',
      `${storyWindow.location.pathname}${storyWindow.location.search}`
    );
  },
});

/**
 * A rejected `?edition` leaves the reader on the current Edition instead of an error frame.
 * The value has to be rejected by `validateSearch` and then not show through: a route's search is the parent match's search merged with the child's result, so a validator that omits a rejected key lets the raw one reach the loader and the Convex query.
 * Asserting the Edition selector rather than the heading is what makes that visible, since a reader that fell through to the raw value names it here.
 */
export const RejectedEditionFallsBackToCurrent = meta.story({
  args: { path: `${readerPath}?edition=abc` },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      page.findByRole('heading', { name: 'Rules of Arrakis', level: 1 }, { timeout: 30_000 })
    ).resolves.toBeVisible();
    expect(page.getByRole('combobox', { name: 'Rulebook Edition' })).toHaveValue('Edition 2, Aug 31, 2026');
  },
});
