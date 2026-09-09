import { getRulebookSize } from '@shared/rulebooks/settings';
import { useId } from 'react';
import type { CSSProperties } from 'react';

import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { FormattedText } from '@game/components/block/FormattedText';
import { factionTokenFixtures } from '@game/fixtures/factionTokens';

import {
  getBoardRotation,
  getSourceName,
  getTargetName,
  getTargets,
  resolveTarget,
} from './assetExplainerPrototypeData';
import type { DisplayEntry, Revision, Source, Target } from './assetExplainerPrototypeData';
import styles from './assetExplainerPrototypeVisual.module.css';

const mapHref = '/vector/background/map.svg';

function markerForeground(color: string) {
  const hex = color.slice(1);
  const fullHex = hex.length === 3 ? [...hex].map((digit) => `${digit}${digit}`).join('') : hex;
  const linearChannel = (start: number) => {
    const channel = Number.parseInt(fullHex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * linearChannel(0) + 0.7152 * linearChannel(2) + 0.0722 * linearChannel(4);
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

function markerPosition(source: Source, target: Target) {
  if (source.kind !== 'leader') {
    return target;
  }
  const placements: Record<string, { x: number; y: number }> = {
    portrait: { x: 0.1, y: 0.28 },
    strength: { x: 0.96, y: 0.44 },
    'faction-emblem': { x: 0.94, y: 0.78 },
    name: { x: 0.13, y: 0.9 },
  };
  return placements[target.key] ?? target;
}

function LeaderImage({ source, revision }: { source: Source; revision: Revision }) {
  const faction = source.factionId === 'fremen' ? factionTokenFixtures.fremen : factionTokenFixtures.atreides;
  const image =
    source.leaderId === 'gurney'
      ? '/image/leader/official/gurney.png'
      : source.leaderId === 'stilgar'
        ? '/image/leader/official/stilgar.png'
        : '/image/leader/official/paul.jpg';
  const strength = source.leaderId === 'stilgar' ? 7 : source.leaderId === 'gurney' ? 4 : 5;
  return (
    <div className={styles.leaderImage}>
      <LeaderToken
        {...faction}
        image={image}
        name={getSourceName(source, revision)}
        strength={revision === 'missing-part' ? '' : String(strength + (revision === 'updated' ? 1 : 0))}
      />
    </div>
  );
}

/** Callers own the entries and selection; this prototype draws the source and its linked targets. */
export function AssetExplainerIllustration({
  source,
  revision,
  entries,
  selectedId,
  onPickTarget,
  onPlace,
}: {
  source: Source;
  revision: Revision;
  entries: DisplayEntry[];
  selectedId?: string;
  onPickTarget?: (key: string) => void;
  onPlace?: (x: number, y: number) => void;
}) {
  const prefix = useId().replaceAll(':', '');
  const Stage = onPlace ? 'button' : 'div';
  const targets = getTargets(source, revision);
  const selected = entries.find((entry) => entry.id === selectedId);
  const selectedKey = selected?.target.kind === 'named' ? selected.target.key : undefined;
  const rotation = getBoardRotation(revision);
  const resolved = entries.flatMap((entry) => {
    const target = resolveTarget(source, revision, entry.target);
    return target ? [{ entry, target, marker: markerPosition(source, target) }] : [];
  });
  return (
    <div className={styles.illustration} data-asset-explainer-source={source.id}>
      <Stage
        className={styles.imageStage}
        data-placement={Boolean(onPlace)}
        data-source-kind={source.kind}
        type={onPlace ? 'button' : undefined}
        role={onPlace ? undefined : 'img'}
        aria-label={onPlace ? `Place a marker on ${source.name}` : getSourceName(source, revision)}
        onClick={
          onPlace && revision !== 'unavailable'
            ? (event) => {
                const box = event.currentTarget.getBoundingClientRect();
                onPlace(
                  Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
                  Math.max(0, Math.min(1, (event.clientY - box.top) / box.height))
                );
              }
            : undefined
        }
        onKeyDown={
          onPlace && revision !== 'unavailable'
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onPlace(0.5, 0.5);
                }
              }
            : undefined
        }
      >
        {revision === 'unavailable' ? (
          <div className={styles.unavailableImage}>
            <strong>Image unavailable</strong>
            <span>{source.name}</span>
          </div>
        ) : (
          <>
            {source.kind === 'leader' ? <LeaderImage source={source} revision={revision} /> : null}
            <svg className={styles.overlay} viewBox="0 0 100 100" aria-hidden="true">
              {source.kind === 'board' ? (
                <g transform={`rotate(${rotation} 50 50)`}>
                  <use href={`${mapHref}#root`} />
                </g>
              ) : null}
              <defs>
                {resolved.map(({ entry, target }) =>
                  target.fragmentId ? (
                    <mask
                      key={entry.id}
                      id={`${prefix}-${entry.id}`}
                      maskUnits="userSpaceOnUse"
                      x="0"
                      y="0"
                      width="100"
                      height="100"
                      style={{ maskType: 'alpha' }}
                    >
                      <g transform={`rotate(${rotation} 50 50)`}>
                        <use href={`${mapHref}#${target.fragmentId}`} />
                      </g>
                    </mask>
                  ) : null
                )}
              </defs>
              {resolved.map(({ entry, target, marker }) => (
                <g key={entry.id}>
                  {target.fragmentId ? (
                    <rect
                      width="100"
                      height="100"
                      mask={`url(#${prefix}-${entry.id})`}
                      fill={entry.color}
                      opacity={entry.id === selectedId ? 0.72 : 0.46}
                    />
                  ) : null}
                  {source.kind === 'leader' && target.key !== 'position' ? (
                    <line
                      x1={target.x * 100}
                      y1={target.y * 100}
                      x2={marker.x * 100}
                      y2={marker.y * 100}
                      stroke={entry.color}
                      strokeWidth="0.65"
                    />
                  ) : null}
                </g>
              ))}
              {onPickTarget && !onPlace
                ? targets.map((target) => (
                    <g
                      key={target.key}
                      className={styles.targetHit}
                      transform={source.kind === 'board' ? `rotate(${rotation} 50 50)` : undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        onPickTarget(target.key);
                      }}
                    >
                      {target.fragmentId ? <use href={`${mapHref}#${target.fragmentId}`} /> : null}
                      {target.path ? <path d={target.path} /> : null}
                    </g>
                  ))
                : null}
            </svg>
            {resolved.map(({ entry, marker }) => (
              <span
                className={styles.marker}
                data-selected={entry.id === selectedId}
                data-entry-id={entry.id}
                key={entry.id}
                style={
                  {
                    left: `${marker.x * 100}%`,
                    top: `${marker.y * 100}%`,
                    '--marker-color': entry.color,
                    color: markerForeground(entry.color),
                  } as CSSProperties
                }
              >
                {entry.label}
              </span>
            ))}
          </>
        )}
      </Stage>
      {onPickTarget ? (
        <div className={styles.targetChoices} aria-label="Named parts">
          {targets.map((target) => (
            <button
              type="button"
              key={target.key}
              aria-pressed={selectedKey === target.key}
              onClick={() => onPickTarget(target.key)}
            >
              {target.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AssetExplainerPrint({
  source,
  revision,
  entries,
  caption,
  showLegend,
}: {
  source: Source;
  revision: Revision;
  entries: DisplayEntry[];
  caption: string;
  showLegend: boolean;
}) {
  return (
    <div className={styles.printComposition} data-kind={source.kind} data-prototype-block="asset-explainer">
      <figure className={styles.printFigure}>
        <AssetExplainerIllustration source={source} revision={revision} entries={entries} />
        {caption ? <figcaption>{caption}</figcaption> : null}
        {showLegend ? (
          <ol className={styles.legend} aria-label="Legend">
            {entries.map((entry) => (
              <li key={entry.id}>
                <span style={{ background: entry.color, color: markerForeground(entry.color) }}>{entry.label}</span>
                {getTargetName(entry.target)}
              </li>
            ))}
          </ol>
        ) : null}
      </figure>
      <ol className={styles.explanations}>
        {entries.map((entry) => (
          <li key={entry.id} data-entry-id={entry.id}>
            <span
              className={styles.entryNumber}
              style={{ background: entry.color, color: markerForeground(entry.color) }}
            >
              {entry.label}
            </span>
            <div>
              <h2>{getTargetName(entry.target)}</h2>
              {entry.text ? (
                <div className={styles.explanationText}>
                  <FormattedText value={entry.text} />
                </div>
              ) : null}
              {!resolveTarget(source, revision, entry.target) ? (
                <p className={styles.unavailableTarget}>Target unavailable. Explanation retained.</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A contained, fixed-format Page composes independent Blocks for the authoring prototype. */
export function AssetExplainerPagePreview({
  source,
  revision,
  entries,
  headingBlock,
  introductionBlock,
  caption,
  showLegend,
  format,
}: {
  source: Source;
  revision: Revision;
  entries: DisplayEntry[];
  headingBlock: { id: string; kind: 'section-heading'; title: string };
  introductionBlock: { id: string; kind: 'text'; text: string };
  caption: string;
  showLegend: boolean;
  format: 'a4' | 'tall';
}) {
  const { widthMm, heightMm } = getRulebookSize(format);
  return (
    <article
      className={styles.printPage}
      data-format={format}
      data-asset-explainer-print
      style={
        {
          '--print-unit': `${100 / widthMm}cqw`,
          aspectRatio: `${widthMm} / ${heightMm}`,
          maxWidth: `${widthMm}mm`,
        } as CSSProperties
      }
    >
      <div className={styles.printBody}>
        {headingBlock.title ? (
          <h1 data-prototype-block={headingBlock.kind} data-block-id={headingBlock.id}>
            {headingBlock.title}
          </h1>
        ) : null}
        {introductionBlock.text ? (
          <div
            className={styles.introduction}
            data-prototype-block={introductionBlock.kind}
            data-block-id={introductionBlock.id}
          >
            <FormattedText value={introductionBlock.text} />
          </div>
        ) : null}
        <AssetExplainerPrint
          source={source}
          revision={revision}
          entries={entries}
          caption={caption}
          showLegend={showLegend}
        />
      </div>
      <div className={styles.printArtwork} aria-hidden="true">
        <img src="/page/bottom.svg" alt="" />
      </div>
      <span className={styles.folio}>6</span>
    </article>
  );
}
