import { createRulebookStarterContents } from '@shared/rulebooks/fixtures';
import { rulebookNameKey } from '@shared/rulebooks/metadata';

import { ref } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { encodeRulebookTextLocator } from './$rulesetSlug/rulebooks/$rulebookSlug/rulebookReaderLinks';
import type { RulebookTextLocator } from './$rulesetSlug/rulebooks/$rulebookSlug/rulebookReaderLinks';

export const readerPath = '/rulesets/classicrules/rulebooks/rules-of-arrakis';
export const movementLocator: RulebookTextLocator = {
  v: 1,
  path: [
    { kind: 'page', id: 'RULE' },
    { kind: 'block', id: 'MVVE' },
  ],
  exact: 'Movement sequence',
  suffix: 'Choose a troop',
};
export const movementLocatorParam = encodeRulebookTextLocator(movementLocator);
/*
 * Every wait in this file that observes an asynchronous result carries this bound, the same one the mount waits carry.
 * The results arrive from the reader's own timers and from Convex round trips, and on a loaded runner they arrive late: the library's one-second default at the time failed nine runs in four days on branches that never touched the reader (#995).
 * A bound is not a cost when the result arrives, and a result that never arrives still fails with the assertion that named it.
 */
export const SETTLE_TIMEOUT_MS = 30_000;

export function withRulebookReader(baseline: StorybookDatabase) {
  const rulebookKey = 'rulebook:reader';
  const editionOne = createRulebookStarterContents();
  const editionTwo = structuredClone(editionOne);
  editionTwo.pagesById[editionTwo.pageOrder[0]]!.title = 'The gathered rules';
  const historicalOnlyPage = editionTwo.pagesById.CHAP;
  if (historicalOnlyPage?.layoutId !== 'single-column') {
    throw new Error('The Rulebook reader fixture needs its opening Page');
  }
  historicalOnlyPage.blockOrderByRegion.content = [];
  delete historicalOnlyPage.blocksById.HERA;
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
