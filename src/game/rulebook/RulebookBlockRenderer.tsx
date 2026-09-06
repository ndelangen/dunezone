import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';

import { FormattedText } from '../components/block/FormattedText';
import './RulebookRenderer.css';

const styles = {
  assetFigure: 'rulebookAssetFigure',
  blockCanvas: 'rulebookBlockCanvas',
  blockCanvasContent: 'rulebookBlockCanvasContent',
  missingAsset: 'rulebookMissingAsset',
  repeatedText: 'rulebookRepeatedText',
  ruleGroup: 'rulebookRuleGroup',
  textBlock: 'rulebookTextBlock',
} as const;

function blockAnchor(block: RulebookRenderBlockV1) {
  return block.anchor ? { id: block.anchor, 'data-rulebook-block-anchor': block.anchor } : {};
}

/** Renders one Block without Page or Region layout. Its caller supplies a Rulebook-sized container. */
export function RulebookBlockRenderer({ block }: Readonly<{ block: RulebookRenderBlockV1 }>) {
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

/** Gives one Block the paper, type scale, and width context it has on a Page, without rendering Page layout. */
export function RulebookBlockCanvas({ block }: Readonly<{ block: RulebookRenderBlockV1 }>) {
  return (
    <div className={styles.blockCanvas} data-rulebook-block-canvas>
      <div className={styles.blockCanvasContent}>
        <RulebookBlockRenderer block={block} />
      </div>
    </div>
  );
}
