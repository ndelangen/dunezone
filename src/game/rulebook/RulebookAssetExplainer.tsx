import {
  projectRulebookAssetExplainerAnnotations,
  rulebookAnnotationCanvas,
  rulebookAnnotationShapes,
  rulebookAnnotationUnavailableText,
} from '@shared/rulebooks/assetExplainerAnnotations';
import type { RulebookAnnotationProjection } from '@shared/rulebooks/assetExplainerAnnotations';
import type { RulebookRenderBlockV1 } from '@shared/rulebooks/renderDocument';
import { createElement, useContext, useState } from 'react';

import { useAsset } from '../assets/assetRenderMode';
import { FormattedText } from '../components/block/FormattedText';
import { RulebookDesignContext } from './RulebookDesignContext';

type AssetExplainer = Extract<RulebookRenderBlockV1, { kind: 'asset-explainer' }>;

function AnnotationDrawing({
  projection,
  imageUrl,
}: Readonly<{ projection: RulebookAnnotationProjection; imageUrl: string }>) {
  const shapes = rulebookAnnotationShapes(projection);
  const canvas = rulebookAnnotationCanvas(projection);
  return (
    <svg viewBox={canvas.viewBox} role="img" aria-label={projection.sourceName}>
      <image
        href={imageUrl}
        width={projection.width}
        height={projection.height}
        preserveAspectRatio="none"
        clipPath={projection.sourceKind === 'faction-member' ? 'circle(50%)' : undefined}
      />
      {shapes.map((shape, index) =>
        createElement(
          shape.tag,
          {
            key: index,
            ...Object.fromEntries(
              Object.entries(shape.attributes).map(([name, value]) => [
                name.startsWith('data-')
                  ? name
                  : name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
                value,
              ])
            ),
          },
          shape.text
        )
      )}
    </svg>
  );
}

/** Draws the referenced image and one full explanation legend from the Page's supplied data. */
export function RulebookAssetExplainer({ block }: Readonly<{ block: AssetExplainer }>) {
  const design = useContext(RulebookDesignContext);
  const source = block.source;
  const sourceUrl = source.status === 'ready' ? source.imageUrl : '';
  const alignedUrl =
    source.status === 'ready' &&
    source.geometry &&
    source.publicationRevision &&
    (source.reference.kind === 'asset' || source.reference.kind === 'faction-member')
      ? `${sourceUrl}${sourceUrl.includes('?') ? '&' : '?'}componentRevision=${encodeURIComponent(source.publicationRevision)}`
      : sourceUrl;
  const imageUrl = useAsset(alignedUrl);
  const [measuredImage, setMeasuredImage] = useState<{ url: string; width: number; height: number } | null>(null);
  const needsMeasurement = source.status === 'ready' && !source.geometry && !(source.width && source.height);
  const measurement = measuredImage?.url === imageUrl ? measuredImage : null;
  const renderSource =
    source.status === 'ready' && needsMeasurement && measurement
      ? { ...source, width: measurement.width, height: measurement.height }
      : source;
  const projection = projectRulebookAssetExplainerAnnotations({ ...block, source: renderSource }, design);
  const canvas = rulebookAnnotationCanvas(projection);
  return (
    <section
      id={block.anchor}
      data-rulebook-block-anchor={block.anchor}
      data-rulebook-block-id={block.id}
      data-rulebook-explainer
      data-source-status={block.source.status}
      data-rulebook-source-kind={projection.sourceKind}
      className="rulebookAssetExplainer"
    >
      <figure>
        <div className="rulebookExplainerIllustration">
          {block.illustrationUrl ? (
            <img src={block.illustrationUrl} alt={projection.sourceName} width={canvas.width} height={canvas.height} />
          ) : block.source.status === 'ready' ? (
            needsMeasurement && !measurement ? (
              <img
                src={imageUrl}
                alt={projection.sourceName}
                onLoad={(event) => {
                  const image = event.currentTarget;
                  if (image.naturalWidth && image.naturalHeight) {
                    setMeasuredImage({ url: imageUrl, width: image.naturalWidth, height: image.naturalHeight });
                  }
                }}
              />
            ) : (
              <AnnotationDrawing projection={projection} imageUrl={imageUrl} />
            )
          ) : (
            <div className="rulebookSourceUnavailable" role="img" aria-label={projection.sourceName}>
              {projection.sourceName}
            </div>
          )}
        </div>
        {block.caption ? <figcaption>{block.caption}</figcaption> : null}
      </figure>
      {projection.entries.length ? (
        <ol className="rulebookExplainerLegend" aria-label="Explanations">
          {projection.entries.map((entry) => (
            <li key={entry.id} data-rulebook-item-id={entry.id} data-target-status={entry.status}>
              <span
                className="rulebookExplainerBadge"
                style={{ backgroundColor: entry.color, color: entry.foreground }}
              >
                {entry.label}
              </span>
              <div>
                <h3>{entry.title}</h3>
                {entry.status !== 'ready' ? (
                  <p className="rulebookExplainerUnavailable">{rulebookAnnotationUnavailableText(entry.status)}</p>
                ) : null}
                {!entry.label ? <p className="rulebookExplainerUnavailable">Marker label is empty</p> : null}
                <FormattedText value={entry.text} />
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
