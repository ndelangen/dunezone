import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';

import { isLight } from '../assets/utils/contrast';
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
  sectionHeading: 'rulebookSectionHeading',
  list: 'rulebookList',
  itemName: 'rulebookItemName',
  callout: 'rulebookCallout',
  attribution: 'rulebookAttribution',
  questionAnswer: 'rulebookQuestionAnswer',
  question: 'rulebookQuestion',
  answer: 'rulebookAnswer',
} as const;

function blockAnchor(block: RulebookRenderBlockV1) {
  return block.anchor ? { id: block.anchor, 'data-rulebook-block-anchor': block.anchor } : {};
}

/** Renders one Block without Page or Region layout. Its caller supplies a Rulebook-sized container. */
export function RulebookBlockRenderer({ block }: Readonly<{ block: RulebookRenderBlockV1 }>) {
  if (block.kind === 'text') {
    return (
      <div {...blockAnchor(block)} className={styles.textBlock} data-rulebook-block-id={block.id}>
        {block.name ? <h3>{block.name}</h3> : null}
        <FormattedText value={block.text} />
      </div>
    );
  }
  if (block.kind === 'section-heading') {
    const faction = block.faction.status === 'ready' ? block.faction : undefined;
    return (
      <h2
        {...blockAnchor(block)}
        className={styles.sectionHeading}
        data-rulebook-block-id={block.id}
        data-faction-id={block.faction.status === 'unselected' ? undefined : block.faction.factionId}
        title={faction?.name}
        style={
          faction ? { backgroundColor: faction.color, color: isLight(faction.color) ? '#21170f' : '#fff' } : undefined
        }
      >
        {block.title}
        {block.faction.status === 'unavailable' ? (
          <span className="rulebookUnavailableFaction"> Faction unavailable</span>
        ) : null}
      </h2>
    );
  }
  if (block.kind === 'list') {
    const List = block.style === 'numbered' ? 'ol' : 'ul';
    return (
      <div {...blockAnchor(block)} className={styles.list} data-rulebook-block-id={block.id}>
        <List>
          {block.items.map((item) => (
            <li data-rulebook-item-id={item.id} key={item.id}>
              {item.name ? <strong className={styles.itemName}>{item.name}</strong> : null}
              <FormattedText value={item.text} />
            </li>
          ))}
        </List>
      </div>
    );
  }
  if (block.kind === 'callout') {
    const Body = block.variant === 'quotation' ? 'blockquote' : 'div';
    return (
      <aside
        {...blockAnchor(block)}
        className={styles.callout}
        data-rulebook-block-id={block.id}
        data-callout-variant={block.variant}
      >
        {block.title ? <h3>{block.title}</h3> : null}
        <Body>
          <FormattedText value={block.text} />
        </Body>
        {block.variant === 'quotation' && block.attribution ? (
          <p className={styles.attribution}>{block.attribution}</p>
        ) : null}
      </aside>
    );
  }
  if (block.kind === 'question-answer') {
    return (
      <section {...blockAnchor(block)} className={styles.questionAnswer} data-rulebook-block-id={block.id}>
        {block.topic ? <h3>{block.topic}</h3> : null}
        <div className={styles.question}>
          <FormattedText value={block.question} />
        </div>
        <div className={styles.answer}>
          <strong>Answer:</strong>
          <div>
            <FormattedText value={block.answer} />
          </div>
        </div>
      </section>
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
