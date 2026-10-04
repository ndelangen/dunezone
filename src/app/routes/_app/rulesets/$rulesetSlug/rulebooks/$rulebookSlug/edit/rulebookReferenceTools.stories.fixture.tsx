import { Box, Button, Stack } from '@mantine/core';
import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type { RulebookBlockDraft, RulebookContentsDraftV1, RulebookPageDraft } from '@shared/rulebooks/contents';
import { projectRulebookDraftRenderDocument } from '@shared/rulebooks/projectRenderDocument';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import { useReducer } from 'react';
import { fn } from 'storybook/test';

import { RulebookPageRenderer } from '@game/rulebook/RulebookRenderer';

import { rulebookBlockEditors } from './rulebookBlockEditors';
import { CardEntryEdit } from './rulebookCardBlockEditors';
import { PageDetailsEdit } from './rulebookPageDetailsEdit';
import { ReferencedIllustrationEdit } from './rulebookVisualBlockEditors';

function page(
  id: string,
  title: string,
  headingIcon: RulebookPageDraft['headingIcon'],
  blocks: RulebookBlockDraft[]
): RulebookPageDraft {
  return {
    id,
    anchor: id.toLowerCase(),
    title,
    headingIcon,
    layoutId: 'single-column',
    showHeading: true,
    controlValues: {},
    blockOrderByRegion: { content: blocks.map((block) => block.id) },
    blocksById: Object.fromEntries(blocks.map((block) => [block.id, block])),
  };
}

export function referenceToolsContents(): RulebookContentsDraftV1 {
  return rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['BTTL', 'CMPT', 'SPCE'],
    pagesById: {
      BTTL: page('BTTL', 'Battle', '/vector/icon/combat.svg', [
        {
          id: 'PLAN',
          kind: 'text',
          name: 'Weapons and defenses',
          text: 'A projectile weapon is stopped by a shield. A poison weapon is stopped by a snooper. Match the defense to the opposing weapon when you prepare your battle plan.',
          references: [{ pageId: 'CMPT', blockId: 'SHLD' }],
        },
        {
          id: 'TABL',
          kind: 'reference-table',
          anchor: 'weapons-and-defenses',
          columnOrder: ['WEPN', 'DEFS', 'RSLT'],
          columnsById: {
            WEPN: { id: 'WEPN', label: 'Weapon' },
            DEFS: { id: 'DEFS', label: 'Defense' },
            RSLT: { id: 'RSLT', label: 'Effect of this weapon' },
          },
          rowOrder: ['PRJC', 'PSNN'],
          rowsById: {
            PRJC: { id: 'PRJC', cellsByColumnId: { WEPN: 'Projectile', DEFS: 'Shield', RSLT: 'Stopped' } },
            PSNN: { id: 'PSNN', cellsByColumnId: { WEPN: 'Poison', DEFS: 'Snooper', RSLT: 'Stopped' } },
          },
          note: 'This table covers ordinary weapon and defense matches. Resolve card exceptions and the rest of the battle using their own rules.',
        },
        {
          id: 'EXMP',
          kind: 'callout',
          variant: 'example',
          title: 'Example: a matching defense',
          text: 'Your opponent reveals a projectile weapon. You reveal a shield. The shield stops that weapon; continue resolving the battle.',
        },
      ]),
      CMPT: page('CMPT', 'Cards and tokens', '/vector/icon/bidding_standalone.svg', [
        {
          id: 'SHLD',
          kind: 'card-entry',
          anchor: 'shield',
          name: 'Shield',
          source: { kind: 'stock', artworkId: '/vector/decal/shield.svg' },
          size: 'small',
          text: 'A defense against projectile weapons. Keep this entry beside the weapon reference when choosing your battle plan.',
        },
        {
          id: 'STMR',
          kind: 'card-entry',
          anchor: 'storm-marker',
          name: 'Storm marker',
          source: { kind: 'stock', artworkId: '/vector/icon/storrm_standalone.svg' },
          size: 'small',
          text: 'Marks the sector occupied by the storm. At the start of turn one, place the storm in a random sector.',
        },
      ]),
      SPCE: page('SPCE', 'Spice collection', '/vector/icon/collection_standalone.svg', [
        {
          id: 'FGRR',
          kind: 'referenced-illustration',
          source: { kind: 'stock', artworkId: '/vector/icon/spice.svg' },
          size: 'medium',
          caption: 'Spice is the currency of Dune.',
        },
        {
          id: 'TEXT',
          kind: 'text',
          name: 'Make the important pieces easy to find',
          text: 'Use a small illustration beside a short rule, or a larger illustration when readers need to inspect the component.',
        },
      ]),
    },
  });
}

type Example = 'heading' | 'component' | 'illustration' | 'references' | 'table';
type Action =
  | { kind: 'page'; page: RulebookPageDraft }
  | { kind: 'block'; pageId: string; block: RulebookBlockDraft }
  | { kind: 'move' }
  | { kind: 'remove' };
function reduce(contents: RulebookContentsDraftV1, action: Action): RulebookContentsDraftV1 {
  if (action.kind === 'move') {
    return {
      ...contents,
      pageOrder: contents.pageOrder[0] === 'BTTL' ? ['CMPT', 'BTTL', 'SPCE'] : ['BTTL', 'CMPT', 'SPCE'],
    };
  }
  if (action.kind === 'remove') {
    return {
      ...contents,
      pageOrder: contents.pageOrder.filter((id) => id !== 'CMPT'),
      pagesById: Object.fromEntries(Object.entries(contents.pagesById).filter(([id]) => id !== 'CMPT')),
    };
  }
  if (action.kind === 'page') {
    return { ...contents, pagesById: { ...contents.pagesById, [action.page.id]: action.page } };
  }
  const current = contents.pagesById[action.pageId]!;
  return {
    ...contents,
    pagesById: {
      ...contents.pagesById,
      [current.id]: { ...current, blocksById: { ...current.blocksById, [action.block.id]: action.block } },
    },
  };
}
const noAction = fn();

/** These controls edit the same authored values as the rulebook route; the preview uses the publication projection. */
export function ReferenceToolsStory({ example }: { example: Example }) {
  const [contents, dispatch] = useReducer(reduce, undefined, referenceToolsContents);
  const { document } = projectRulebookDraftRenderDocument(contents, {}, { size: 'square', design: 'illustrated' });
  const pageId = example === 'component' ? 'CMPT' : example === 'illustration' ? 'SPCE' : 'BTTL';
  const current = contents.pagesById[pageId]!;
  const shield = current.blocksById.SHLD;
  const figure = current.blocksById.FGRR;
  const text = current.blocksById.PLAN;
  const TextEdit = rulebookBlockEditors.text;
  const TableEdit = rulebookBlockEditors['reference-table'];
  return (
    <Box p="lg">
      <DocumentEditorLayout ratio={1} fit="width">
        <DocumentEditorLayout.Sidebar>
          {example === 'heading' ? (
            <PageDetailsEdit
              value={current}
              onChange={(value) => dispatch({ kind: 'page', page: { ...current, ...value } })}
              regions={[]}
              onNavigateBlock={noAction}
              onDeleteBlock={noAction}
              onAddBlock={noAction}
              onToggleBlockRegion={noAction}
              getBlockDropStatus={() => ({ allowed: true, reason: '' })}
              onBlockDrag={noAction}
            />
          ) : null}
          {example === 'component' && shield?.kind === 'card-entry' ? (
            <CardEntryEdit
              value={shield}
              onChange={(value) => dispatch({ kind: 'block', pageId, block: { ...shield, ...value } })}
              references={{ assetsById: {}, factionsById: {} }}
            />
          ) : null}
          {example === 'illustration' && figure?.kind === 'referenced-illustration' ? (
            <ReferencedIllustrationEdit
              value={figure}
              onChange={(value) => dispatch({ kind: 'block', pageId, block: { ...figure, ...value } })}
            />
          ) : null}
          {example === 'references' && text?.kind === 'text' ? (
            <Stack gap="md">
              <TextEdit
                value={text}
                onChange={(value) => dispatch({ kind: 'block', pageId, block: { ...text, ...value } })}
                references={{ assetsById: {}, factionsById: {}, contents }}
              />
              <Button onClick={() => dispatch({ kind: 'move' })} disabled={!contents.pagesById.CMPT}>
                Move component page
              </Button>
              <Button variant="subtle" onClick={() => dispatch({ kind: 'remove' })} disabled={!contents.pagesById.CMPT}>
                Remove component page
              </Button>
            </Stack>
          ) : null}
          {example === 'table' && current.blocksById.TABL?.kind === 'reference-table' ? (
            <TableEdit
              value={current.blocksById.TABL}
              onChange={(value) =>
                dispatch({
                  kind: 'block',
                  pageId,
                  block: { ...current.blocksById.TABL!, ...value, id: 'TABL', kind: 'reference-table' },
                })
              }
            />
          ) : null}
        </DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <Stack gap="lg">
            {(example === 'references' ? [pageId, ...contents.pageOrder.filter((id) => id !== pageId)] : [pageId]).map(
              (id) => (
                <RulebookPageRenderer
                  key={id}
                  page={document.pagesById[id]!}
                  pageNumber={contents.pageOrder.indexOf(id) + 1}
                  settings={{ size: 'square', design: 'illustrated' }}
                />
              )
            )}
          </Stack>
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}
