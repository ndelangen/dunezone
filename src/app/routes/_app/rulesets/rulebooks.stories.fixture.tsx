/*
 * The seeds and the meta the Rulebook page story files share (#1590).
 * `rulebooks.stories.tsx` holds the list, the reader and the editions, `rulebooks-creation.stories.tsx` the creation page, `rulebooks-editor.stories.tsx` the editor's navigation, warnings and publishing, and `rulebooks-editing.stories.tsx` the editing of Pages, Blocks and covers.
 */
import { rulebookEditionArtifactPath } from '@shared/rulebooks/editionArtifacts';
import { createRulebookEditorialStarterContents, createRulebookStarterContents } from '@shared/rulebooks/fixtures';
import { rulebookNameKey } from '@shared/rulebooks/metadata';
import { projectRulebookRenderDocument } from '@shared/rulebooks/projectRenderDocument';
import { DEFAULT_RULEBOOK_SETTINGS } from '@shared/rulebooks/settings';
import type { RulebookSettings } from '@shared/rulebooks/settings';

import { SEED_REF_TOKEN, db, ref, refText } from '@db/storybook';
import type { StorybookDatabase } from '@db/storybook';

import { StorybookPage, syncPreviewFrameHash } from '../../storybook';

/* Publication IDs are stored as strings, while the seed resolver can still replace its nested reference object. */
const publicationRef = (key: string) => ref(key) as unknown as string;

export function withRulebooks(baseline: StorybookDatabase, names = ['Rules', 'Quick reference', 'Deleted Rulebook']) {
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

export function withPublishedRulebooks(baseline: StorybookDatabase) {
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

export function withSizedRulebooks(baseline: StorybookDatabase) {
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

export function withFailedRulebookPreview(baseline: StorybookDatabase) {
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

export function replaceWithFinalContents(baseline: StorybookDatabase) {
  for (const draft of baseline.rulebook_drafts) {
    draft.contents = createRulebookEditorialStarterContents();
  }
  for (const edition of baseline.rulebook_edition_contents) {
    edition.contents = createRulebookEditorialStarterContents();
  }
}

export function withFinalRulebooks(baseline: StorybookDatabase) {
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

/**
 * The meta every Rulebook page story file spreads beside its title: the Ruleset's Rulebooks page, the hash sync, and a database of three Rulebooks.
 * A story passes its own `args.path` or `parameters.database` for another page or seed, and Storybook merges them over these.
 */
export const rulebooksMeta = {
  component: StorybookPage,
  args: { path: '/rulesets/classicrules' },
  beforeEach: syncPreviewFrameHash,
  parameters: { layout: 'fullscreen', database: db(withRulebooks) },
};
