import type { RulebookRenderBlockV1, RulebookRenderSourceV1 } from '@shared/rulebooks/renderDocument';

import { useAsset } from '../assets/assetRenderMode';
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
  sourceVisual: 'rulebookSourceVisual',
  sourceUnavailable: 'rulebookSourceUnavailable',
  referencedIllustration: 'rulebookReferencedIllustration',
  inventory: 'rulebookInventory',
  inventoryItem: 'rulebookInventoryItem',
  inventoryDescription: 'rulebookInventoryDescription',
  inventoryQuantity: 'rulebookInventoryQuantity',
  factionIntroduction: 'rulebookFactionIntroduction',
  factionIdentity: 'rulebookFactionIdentity',
  factionRoster: 'rulebookFactionRoster',
  factionLeaders: 'rulebookFactionLeaders',
  factionRuler: 'rulebookFactionRuler',
  cardEntry: 'rulebookCardEntry',
  cardGroup: 'rulebookCardGroup',
  cardGuide: 'rulebookCardGuide',
  cardGuidance: 'rulebookCardGuidance',
  cardQuantity: 'rulebookCardQuantity',
} as const;

function blockAnchor(block: RulebookRenderBlockV1) {
  return block.anchor ? { id: block.anchor, 'data-rulebook-block-anchor': block.anchor } : {};
}

function sourceIdentity(source: RulebookRenderSourceV1) {
  if (source.status === 'unselected') {
    return {};
  }
  const reference = source.reference;
  return {
    'data-rulebook-source-kind': reference.kind,
    'data-asset-id': reference.kind === 'asset' ? reference.assetId : undefined,
    'data-faction-id':
      reference.kind === 'faction' || reference.kind === 'faction-member' ? reference.factionId : undefined,
    'data-member-id': reference.kind === 'faction-member' ? reference.memberId : undefined,
    'data-artwork-id': reference.kind === 'stock' ? reference.artworkId : undefined,
    'data-board-id': reference.kind === 'board' ? reference.boardId : undefined,
  };
}

function SourceVisual({ source }: Readonly<{ source: RulebookRenderSourceV1 }>) {
  const imageUrl = useAsset(source.status === 'ready' ? source.imageUrl : '');
  return (
    <div className={styles.sourceVisual} {...sourceIdentity(source)} data-source-status={source.status}>
      {source.status === 'ready' ? (
        <img src={imageUrl} alt={source.name} width={source.width} height={source.height} />
      ) : (
        <div
          className={styles.sourceUnavailable}
          role="img"
          aria-label={source.status === 'unavailable' ? 'Referenced source is unavailable' : 'No source selected'}
        >
          <span aria-hidden>◇</span>
          <span>{source.status === 'unavailable' ? 'Source unavailable' : 'No source selected'}</span>
        </div>
      )}
    </div>
  );
}

function SourceMember({ source, ruler = false }: Readonly<{ source: RulebookRenderSourceV1; ruler?: boolean }>) {
  return (
    <figure className={ruler ? styles.factionRuler : undefined}>
      <SourceVisual source={source} />
      <figcaption>
        {ruler ? <strong>Ruler</strong> : null}
        {source.status === 'ready' ? <span>{source.name}</span> : null}
      </figcaption>
    </figure>
  );
}

function FactionIntroduction({
  block,
}: Readonly<{ block: Extract<RulebookRenderBlockV1, { kind: 'faction-introduction' }> }>) {
  const faction = block.faction.status === 'ready' ? block.faction : undefined;
  return (
    <section
      {...blockAnchor(block)}
      className={styles.factionIntroduction}
      data-rulebook-block-id={block.id}
      data-faction-id={block.faction.status === 'unselected' ? undefined : block.faction.factionId}
    >
      {faction ? (
        <header className={styles.factionIdentity} style={{ borderColor: faction.color }}>
          {faction.emblemUrl ? <img src={faction.emblemUrl} alt="" /> : null}
          <h3>{faction.name}</h3>
        </header>
      ) : (
        <p>{block.faction.status === 'unavailable' ? 'Faction unavailable' : 'No faction selected'}</p>
      )}
      <FormattedText value={block.text} />
      {faction?.ruler || faction?.leaders?.length ? (
        <div className={styles.factionRoster}>
          {faction.ruler ? <SourceMember source={faction.ruler} ruler /> : null}
          {faction.leaders?.length ? (
            <div className={styles.factionLeaders}>
              {faction.leaders.map((source, index) => (
                <SourceMember
                  source={source}
                  key={source.status === 'unselected' ? `unselected-${index}` : JSON.stringify(source.reference)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CardGuide({
  source,
  text,
  quantity,
  grouped = false,
}: Readonly<{
  source: RulebookRenderSourceV1;
  text: string;
  quantity?: number;
  grouped?: boolean;
}>) {
  const Heading = grouped ? 'h4' : 'h3';
  return (
    <div className={styles.cardGuide}>
      <SourceVisual source={source} />
      <div className={styles.cardGuidance}>
        {source.status === 'ready' && source.name ? <Heading>{source.name}</Heading> : null}
        {quantity !== undefined ? <p className={styles.cardQuantity}>Quantity: {quantity}</p> : null}
        <FormattedText value={text} />
      </div>
    </div>
  );
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
  if (block.kind === 'referenced-illustration') {
    return (
      <figure {...blockAnchor(block)} className={styles.referencedIllustration} data-rulebook-block-id={block.id}>
        <SourceVisual source={block.source} />
        {block.caption ? <figcaption>{block.caption}</figcaption> : null}
      </figure>
    );
  }
  if (block.kind === 'illustrated-inventory') {
    return (
      <section {...blockAnchor(block)} className={styles.inventory} data-rulebook-block-id={block.id}>
        {block.title ? <h3>{block.title}</h3> : null}
        <FormattedText value={block.introduction} />
        <ul>
          {block.items.map((item) => (
            <li className={styles.inventoryItem} key={item.id} data-rulebook-item-id={item.id}>
              <figure>
                <SourceVisual source={item.source} />
                {item.caption ? <figcaption>{item.caption}</figcaption> : null}
              </figure>
              <div className={styles.inventoryDescription}>
                {item.source.status === 'ready' || item.quantity !== undefined ? (
                  <p>
                    {item.source.status === 'ready' ? <strong>{item.source.name}</strong> : null}
                    {item.quantity !== undefined ? (
                      <span className={styles.inventoryQuantity}>Quantity: {item.quantity}</span>
                    ) : null}
                  </p>
                ) : null}
                <FormattedText value={item.text} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  if (block.kind === 'faction-introduction') {
    return <FactionIntroduction block={block} />;
  }
  if (block.kind === 'card-entry') {
    return (
      <section {...blockAnchor(block)} className={styles.cardEntry} data-rulebook-block-id={block.id}>
        <CardGuide source={block.source} text={block.text} quantity={block.quantity} />
      </section>
    );
  }
  if (block.kind === 'card-group') {
    return (
      <section
        {...blockAnchor(block)}
        className={styles.cardGroup}
        data-rulebook-block-id={block.id}
        data-card-group-variant={block.variant}
      >
        {block.title ? <h3>{block.title}</h3> : null}
        <FormattedText value={block.text} />
        {block.items.length ? (
          <ul>
            {block.items.map((item) => (
              <li
                key={item.id}
                data-rulebook-item-id={item.id}
                data-card-featured={
                  block.variant === 'featured-member' && block.featuredItemId === item.id ? '' : undefined
                }
              >
                <CardGuide source={item.source} text={item.text} quantity={item.quantity} grouped />
              </li>
            ))}
          </ul>
        ) : null}
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
