/* @vitest-environment edge-runtime */

import { expect, test } from 'vitest';

import { RULEBOOK_CATALOGUE_VERSION, rulebookContentsV1Schema } from '../src/shared/rulebooks/contents';
import { api } from './_generated/api';
import { rulebookFixture } from './rulebooks.test.fixture';

test('cloning keeps explanation targets and authored values while assigning fresh identities', async () => {
  const { owner, ids } = await rulebookFixture();
  const created = await owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: ids.rulesetId,
    name: 'Strongholds',
    source: { kind: 'starter' },
  });
  const source = { kind: 'board' as const, boardId: 'arrakis' };
  const contents = rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['PAGE'],
    pagesById: {
      PAGE: {
        id: 'PAGE',
        anchor: 'strongholds',
        title: 'Strongholds',
        layoutId: 'single-column',
        showHeading: true,
        controlValues: {},
        blockOrderByRegion: { content: ['EXPL'] },
        blocksById: {
          EXPL: {
            id: 'EXPL',
            kind: 'asset-explainer',
            source,
            caption: 'The surrounding board remains visible.',
            numbering: 'custom',
            colorMode: 'manual',
            itemOrder: ['second', 'first'],
            itemsById: {
              first: {
                id: 'first',
                label: 'A',
                color: '#246080',
                text: 'Arrakeen explanation',
                target: { kind: 'named', key: 'arrakeen', source },
              },
              second: {
                id: 'second',
                label: '!',
                color: '#805020',
                text: 'Positioned explanation',
                target: { kind: 'position', x: 0.2, y: 0.75, source },
              },
            },
          },
        },
      },
    },
  });
  await owner.mutation(api.rulebooks.save, { rulebook_id: created.rulebook._id, expected_revision: 1, contents });
  const cloned = await owner.mutation(api.rulebooks.create, {
    catalogue_version: RULEBOOK_CATALOGUE_VERSION,
    ruleset_id: ids.rulesetId,
    name: 'Cloned Strongholds',
    source: { kind: 'clone', rulebook_id: created.rulebook._id },
  });
  const clone = rulebookContentsV1Schema.parse(cloned.draft.contents);
  const page = clone.pagesById[clone.pageOrder[0]!];
  const block = Object.values(page.blocksById).find((block) => block.kind === 'asset-explainer');
  if (block?.kind !== 'asset-explainer') {
    throw new Error('Expected the cloned explanation Block');
  }
  expect(clone.pageOrder).not.toContain('PAGE');
  expect(block.id).not.toBe('EXPL');
  expect(block.itemOrder.some((id) => ['first', 'second'].includes(id))).toBe(false);
  expect(block.source).toEqual(source);
  expect(block).toMatchObject({
    caption: 'The surrounding board remains visible.',
    numbering: 'custom',
    colorMode: 'manual',
  });
  expect(block.itemsById[block.itemOrder[0]!]).toEqual({
    id: block.itemOrder[0],
    label: '!',
    color: '#805020',
    text: 'Positioned explanation',
    target: { kind: 'position', x: 0.2, y: 0.75, source },
  });
  expect(block.itemsById[block.itemOrder[1]!]).toEqual({
    id: block.itemOrder[1],
    label: 'A',
    color: '#246080',
    text: 'Arrakeen explanation',
    target: { kind: 'named', key: 'arrakeen', source },
  });
});
