import { Box, Button, Stack } from '@mantine/core';
import { rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type { RulebookBlockDraft, RulebookContentsDraftV1, RulebookPageDraft } from '@shared/rulebooks/contents';
import { projectRulebookDraftRenderDocument } from '@shared/rulebooks/projectRenderDocument';
import { DocumentEditorLayout } from '@ui/layout/DocumentEditorLayout';
import type { ReactNode } from 'react';
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

function createIllustratedBook(): RulebookContentsDraftV1 {
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

type EditorContext = {
  contents: RulebookContentsDraftV1;
  current: RulebookPageDraft;
  dispatch: (action: Action) => void;
};

function blockEditorProps<Kind extends RulebookBlockDraft['kind']>(
  { current, dispatch }: EditorContext,
  blockId: string,
  kind: Kind
) {
  const block = current.blocksById[blockId];
  if (!block || block.kind !== kind) {
    throw new Error(`Expected ${kind} block ${blockId}`);
  }
  return {
    value: block as Extract<RulebookBlockDraft, { kind: Kind }>,
    onChange: (value: Partial<Extract<RulebookBlockDraft, { kind: Kind }>>) =>
      dispatch({ kind: 'block', pageId: current.id, block: { ...block, ...value } }),
  };
}

/** Each example edits the same authored values as the route and renders through the publication projection. */
function IllustratedBookPreview({
  pageId,
  renderEditor,
  showDestinations = false,
}: {
  pageId: string;
  renderEditor: (context: EditorContext) => ReactNode;
  showDestinations?: boolean;
}) {
  const [contents, dispatch] = useReducer(reduce, undefined, createIllustratedBook);
  const { document } = projectRulebookDraftRenderDocument(contents, {}, { size: 'square', design: 'illustrated' });
  const current = contents.pagesById[pageId]!;
  const previewPages = showDestinations ? [pageId, ...contents.pageOrder.filter((id) => id !== pageId)] : [pageId];
  return (
    <Box p="lg">
      <DocumentEditorLayout ratio={1} fit="width">
        <DocumentEditorLayout.Sidebar>{renderEditor({ contents, current, dispatch })}</DocumentEditorLayout.Sidebar>
        <DocumentEditorLayout.Preview>
          <Stack gap="lg">
            {previewPages.map((id) => (
              <RulebookPageRenderer
                key={id}
                page={document.pagesById[id]!}
                pageNumber={contents.pageOrder.indexOf(id) + 1}
                settings={{ size: 'square', design: 'illustrated' }}
              />
            ))}
          </Stack>
        </DocumentEditorLayout.Preview>
      </DocumentEditorLayout>
    </Box>
  );
}

export function HeadingIconStory() {
  return (
    <IllustratedBookPreview
      pageId="BTTL"
      renderEditor={({ current, dispatch }) => (
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
      )}
    />
  );
}

export function StockComponentStory() {
  return (
    <IllustratedBookPreview
      pageId="CMPT"
      renderEditor={(context) => (
        <CardEntryEdit
          {...blockEditorProps(context, 'SHLD', 'card-entry')}
          references={{ assetsById: {}, factionsById: {} }}
        />
      )}
    />
  );
}

export function IllustrationSizeStory() {
  return (
    <IllustratedBookPreview
      pageId="SPCE"
      renderEditor={(context) => (
        <ReferencedIllustrationEdit {...blockEditorProps(context, 'FGRR', 'referenced-illustration')} />
      )}
    />
  );
}

export function RelatedRulesStory() {
  const Editor = rulebookBlockEditors.text;
  return (
    <IllustratedBookPreview
      pageId="BTTL"
      showDestinations
      renderEditor={(context) => {
        const { contents, dispatch } = context;
        return (
          <Stack gap="md">
            <Editor
              {...blockEditorProps(context, 'PLAN', 'text')}
              references={{ assetsById: {}, factionsById: {}, contents }}
            />
            <Button onClick={() => dispatch({ kind: 'move' })} disabled={!contents.pagesById.CMPT}>
              Move component page
            </Button>
            <Button variant="subtle" onClick={() => dispatch({ kind: 'remove' })} disabled={!contents.pagesById.CMPT}>
              Remove component page
            </Button>
          </Stack>
        );
      }}
    />
  );
}

export function WeaponTableStory() {
  const Editor = rulebookBlockEditors['reference-table'];
  return (
    <IllustratedBookPreview
      pageId="BTTL"
      renderEditor={(context) => <Editor {...blockEditorProps(context, 'TABL', 'reference-table')} />}
    />
  );
}
