import { getRulebookLayout } from '@shared/rulebooks/contents';
import type { RulebookBlockRegionKey, RulebookPageLayoutId } from '@shared/rulebooks/contents';
import type {
  RulebookRenderPageByLayoutV1,
  RulebookRenderPageV1,
  RulebookRenderPreviewDocumentV1,
} from '@shared/rulebooks/renderDocument';
import type { ComponentType, ReactElement } from 'react';

import { FormattedText } from '../components/block/FormattedText';
import { RulebookBlockRenderer } from './RulebookBlockRenderer';
import './RulebookRenderer.css';

const styles = {
  chapterOpener: 'rulebookChapterOpener',
  document: 'rulebookDocument',
  eyebrow: 'rulebookEyebrow',
  introduction: 'rulebookIntroduction',
  page: 'rulebookPage',
  pageContent: 'rulebookPageContent',
  region: 'rulebookRegion',
  regionBlocks: 'rulebookRegionBlocks',
  rulesPage: 'rulebookRulesPage',
  visualReference: 'rulebookVisualReference',
} as const;

function Region({
  page,
  regionKey,
  label,
}: Readonly<{
  page: RulebookRenderPageV1;
  regionKey: RulebookBlockRegionKey;
  label: string;
}>) {
  const region = page.regions.find(({ key }) => key === regionKey);
  if (!region) {
    return null;
  }
  return (
    <section className={styles.region} data-rulebook-region={regionKey}>
      <h2>{label}</h2>
      <div className={styles.regionBlocks}>
        {region.blocks.map((block) => (
          <RulebookBlockRenderer block={block} key={block.id} />
        ))}
      </div>
    </section>
  );
}

type RulebookLayout = ReturnType<typeof getRulebookLayout>;
type BlockRegionDefinitions<Regions extends readonly unknown[]> = Regions extends readonly [infer Region, ...infer Rest]
  ? Region extends { kind: 'block' }
    ? [Region, ...BlockRegionDefinitions<Rest>]
    : BlockRegionDefinitions<Rest>
  : [];
type BlockRegionsForLayout<LayoutId extends RulebookPageLayoutId> = BlockRegionDefinitions<
  Extract<RulebookLayout, { id: LayoutId }>['regions']
>;
type RenderedRegionNodes<Regions extends readonly unknown[]> = Regions extends readonly [unknown, ...infer Rest]
  ? [ReactElement, ...RenderedRegionNodes<Rest>]
  : [];
type RenderedRegionsForLayout<LayoutId extends RulebookPageLayoutId> = RenderedRegionNodes<
  BlockRegionsForLayout<LayoutId>
>;

function getBlockRegions<const LayoutId extends RulebookPageLayoutId>(layoutId: LayoutId) {
  return getRulebookLayout(layoutId).regions.filter(
    (region) => region.kind === 'block'
  ) as unknown as BlockRegionsForLayout<LayoutId>;
}

function renderRegion(page: RulebookRenderPageV1, definition: RulebookLayout['regions'][number]) {
  if (definition.kind !== 'block') {
    throw new Error('A rendered Rulebook region must be a Block region');
  }
  return <Region page={page} regionKey={definition.key} label={definition.label} key={definition.key} />;
}

function ChapterOpener({ page }: Readonly<{ page: RulebookRenderPageByLayoutV1<'chapter-opener'> }>) {
  const control = getRulebookLayout(page.layoutId).regions.find((region) => region.kind === 'control')!;
  const chapterLabel = page.controlValues[control.key];
  const definitions = getBlockRegions(page.layoutId);
  const regions = [renderRegion(page, definitions[0])] satisfies RenderedRegionsForLayout<typeof page.layoutId>;
  return (
    <div className={styles.chapterOpener}>
      <header>
        {typeof chapterLabel === 'string' && chapterLabel ? <p className={styles.eyebrow}>{chapterLabel}</p> : null}
        <h1>{page.title}</h1>
      </header>
      {regions}
    </div>
  );
}

function RulesPage({ page }: Readonly<{ page: RulebookRenderPageByLayoutV1<'rules-page'> }>) {
  const control = getRulebookLayout(page.layoutId).regions.find((region) => region.kind === 'control')!;
  const guidance = page.controlValues[control.key];
  const definitions = getBlockRegions(page.layoutId);
  const regions = [
    renderRegion(page, definitions[0]),
    renderRegion(page, definitions[1]),
  ] satisfies RenderedRegionsForLayout<typeof page.layoutId>;
  return (
    <div className={styles.rulesPage}>
      <header>
        {typeof guidance === 'object' && guidance.eyebrow ? <p className={styles.eyebrow}>{guidance.eyebrow}</p> : null}
        <h1>{page.title}</h1>
        {typeof guidance === 'object' && guidance.introduction ? (
          <div className={styles.introduction}>
            <FormattedText value={guidance.introduction} />
          </div>
        ) : null}
      </header>
      {regions}
    </div>
  );
}

function VisualReference({ page }: Readonly<{ page: RulebookRenderPageByLayoutV1<'visual-reference'> }>) {
  const definitions = getBlockRegions(page.layoutId);
  const regions = [
    renderRegion(page, definitions[0]),
    renderRegion(page, definitions[1]),
  ] satisfies RenderedRegionsForLayout<typeof page.layoutId>;
  return (
    <div className={styles.visualReference}>
      <header>
        <p className={styles.eyebrow}>Reference</p>
        <h1>{page.title}</h1>
      </header>
      {regions}
    </div>
  );
}

type RulebookPageRendererRegistry = {
  [LayoutId in RulebookPageLayoutId]: ComponentType<Readonly<{ page: RulebookRenderPageByLayoutV1<LayoutId> }>>;
};

const rulebookPageRenderers = {
  'chapter-opener': ChapterOpener,
  'rules-page': RulesPage,
  'visual-reference': VisualReference,
} satisfies RulebookPageRendererRegistry;

function PageLayout<const LayoutId extends RulebookPageLayoutId>({
  page,
}: Readonly<{ page: RulebookRenderPageByLayoutV1<LayoutId> }>) {
  const Layout = rulebookPageRenderers[page.layoutId] as ComponentType<
    Readonly<{ page: RulebookRenderPageByLayoutV1<LayoutId> }>
  >;
  return <Layout page={page} />;
}

/** Renders one Page without fetching, navigation, publication, or application UI. */
export function RulebookPageRenderer({ page }: Readonly<{ page: RulebookRenderPageV1 }>) {
  return (
    <article
      id={page.anchor}
      className={styles.page}
      aria-label={`Rulebook page: ${page.title}`}
      data-rulebook-page
      data-rulebook-page-id={page.id}
      data-rulebook-page-anchor={page.anchor}
      data-rulebook-layout={page.layoutId}
    >
      <div className={styles.pageContent}>
        <PageLayout page={page} />
      </div>
    </article>
  );
}

/**
 * Renders every Page from the same document used by independent Page capture.
 * The caller owns the landmark, because a reader route already sits inside its own `main`.
 */
export function RulebookDocumentRenderer({
  document,
  as: Element = 'main',
  label,
}: Readonly<{
  document: RulebookRenderPreviewDocumentV1;
  as?: 'main' | 'section';
  label?: string;
}>) {
  return (
    <Element className={styles.document} data-rulebook-document aria-label={label}>
      {document.pageOrder.flatMap((pageId) => {
        const page = document.pagesById[pageId];
        return page ? [<RulebookPageRenderer page={page} key={page.id} />] : [];
      })}
    </Element>
  );
}
