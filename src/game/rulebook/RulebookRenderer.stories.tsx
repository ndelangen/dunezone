import preview from '@sb/preview';
import { getRulebookLayout } from '@shared/rulebooks/contents';
import type { RulebookPageLayoutId } from '@shared/rulebooks/contents';
import type { RulebookRenderBlockV1, RulebookRenderPreviewDocumentV1 } from '@shared/rulebooks/renderDocument';
import { expect } from 'storybook/test';

import { RulebookDocumentRenderer, RulebookPageRenderer } from './RulebookRenderer';
import { createRulebookRenderDocumentFixture } from './RulebookRenderer.stories.fixture';

const document = createRulebookRenderDocumentFixture();
const rulesLayout = getRulebookLayout('rules-page');

function PageStory({ pageId }: Readonly<{ pageId: string }>) {
  const page = document.pagesById[pageId];
  if (!page) {
    throw new Error(`Unknown Rulebook fixture Page ${pageId}`);
  }
  return <RulebookPageRenderer page={page} />;
}

type FixtureBlockLocation<Kind extends RulebookRenderBlockV1['kind']> = Readonly<{
  pageId: string;
  regionKey: string;
  blockId: string;
  kind: Kind;
}>;

function requiredBlock<Kind extends RulebookRenderBlockV1['kind']>(
  previewDocument: RulebookRenderPreviewDocumentV1,
  location: FixtureBlockLocation<Kind>
): Extract<RulebookRenderBlockV1, { kind: Kind }> {
  const block = previewDocument.pagesById[location.pageId]?.regions
    .find(({ key }) => key === location.regionKey)
    ?.blocks.find(({ id }) => id === location.blockId);
  const { blockId, kind } = location;
  if (!block || block.kind !== kind) {
    throw new Error(`Expected the Rulebook fixture Block ${blockId} to be ${kind}`);
  }
  return block as Extract<RulebookRenderBlockV1, { kind: Kind }>;
}

function renderFixturePreview<Kind extends RulebookRenderBlockV1['kind']>(
  location: FixtureBlockLocation<Kind>,
  update: (block: Extract<RulebookRenderBlockV1, { kind: Kind }>) => void
) {
  const previewDocument: RulebookRenderPreviewDocumentV1 = createRulebookRenderDocumentFixture();
  update(requiredBlock(previewDocument, location));
  return <RulebookPageRenderer page={previewDocument.pagesById.RULE!} />;
}

const meta = preview.meta({
  component: PageStory,
  args: { pageId: 'RULE' },
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 'min(42rem, 92vw)', aspectRatio: '210 / 297' }}>
        <Story />
      </div>
    ),
  ],
});

export const RulesPage = meta.story();

/*
 * One small Block of each kind the catalogue accepts, used to fill a Region to its stated maximum.
 * Each carries a single short sentence, which is a size an author would plausibly write, not a floor: the render schemas accept an empty title, empty text and an empty item list, so a smaller Block exists.
 * What a green guard says is therefore that the Region holds its stated count at this size, and nothing about longer authored text.
 */
/* Annotated rather than inferred: indexing a map of differently-shaped literals by a union key is an overload set, not a call. */
const smallBlock: Record<RulebookRenderBlockV1['kind'], (id: string) => RulebookRenderBlockV1> = {
  text: (id) => ({ id, kind: 'text', text: 'A short rule sentence.' }),
  'rule-group': (id) => ({ id, kind: 'rule-group', title: 'Rule', text: 'A short rule sentence.' }),
  'repeated-text': (id) => ({ id, kind: 'repeated-text', items: [{ id: `${id}ITEM`, text: 'One item.' }] }),
  'asset-figure': (id) => ({
    id,
    kind: 'asset-figure',
    asset: {
      status: 'ready',
      assetId: 'Storm marker',
      name: 'Storm marker',
      type: 'token-disc',
      imageUrl: '/page/storm.svg',
    },
    text: 'A caption.',
  }),
};

const blockIds = ['AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE', 'FFFF'];

/**
 * Region and Block kind pairs the renderer does not keep the catalogue's promise for, each with the ticket that owns it.
 * The Examples Region accepts three `asset-figure` Blocks and paints one: `.rulebookAssetFigure img` caps at `30cqw`, a height chosen for a single figure, so three of them need more than the Region has at any Page width.
 * Listing them keeps this story green and complete at once, so a pair that starts holding shows up here as a stale entry rather than passing unnoticed.
 */
const regionsThatDoNotHoldTheirMaximum = new Map([['examples/asset-figure', 972]]);

/** One Page with every Block Region filled to the maximum the catalogue states, using the accepted Block kind at `kindIndex`, plus the Region-to-kind pairs it used. */
function pageAtRegionMaxima(layoutId: RulebookPageLayoutId, pageId: string, kindIndex: number) {
  const layout = getRulebookLayout(layoutId);
  const previewDocument = createRulebookRenderDocumentFixture();
  const page = previewDocument.pagesById[pageId];
  if (!page) {
    throw new Error(`Unknown Rulebook fixture Page ${pageId}`);
  }
  const pairs: string[] = [];
  for (const region of page.regions) {
    const definition = layout.regions.find((candidate) => candidate.key === region.key);
    if (definition?.kind !== 'block') {
      throw new Error(`Page ${pageId} renders ${region.key}, which is not a Block Region of ${layoutId}`);
    }
    const { maximum } = definition.cardinality;
    if (maximum === null) {
      throw new Error(`Region ${region.key} states no maximum, so a fixed Page cannot promise to hold it`);
    }
    if (maximum > blockIds.length) {
      throw new Error(
        `Region ${region.key} accepts ${maximum} Blocks and this story has ${blockIds.length} ids to give it`
      );
    }
    const kinds = definition.acceptedBlockKinds;
    const kind = kinds[kindIndex % kinds.length]!;
    region.blocks = Array.from({ length: maximum }, (_, index) =>
      smallBlock[kind](blockIds[index]!)
    ) as typeof region.blocks;
    pairs.push(`${region.key}/${kind}`);
  }
  return { page, pairs };
}

/* Regions accept different numbers of kinds, so stepping the index through the widest count renders every accepted kind of every Region at least once. */
function widestKindCount(layoutId: RulebookPageLayoutId) {
  return Math.max(
    ...getRulebookLayout(layoutId)
      .regions.filter((region) => region.kind === 'block')
      .map((region) => region.acceptedBlockKinds.length)
  );
}

function RegionMaximaStory({ layoutId, pageId }: Readonly<{ layoutId: RulebookPageLayoutId; pageId: string }>) {
  return (
    <>
      {Array.from({ length: widestKindCount(layoutId) }, (_, kindIndex) => {
        const { page, pairs } = pageAtRegionMaxima(layoutId, pageId, kindIndex);
        return (
          <div
            key={kindIndex}
            data-maxima-pairs={pairs.join(' ')}
            /* Its own A4 box: the meta decorator supplies one, and these cases are several. */
            style={{ width: 'min(42rem, 92vw)', aspectRatio: '210 / 297' }}
          >
            <RulebookPageRenderer page={page} />
          </div>
        );
      })}
    </>
  );
}

/**
 * Every Block Region holds the number of Blocks the catalogue says it accepts, for every Block kind it accepts.
 * A Region is `overflow: hidden` inside a fixed A4 Page, so a Block past its box is painted nowhere while every text source still counts it, which is what lets a share link resolve against words no reader can see (#961).
 * `getBoundingClientRect` reports layout position rather than painted position, so a clipped Block still reports the rect that proves it overflowed.
 *
 * This holds the structural case, a Region's own cardinality maximum at minimum Block size, and only that.
 * Authored text longer than the fixture's still overflows a fixed Page and the resolver still counts it;
 * which of those the Page's contract follows is the open call on #961.
 */
function blockEscapesRegion(block: DOMRect, region: DOMRect) {
  return (
    block.top < region.top || block.bottom > region.bottom || block.left < region.left || block.right > region.right
  );
}

/* Explicit comparator: the default sort orders by UTF-16 code unit, which is not the alphabetical order this reads as. */
function asSortedList(values: Iterable<string>) {
  /* Sorting a fresh copy, so the caller's collection is not reordered underneath it. */
  return [...values].sort((left, right) => left.localeCompare(right)).join(', ');
}

/** The Region and Block-kind pairs of one rendered Page whose Blocks do not all fit their Region. */
function pairsThatOverflow(host: HTMLElement, kindOfRegion: ReadonlyMap<string, string>) {
  const overflowing = new Set<string>();
  for (const region of host.querySelectorAll<HTMLElement>('[data-rulebook-region]')) {
    const regionRect = region.getBoundingClientRect();
    const key = region.dataset.rulebookRegion ?? '';
    const escapes = [...region.querySelectorAll<HTMLElement>('[data-rulebook-block-id]')].some((block) =>
      blockEscapesRegion(block.getBoundingClientRect(), regionRect)
    );
    if (escapes) {
      overflowing.add(kindOfRegion.get(key) ?? key);
    }
  }
  return overflowing;
}

async function expectRegionsHoldTheirMaximum({ canvasElement }: { canvasElement: HTMLElement }) {
  const cases = [...canvasElement.querySelectorAll<HTMLElement>('[data-maxima-pairs]')];
  if (cases.length === 0) {
    throw new Error('Expected the story to render at least one Page at its Region maxima');
  }
  for (const host of cases) {
    const pairs = (host.dataset.maximaPairs ?? '').split(' ');
    const kindOfRegion = new Map(pairs.map((pair) => [pair.split('/')[0] ?? '', pair]));
    const recorded = pairs.filter((pair) => regionsThatDoNotHoldTheirMaximum.has(pair));
    /* Comparing the whole set rather than asserting emptiness, so a pair that starts holding is as visible as one that stops. */
    await expect(asSortedList(pairsThatOverflow(host, kindOfRegion))).toBe(asSortedList(recorded));
  }
}

export const MaximumRulesPage = meta.story({
  render: () => <RegionMaximaStory layoutId="rules-page" pageId="RULE" />,
  play: expectRegionsHoldTheirMaximum,
});

export const MaximumVisualReference = meta.story({
  render: () => <RegionMaximaStory layoutId="visual-reference" pageId="REFS" />,
  play: expectRegionsHoldTheirMaximum,
});

export const MaximumChapterOpener = meta.story({
  render: () => <RegionMaximaStory layoutId="chapter-opener" pageId="CHAP" />,
  play: expectRegionsHoldTheirMaximum,
});

export const ChapterOpener = meta.story({
  args: { pageId: 'CHAP' },
});

export const VisualReference = meta.story({
  args: { pageId: 'REFS' },
});

export const InvalidLocalText = meta.story({
  render: () =>
    renderFixturePreview(
      {
        pageId: 'RULE',
        regionKey: rulesLayout.regions[1].key,
        blockId: 'TEXT',
        kind: 'text',
      },
      (block) => (block.text = 'An *unfinished draft stays visible as literal text.')
    ),
});

export const MissingAsset = meta.story({
  render: () =>
    renderFixturePreview(
      {
        pageId: 'RULE',
        regionKey: rulesLayout.regions[2].key,
        blockId: 'ASST',
        kind: 'asset-figure',
      },
      (block) => (block.asset = { status: 'unavailable', assetId: 'Storm marker' })
    ),
});

export const CompleteDocument = meta.story({
  decorators: [],
  parameters: { layout: 'fullscreen' },
  render: () => <RulebookDocumentRenderer document={document} />,
});
