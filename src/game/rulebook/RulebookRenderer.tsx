import { getRulebookLayout, getRulebookRegionOrder } from '@shared/rulebooks/contents';
import type { RulebookBlockRegionKey, RulebookPageLayoutId } from '@shared/rulebooks/contents';
import type {
  RulebookRenderBlockV1,
  RulebookRenderPageByLayoutV1,
  RulebookRenderPageV1,
  RulebookRenderPreviewDocumentV1,
} from '@shared/rulebooks/renderDocument';
import { DEFAULT_RULEBOOK_SETTINGS, getRulebookSize } from '@shared/rulebooks/settings';
import type { RulebookSettings } from '@shared/rulebooks/settings';
import type { ComponentType, CSSProperties, ReactElement } from 'react';

import { FormattedText } from '../components/block/FormattedText';
import { RulebookBlockRenderer } from './RulebookBlockRenderer';
import { RulebookDesignContext } from './RulebookDesignContext';
import './RulebookRenderer.css';

export const RULEBOOK_ARTWORK_HREF = '/page/bottom.svg';
export const RULEBOOK_COVER_LOGO_HREF = '/page/dune_logo.svg';

const styles = {
  chapterOpener: 'rulebookChapterOpener',
  document: 'rulebookDocument',
  eyebrow: 'rulebookEyebrow',
  introduction: 'rulebookIntroduction',
  page: 'rulebookPage',
  pageContent: 'rulebookPageContent',
  artwork: 'rulebookPageArtwork',
  folio: 'rulebookPageFolio',
  region: 'rulebookRegion',
  regionBlocks: 'rulebookRegionBlocks',
  rulesPage: 'rulebookRulesPage',
  visualReference: 'rulebookVisualReference',
  interior: 'rulebookInterior',
  grid: 'rulebookGrid',
  cover: 'rulebookCover',
  coverArtwork: 'rulebookCoverArtwork',
  coverSubtitle: 'rulebookCoverSubtitle',
  coverSupportingText: 'rulebookCoverSupportingText',
  imageCover: 'rulebookImageCover',
  coverBackground: 'rulebookCoverBackground',
  coverLogo: 'rulebookCoverLogo',
  coverTitles: 'rulebookCoverTitles',
} as const;

type RulebookBlockComponent = ComponentType<Readonly<{ block: RulebookRenderBlockV1 }>>;

function Region({
  BlockRenderer,
  page,
  regionKey,
  label,
}: Readonly<{
  BlockRenderer: RulebookBlockComponent;
  page: RulebookRenderPageV1;
  regionKey: RulebookBlockRegionKey;
  label?: string;
}>) {
  const region = page.regions.find(({ key }) => key === regionKey);
  if (!region) {
    return null;
  }
  return (
    <section className={styles.region} data-rulebook-region={regionKey}>
      {label ? <h2>{label}</h2> : null}
      <div className={styles.regionBlocks}>
        {region.blocks.map((block) => (
          <BlockRenderer block={block} key={block.id} />
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

function renderRegion(
  page: RulebookRenderPageV1,
  definition: RulebookLayout['regions'][number],
  BlockRenderer: RulebookBlockComponent
) {
  if (definition.kind !== 'block') {
    throw new Error('A rendered Rulebook region must be a Block region');
  }
  return (
    <Region
      BlockRenderer={BlockRenderer}
      page={page}
      regionKey={definition.key}
      label={definition.label}
      key={definition.key}
    />
  );
}

type PageLayoutProps<LayoutId extends RulebookPageLayoutId> = Readonly<{
  BlockRenderer: RulebookBlockComponent;
  page: RulebookRenderPageByLayoutV1<LayoutId>;
  pageNumber: number;
  coverLogoHref: string;
}>;

function ChapterOpener({ BlockRenderer, page }: PageLayoutProps<'chapter-opener'>) {
  const control = getRulebookLayout(page.layoutId).regions.find((region) => region.kind === 'control')!;
  const chapterLabel = page.controlValues[control.key];
  const definitions = getBlockRegions(page.layoutId);
  const regions = [renderRegion(page, definitions[0], BlockRenderer)] satisfies RenderedRegionsForLayout<
    typeof page.layoutId
  >;
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

function RulesPage({ BlockRenderer, page }: PageLayoutProps<'rules-page'>) {
  const control = getRulebookLayout(page.layoutId).regions.find((region) => region.kind === 'control')!;
  const guidance = page.controlValues[control.key];
  const definitions = getBlockRegions(page.layoutId);
  const regions = [
    renderRegion(page, definitions[0], BlockRenderer),
    renderRegion(page, definitions[1], BlockRenderer),
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

function VisualReference({ BlockRenderer, page }: PageLayoutProps<'visual-reference'>) {
  const definitions = getBlockRegions(page.layoutId);
  const regions = [
    renderRegion(page, definitions[0], BlockRenderer),
    renderRegion(page, definitions[1], BlockRenderer),
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

type InteriorLayoutId = 'single-column' | 'two-columns' | 'wide-narrow' | 'outer-rail' | 'band-columns';

function InteriorPage({ BlockRenderer, page, pageNumber }: PageLayoutProps<InteriorLayoutId>) {
  return (
    <div className={styles.interior} data-rulebook-show-heading={page.showHeading}>
      {page.showHeading ? (
        <header>
          <h1>{page.title}</h1>
        </header>
      ) : null}
      <div
        className={styles.grid}
        data-rulebook-grid={page.layoutId}
        data-wide-position={page.layoutId === 'wide-narrow' ? page.controlValues.widePosition : undefined}
        data-band-position={page.layoutId === 'band-columns' ? page.controlValues.bandPosition : undefined}
      >
        {getRulebookRegionOrder(page, pageNumber).map((key) => (
          <Region BlockRenderer={BlockRenderer} page={page} regionKey={key} key={key} />
        ))}
      </div>
    </div>
  );
}

function usesImageCover(page: RulebookRenderPageV1) {
  return (
    page.layoutId === 'cover' &&
    (page.controlValues.cover.backgroundImage !== undefined ||
      page.controlValues.cover.backgroundImageUrl !== undefined)
  );
}

function CoverPage({ page, coverLogoHref }: PageLayoutProps<'cover'>) {
  const { artwork, subtitle, supportingText, backgroundImage, backgroundImageUrl, showDuneLogo, showSubtitle } =
    page.controlValues.cover;
  if (usesImageCover(page)) {
    const imageUrl = backgroundImageUrl ?? backgroundImage?.url;
    return (
      <div className={styles.imageCover}>
        {imageUrl ? <img className={styles.coverBackground} src={imageUrl} alt="" /> : null}
        {showDuneLogo ? <img className={styles.coverLogo} src={coverLogoHref} alt="Dune" /> : null}
        <div className={styles.coverTitles}>
          {page.showHeading ? <h1>{page.title}</h1> : null}
          {showSubtitle !== false && subtitle ? <p className={styles.coverSubtitle}>{subtitle}</p> : null}
          {supportingText ? <p className={styles.coverSupportingText}>{supportingText}</p> : null}
        </div>
      </div>
    );
  }
  return (
    <div className={styles.cover}>
      <header>
        {showDuneLogo ? <img className={styles.coverLogo} src={coverLogoHref} alt="Dune" /> : null}
        {page.showHeading ? <h1>{page.title}</h1> : null}
        {showSubtitle !== false && subtitle ? <p className={styles.coverSubtitle}>{subtitle}</p> : null}
      </header>
      <div className={styles.coverArtwork}>
        {artwork.status === 'ready' ? (
          <img src={artwork.imageUrl} alt={artwork.name} data-asset-id={artwork.assetId} />
        ) : artwork.status === 'unavailable' ? (
          <div className="rulebookMissingAsset" role="img" aria-label="Referenced Asset is unavailable">
            <span aria-hidden>◇</span>
          </div>
        ) : null}
      </div>
      {supportingText ? <p className={styles.coverSupportingText}>{supportingText}</p> : null}
    </div>
  );
}

type RulebookPageRendererRegistry = {
  [LayoutId in RulebookPageLayoutId]: ComponentType<PageLayoutProps<LayoutId>>;
};

const rulebookPageRenderers = {
  'chapter-opener': ChapterOpener,
  'rules-page': RulesPage,
  'visual-reference': VisualReference,
  'single-column': InteriorPage,
  'two-columns': InteriorPage,
  'wide-narrow': InteriorPage,
  'outer-rail': InteriorPage,
  'band-columns': InteriorPage,
  cover: CoverPage,
} satisfies RulebookPageRendererRegistry;

function PageLayout<const LayoutId extends RulebookPageLayoutId>({
  BlockRenderer,
  page,
  pageNumber,
  coverLogoHref,
}: PageLayoutProps<LayoutId>) {
  const Layout = rulebookPageRenderers[page.layoutId] as ComponentType<PageLayoutProps<LayoutId>>;
  return <Layout BlockRenderer={BlockRenderer} page={page} pageNumber={pageNumber} coverLogoHref={coverLogoHref} />;
}

function pageDimensions(settings: RulebookSettings): CSSProperties {
  const { widthMm, heightMm } = getRulebookSize(settings.size);
  return {
    '--rulebook-page-width': `${widthMm}mm`,
    '--rulebook-page-height': `${heightMm}mm`,
    '--rulebook-page-ratio': `${widthMm} / ${heightMm}`,
    '--rulebook-mm': `${100 / widthMm}cqw`,
  } as CSSProperties;
}

/** Renders one Page without fetching, navigation, publication, or application UI. */
export function RulebookPageRenderer({
  blockRenderer: BlockRenderer = RulebookBlockRenderer,
  page,
  settings = DEFAULT_RULEBOOK_SETTINGS,
  pageNumber = 1,
  artworkHref = RULEBOOK_ARTWORK_HREF,
  coverLogoHref = RULEBOOK_COVER_LOGO_HREF,
}: Readonly<{
  /** Replaces Block bodies while preserving the Page layout. */
  blockRenderer?: RulebookBlockComponent;
  page: RulebookRenderPageV1;
  settings?: RulebookSettings;
  /** One-based position in the complete Rulebook, including independently rendered Pages. */
  pageNumber?: number;
  artworkHref?: string;
  coverLogoHref?: string;
}>) {
  return (
    <article
      id={page.anchor}
      className={styles.page}
      aria-label={`Rulebook page: ${page.title}`}
      data-rulebook-page
      data-rulebook-page-id={page.id}
      data-rulebook-page-anchor={page.anchor}
      data-rulebook-layout={page.layoutId}
      data-rulebook-image-cover={usesImageCover(page) || undefined}
      data-rulebook-size={settings.size}
      data-rulebook-design={settings.design}
      data-rulebook-page-number={pageNumber}
      data-rulebook-page-side={pageNumber % 2 === 0 ? 'left' : 'right'}
      style={pageDimensions(settings)}
    >
      {settings.design === 'illustrated' && !usesImageCover(page) ? (
        <div className={styles.artwork} aria-hidden="true">
          <img src={artworkHref} alt="" />
        </div>
      ) : null}
      <div className={styles.pageContent}>
        <RulebookDesignContext value={settings.design}>
          <PageLayout BlockRenderer={BlockRenderer} page={page} pageNumber={pageNumber} coverLogoHref={coverLogoHref} />
        </RulebookDesignContext>
      </div>
      {page.layoutId !== 'cover' ? (
        <span className={styles.folio} aria-label={`Page ${pageNumber}`}>
          {pageNumber}
        </span>
      ) : null}
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
  pageOffset = 0,
  artworkHref = RULEBOOK_ARTWORK_HREF,
  coverLogoHref = RULEBOOK_COVER_LOGO_HREF,
}: Readonly<{
  document: RulebookRenderPreviewDocumentV1;
  as?: 'main' | 'section';
  label?: string;
  /** Number of Pages preceding this document when rendering a publication batch. */
  pageOffset?: number;
  artworkHref?: string;
  coverLogoHref?: string;
}>) {
  const { widthMm, heightMm } = getRulebookSize(document.settings.size);
  return (
    <Element
      className={styles.document}
      data-rulebook-document
      aria-label={label}
      style={pageDimensions(document.settings)}
    >
      <style>{`@page rulebook { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`}</style>
      {document.pageOrder.flatMap((pageId, index) => {
        const page = document.pagesById[pageId];
        return page
          ? [
              <RulebookPageRenderer
                page={page}
                settings={document.settings}
                pageNumber={pageOffset + index + 1}
                artworkHref={artworkHref}
                coverLogoHref={coverLogoHref}
                key={page.id}
              />,
            ]
          : [];
      })}
    </Element>
  );
}
