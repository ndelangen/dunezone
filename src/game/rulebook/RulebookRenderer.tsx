import { getRulebookRegionOrder } from '@shared/rulebooks/contents';
import type { RulebookBlockRegionKey, RulebookPageLayoutId } from '@shared/rulebooks/contents';
import type {
  RulebookRenderBlockV1,
  RulebookRenderFactionV1,
  RulebookRenderPageByLayoutV1,
  RulebookRenderPageV1,
  RulebookRenderPreviewDocumentV1,
} from '@shared/rulebooks/renderDocument';
import { DEFAULT_RULEBOOK_SETTINGS, getRulebookSize } from '@shared/rulebooks/settings';
import type { RulebookSettings } from '@shared/rulebooks/settings';
import type { ComponentType, CSSProperties } from 'react';

import { Token } from '../assets/faction/token/Token';
import { RulebookBlockRenderer } from './RulebookBlockRenderer';
import { RulebookDesignContext } from './RulebookDesignContext';
import './RulebookRenderer.css';

export const RULEBOOK_ARTWORK_HREF = '/page/bottom.svg';
export const RULEBOOK_COVER_LOGO_HREF = '/page/dune_logo.svg';

const styles = {
  document: 'rulebookDocument',
  page: 'rulebookPage',
  pageContent: 'rulebookPageContent',
  artwork: 'rulebookPageArtwork',
  folio: 'rulebookPageFolio',
  region: 'rulebookRegion',
  regionBlocks: 'rulebookRegionBlocks',
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
  coverFooter: 'rulebookCoverFooter',
  coverFooterBand: 'rulebookCoverFooterBand',
  coverFooterEmblem: 'rulebookCoverFooterEmblem',
  coverFooterToken: 'rulebookCoverFooterToken',
  coverFooterTitle: 'rulebookCoverFooterTitle',
  coverFooterLabel: 'rulebookCoverFooterLabel',
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

type PageLayoutProps<LayoutId extends RulebookPageLayoutId> = Readonly<{
  BlockRenderer: RulebookBlockComponent;
  page: RulebookRenderPageByLayoutV1<LayoutId>;
  pageNumber: number;
  coverLogoHref: string;
}>;

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

function CoverFooterFaction({ faction }: Readonly<{ faction: RulebookRenderFactionV1 }>) {
  if (faction.status === 'unselected') {
    return null;
  }
  if (faction.status === 'unavailable') {
    return (
      <span role="img" aria-label="Faction unavailable" data-faction-id={faction.factionId}>
        ◇
      </span>
    );
  }
  if (faction.token) {
    return (
      <div className={styles.coverFooterToken} role="img" aria-label={faction.name} data-faction-id={faction.factionId}>
        <Token {...faction.token} />
      </div>
    );
  }
  return faction.emblemUrl ? (
    <img src={faction.emblemUrl} alt={faction.name} data-faction-id={faction.factionId} />
  ) : (
    <span data-faction-id={faction.factionId}>{faction.name}</span>
  );
}

function CoverFooter({ page }: Readonly<{ page: RulebookRenderPageByLayoutV1<'cover'> }>) {
  const { footer } = page.controlValues.cover;
  if (!footer?.enabled) {
    return null;
  }
  return (
    <footer className={styles.coverFooter} aria-label="Cover footer">
      <div className={styles.coverFooterBand}>
        <div className={styles.coverFooterEmblem}>
          <CoverFooterFaction faction={footer.leftFaction} />
        </div>
        <p className={styles.coverFooterTitle} data-rulebook-cover-footer-field="title">
          {footer.title}
        </p>
        <div className={styles.coverFooterEmblem}>
          <CoverFooterFaction faction={footer.rightFaction} />
        </div>
      </div>
      <p className={styles.coverFooterLabel} data-rulebook-cover-footer-field="label">
        {footer.label}
      </p>
    </footer>
  );
}

type RulebookPageRendererRegistry = {
  [LayoutId in RulebookPageLayoutId]: ComponentType<PageLayoutProps<LayoutId>>;
};

const rulebookPageRenderers = {
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
      data-rulebook-cover-footer={(page.layoutId === 'cover' && page.controlValues.cover.footer?.enabled) || undefined}
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
      {page.layoutId === 'cover' ? <CoverFooter page={page} /> : null}
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
