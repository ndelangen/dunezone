import type {
  RulebookRenderBlockV1,
  RulebookRenderPageV1,
  RulebookRenderPreviewDocumentV1,
} from '@shared/rulebooks/renderDocument';

import { FormattedText } from '../components/block/FormattedText';
import styles from './RulebookRenderer.module.css';

function blockAnchor(block: RulebookRenderBlockV1) {
  return block.anchor ? { id: block.anchor } : {};
}

function RulebookBlock({ block }: Readonly<{ block: RulebookRenderBlockV1 }>) {
  if (block.kind === 'text') {
    return (
      <div {...blockAnchor(block)} className={styles.textBlock} data-rulebook-block-id={block.id}>
        <FormattedText value={block.text} />
      </div>
    );
  }
  if (block.kind === 'repeated-text') {
    return (
      <div {...blockAnchor(block)} className={styles.repeatedText} data-rulebook-block-id={block.id}>
        <ul>
          {block.items.map((item) => (
            <li data-rulebook-item-id={item.id} key={item.id}>
              <FormattedText value={item.text} />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (block.kind === 'rule-group') {
    return (
      <section {...blockAnchor(block)} className={styles.ruleGroup} data-rulebook-block-id={block.id}>
        <h3>{block.title}</h3>
        <FormattedText value={block.text} />
      </section>
    );
  }

  const asset = block.asset;
  return (
    <figure {...blockAnchor(block)} className={styles.assetFigure} data-rulebook-block-id={block.id}>
      {asset.status === 'ready' ? (
        <img src={asset.imageUrl} alt={asset.name} data-asset-id={asset.assetId} />
      ) : (
        <div
          className={styles.missingAsset}
          role="img"
          aria-label={asset.status === 'unavailable' ? 'Referenced Asset is unavailable' : 'No Asset selected'}
        >
          <span aria-hidden>◇</span>
        </div>
      )}
      {block.text ? (
        <figcaption>
          <FormattedText value={block.text} />
        </figcaption>
      ) : null}
    </figure>
  );
}

function Region({
  page,
  regionKey,
  label,
}: Readonly<{ page: RulebookRenderPageV1; regionKey: string; label: string }>) {
  const region = page.regions.find(({ key }) => key === regionKey);
  if (!region) {
    return null;
  }
  return (
    <section className={styles.region} data-rulebook-region={regionKey}>
      <h2>{label}</h2>
      <div className={styles.regionBlocks}>
        {region.blocks.map((block) => (
          <RulebookBlock block={block} key={block.id} />
        ))}
      </div>
    </section>
  );
}

function ChapterOpener({ page }: Readonly<{ page: RulebookRenderPageV1 }>) {
  const chapterLabel = page.controlValues['chapter-label'];
  return (
    <div className={styles.chapterOpener}>
      <header>
        {typeof chapterLabel === 'string' && chapterLabel ? <p className={styles.eyebrow}>{chapterLabel}</p> : null}
        <h1>{page.title}</h1>
      </header>
      <Region page={page} regionKey="feature" label="Feature" />
    </div>
  );
}

function RulesPage({ page }: Readonly<{ page: RulebookRenderPageV1 }>) {
  const guidance = page.controlValues.guidance;
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
      <Region page={page} regionKey="rules" label="Rules" />
      <Region page={page} regionKey="examples" label="Examples" />
    </div>
  );
}

function VisualReference({ page }: Readonly<{ page: RulebookRenderPageV1 }>) {
  return (
    <div className={styles.visualReference}>
      <header>
        <p className={styles.eyebrow}>Reference</p>
        <h1>{page.title}</h1>
      </header>
      <Region page={page} regionKey="figures" label="Figures" />
      <Region page={page} regionKey="notes" label="Notes" />
    </div>
  );
}

/** Renders one Page without fetching, navigation, publication, or application UI. */
export function RulebookPageRenderer({ page }: Readonly<{ page: RulebookRenderPageV1 }>) {
  return (
    <article
      id={page.anchor}
      className={styles.page}
      aria-label={`Rulebook page preview: ${page.title}`}
      data-rulebook-page
      data-rulebook-page-id={page.id}
      data-rulebook-layout={page.layoutId}
    >
      <div className={styles.pageContent}>
        {page.layoutId === 'chapter-opener' ? (
          <ChapterOpener page={page} />
        ) : page.layoutId === 'rules-page' ? (
          <RulesPage page={page} />
        ) : (
          <VisualReference page={page} />
        )}
      </div>
    </article>
  );
}

/** Renders every Page from the same document used by independent Page capture. */
export function RulebookDocumentRenderer({ document }: Readonly<{ document: RulebookRenderPreviewDocumentV1 }>) {
  return (
    <main className={styles.document} data-rulebook-document>
      {document.pageOrder.flatMap((pageId) => {
        const page = document.pagesById[pageId];
        return page ? [<RulebookPageRenderer page={page} key={page.id} />] : [];
      })}
    </main>
  );
}
