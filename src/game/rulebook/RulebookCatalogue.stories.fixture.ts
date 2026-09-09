import { getRulebookLayout, rulebookContentsV1Schema } from '@shared/rulebooks/contents';
import type { RulebookAuthoredLayoutId, RulebookBlockDraft } from '@shared/rulebooks/contents';
import { projectRulebookRenderDocument } from '@shared/rulebooks/projectRenderDocument';
import type { RulebookRenderPageV1 } from '@shared/rulebooks/renderDocument';
import { DEFAULT_RULEBOOK_SETTINGS } from '@shared/rulebooks/settings';

function writtenRuleBlocks(): RulebookBlockDraft[] {
  return [
    { id: 'HEAD', kind: 'section-heading', title: 'Shipment and movement', factionId: 'atreides' },
    {
      id: 'TEXT',
      kind: 'text',
      name: 'Moving your forces',
      text: 'Choose one group of forces. Move them together to an adjacent territory.\n\n*The storm closes a boundary.* Forces cannot cross it.',
    },
    {
      id: 'L5ST',
      kind: 'list',
      style: 'numbered',
      itemOrder: ['choose', 'move'],
      itemsById: {
        choose: { id: 'choose', name: 'Choose a group', text: 'Select forces in one territory.' },
        move: { id: 'move', name: 'Choose a destination', text: 'Move your chosen forces together.' },
      },
    },
    {
      id: 'NATE',
      kind: 'callout',
      variant: 'note',
      title: 'Occupancy',
      text: 'Check the destination before moving your forces.',
    },
    {
      id: 'EXAM',
      kind: 'callout',
      variant: 'example',
      title: 'Example',
      text: 'Three forces leave Arrakeen and arrive together in the Imperial Basin.',
    },
    {
      id: 'QUTE',
      kind: 'callout',
      variant: 'quotation',
      text: 'Plans within plans.',
      attribution: 'A Mentat reminder',
    },
    {
      id: 'QUES',
      kind: 'question-answer',
      topic: 'Moving together',
      question: 'May forces from different sectors move together?',
      answer: '*Yes.* Forces in the same territory form one group.',
    },
  ];
}

export function createCataloguePage(
  layoutId: RulebookAuthoredLayoutId,
  options: {
    widePosition?: 'left' | 'right';
    bandPosition?: 'top' | 'bottom';
    showHeading?: boolean;
    written?: boolean;
    empty?: boolean;
  } = {}
): RulebookRenderPageV1 {
  const definitions = getRulebookLayout(layoutId).regions.filter((region) => region.kind === 'block');
  const blocks = options.written
    ? writtenRuleBlocks()
    : definitions.map((region, index) => ({
        id: ['AAAA', 'BBBB', 'CCCC'][index]!,
        kind: 'text' as const,
        text: region.label,
      }));
  const blockOrderByRegion = Object.fromEntries(
    definitions.map((region, index) => [
      region.key,
      options.empty
        ? []
        : options.written
          ? blocks.filter((_, blockIndex) => blockIndex % definitions.length === index).map(({ id }) => id)
          : [blocks[index]!.id],
    ])
  );
  const controlValues =
    layoutId === 'wide-narrow'
      ? { widePosition: options.widePosition ?? 'left' }
      : layoutId === 'band-columns'
        ? { bandPosition: options.bandPosition ?? 'top' }
        : layoutId === 'cover'
          ? {
              cover: {
                artworkAssetId: 'storm',
                subtitle: 'A guide to Arrakis',
                supportingText: 'Rules, examples and faction reference',
              },
            }
          : {};
  const contents = rulebookContentsV1Schema.parse({
    schemaVersion: 1,
    pageOrder: ['PAGE'],
    pagesById: {
      PAGE: {
        id: 'PAGE',
        anchor: 'movement',
        title: layoutId === 'cover' ? 'Dune' : 'Movement',
        layoutId,
        showHeading: options.showHeading ?? true,
        controlValues,
        blockOrderByRegion,
        blocksById: Object.fromEntries((options.empty ? [] : blocks).map((block) => [block.id, block])),
      },
    },
  });
  return projectRulebookRenderDocument(
    contents,
    {
      storm: { assetId: 'storm', name: 'Storm marker', type: 'token-disc', imageUrl: '/page/storm.svg' },
    },
    DEFAULT_RULEBOOK_SETTINGS,
    {
      atreides: { factionId: 'atreides', name: 'Atreides', color: '#3e6337' },
    }
  ).pagesById.PAGE!;
}
