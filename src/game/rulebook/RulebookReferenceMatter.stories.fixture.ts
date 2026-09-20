import type { RulebookBlockDraft } from '@shared/rulebooks/contents';
import { projectRulebookDraftRenderBlock } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookRenderPageV1 } from '@shared/rulebooks/renderDocument';

type ReferenceTable = Extract<RulebookBlockDraft, { kind: 'reference-table' }>;
type Credits = Extract<RulebookBlockDraft, { kind: 'credits' }>;

/** A faction quick reference of the kind the base rulebook closes with; the values are a specimen, not a rules edition. */
export function referenceTableFixture(): ReferenceTable {
  return {
    id: 'TABL',
    kind: 'reference-table',
    anchor: 'faction-quick-reference',
    columnOrder: ['FACT', 'SPCE', 'FRCE', 'REVV'],
    columnsById: {
      FACT: { id: 'FACT', label: 'Faction' },
      SPCE: { id: 'SPCE', label: 'Starting spice' },
      FRCE: { id: 'FRCE', label: 'Forces on Dune' },
      REVV: { id: 'REVV', label: 'Free revival' },
    },
    rowOrder: ['ATRE', 'HARK', 'FREM', 'EMPR', 'GUIL', 'BENE'],
    rowsById: {
      ATRE: { id: 'ATRE', cellsByColumnId: { FACT: '*Atreides*', SPCE: '10', FRCE: '10 in Arrakeen', REVV: '2' } },
      HARK: { id: 'HARK', cellsByColumnId: { FACT: '*Harkonnen*', SPCE: '10', FRCE: '10 in Carthag', REVV: '2' } },
      FREM: {
        id: 'FREM',
        cellsByColumnId: {
          FACT: '*Fremen*',
          SPCE: '3',
          FRCE: '10 across Sietch Tabr, False Wall South and False Wall West',
          REVV: '3',
        },
      },
      EMPR: { id: 'EMPR', cellsByColumnId: { FACT: '*Emperor*', SPCE: '10', REVV: '1' } },
      GUIL: {
        id: 'GUIL',
        cellsByColumnId: { FACT: '*Spacing Guild*', SPCE: '5', FRCE: '5 in Tuek’s Sietch', REVV: '1' },
      },
      BENE: {
        id: 'BENE',
        cellsByColumnId: { FACT: '*Bene Gesserit*', SPCE: '5', FRCE: '1 in the Polar Sink', REVV: '1' },
      },
    },
    note: 'Forces not listed on Dune begin in reserve off-planet. Free revival counts are per turn; further revivals cost spice.',
  };
}

export function creditsFixture(): Credits {
  return {
    id: 'CRED',
    kind: 'credits',
    anchor: 'credits',
    groupOrder: ['DSGN', 'ARTW', 'ZONE'],
    groupsById: {
      DSGN: {
        id: 'DSGN',
        heading: 'Game design',
        contributorOrder: ['EBER', 'KITT', 'OLOT'],
        contributorsById: {
          EBER: { id: 'EBER', name: 'Bill Eberle' },
          KITT: { id: 'KITT', name: 'Jack Kittredge' },
          OLOT: { id: 'OLOT', name: 'Peter Olotka' },
        },
      },
      ARTW: {
        id: 'ARTW',
        heading: 'Artwork and typesetting',
        contributorOrder: ['ILLU', 'TYPE'],
        contributorsById: {
          ILLU: { id: 'ILLU', name: 'Dune Zone', role: 'Board and card rendering' },
          TYPE: { id: 'TYPE', name: 'Dune Zone pattern study', role: 'Page design' },
        },
      },
      ZONE: {
        id: 'ZONE',
        heading: 'Rules compilation',
        contributorOrder: ['EDIT'],
        contributorsById: { EDIT: { id: 'EDIT', name: 'The Dune Zone editors', role: 'Editing and layout' } },
      },
    },
  };
}

export function referenceMatterPage(blocks: Array<ReferenceTable | Credits>): RulebookRenderPageV1 {
  return {
    id: 'REFM',
    anchor: 'reference-matter',
    title: 'Quick reference',
    layoutId: 'single-column',
    showHeading: true,
    controlValues: {},
    regions: [
      {
        key: 'content',
        blocks: blocks.map((block) => {
          const rendered = projectRulebookDraftRenderBlock(block, {});
          if (rendered.kind !== 'reference-table' && rendered.kind !== 'credits') {
            throw new Error('Expected a reference matter fixture');
          }
          return rendered;
        }),
      },
    ],
  };
}
