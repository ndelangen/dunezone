import { useCallback, useId, useRef } from 'react';
import type { FC } from 'react';
import type { z } from 'zod';

import type { CardBack as CardBackType } from '../../data/objects';
import { card } from '../../data/sizes';
import { useAssetResolver } from '../assetRenderMode';
import { BackgroundRenderer } from '../utils/BackgroundRenderer';
import { fitCardTitle, singleLineTitle, useCardTitleFit } from '../utils/cardTitleFit';
import styles from './Back.module.css';

export const CardBack: FC<z.infer<typeof CardBackType>> = ({
  image,
  background,
  name,
  imageOffset,
  imageScale,
  emblemBackground,
}) => {
  const prefix = useId();
  const resolveAsset = useAssetResolver();
  const label = useRef<SVGSVGElement>(null);
  const fit = useCallback((element: SVGSVGElement) => {
    fitCardTitle(90, 680, 100, (size) => {
      element.style.fontSize = `${size}px`;
      let width = 0;
      let height = 0;
      for (const text of element.querySelectorAll('text')) {
        if (!text.textContent) {
          continue;
        }
        const bounds = text.getBBox();
        // Repeated mask and shade text share this fit, including the raised shade baseline.
        width = Math.max(
          width,
          text.getComputedTextLength(),
          (450 - bounds.x) * 2,
          (bounds.x + bounds.width - 450) * 2
        );
        height = Math.max(height, (1013 - bounds.y) * 2, (bounds.y + bounds.height - 1013) * 2);
      }
      return { width, height };
    });
  }, []);
  useCardTitleFit(label, fit);
  const title = singleLineTitle(name);

  const gradient = `${prefix}gradient`;
  const textMask = `${prefix}text-mask`;
  const textShadeMask = `${prefix}text-shade-mask`;
  const multicolor = image.endsWith('-multicolor.svg') || !image.endsWith('.svg');
  /* Clip each blended image to the fixed gold disc without isolating its blend from the card. */
  const emblemClip = {
    clipPath: `circle(145px at ${imageScale * 110 - imageOffset[0]}px ${imageScale * 110 - imageOffset[1]}px)`,
  };
  const emblemBackgroundFilter = `${prefix}emblem-background`;
  const tint = emblemBackground?.color.match(/^#([0-9a-f]{6})$/i)?.[1];
  const intensity = emblemBackground?.intensity ?? 0;
  /* Blend a luminance-based tint with the original disc, retaining its grain and transparent edge. */
  const tintMatrix =
    tint && intensity > 0
      ? [0, 2, 4]
          .map((offset, row) => {
            const channel = Number.parseInt(tint.slice(offset, offset + 2), 16) / 255;
            return [
              ...[0.2126, 0.7152, 0.0722].map(
                (weight, column) => channel * weight * intensity + (row === column ? 1 - intensity : 0)
              ),
              0,
              0,
            ].join(' ');
          })
          .concat('0 0 0 1 0')
          .join(' ')
      : undefined;

  return (
    <div className={styles.card}>
      <BackgroundRenderer className={styles.bg} background={background} />
      <div
        className={styles.decal_bg_1}
        style={{
          filter: `${tintMatrix ? `url(#${emblemBackgroundFilter}) ` : ''}drop-shadow(0 0 3px black) drop-shadow(0 0 8px black)`,
        }}
      />

      <div
        className={`${styles.icon} ${multicolor ? styles.multicolor : ''}`}
        style={{
          marginLeft: imageOffset[0] - ((imageScale - 1) / 2) * 220,
          marginTop: imageOffset[1] - ((imageScale - 1) / 2) * 220,
          width: imageScale * 220,
          height: imageScale * 220,
        }}
      >
        <img alt="" src={resolveAsset(image)} style={emblemClip} />
        {!multicolor && <img alt="" src={resolveAsset(image)} style={emblemClip} />}
        {!multicolor && <img alt="" src={resolveAsset(image)} style={emblemClip} />}
      </div>

      <div
        className={styles.decal_bg_2}
        style={{
          filter: 'drop-shadow(0 0 3px black) drop-shadow(0 0 8px black)',
        }}
      />

      <svg ref={label} className={styles.svg} fontSize={90} aria-label={name} style={{ fontFamily: 'C_Busorama' }}>
        <defs>
          {tintMatrix && (
            <filter id={emblemBackgroundFilter} colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values={tintMatrix} />
            </filter>
          )}
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#faf8eb" />
            <stop offset="100%" stopColor="#cfaf45" />
          </linearGradient>
          <mask id={textMask} maskUnits="userSpaceOnUse">
            <rect fill="black" {...card} />
            <text
              dominantBaseline="middle"
              fill="white"
              fontFamily="C_Busorama"
              letterSpacing="-0.7"
              style={{ textTransform: 'uppercase' }}
              textAnchor="middle"
              x="50%"
              y={card.height - 250}
            >
              {title}
            </text>
          </mask>
          <mask id={textShadeMask} maskUnits="userSpaceOnUse">
            <rect fill="black" {...card} />
            <text
              dominantBaseline="middle"
              fill="white"
              fontFamily="C_Busorama"
              letterSpacing="-0.7"
              style={{ textTransform: 'uppercase' }}
              textAnchor="middle"
              x="50%"
              y={card.height - 250}
            >
              {title}
            </text>
            <text
              dominantBaseline="middle"
              fill="black"
              fontFamily="C_Busorama"
              letterSpacing="-0.7"
              style={{ textTransform: 'uppercase' }}
              textAnchor="middle"
              x="50%"
              y={card.height - 254}
            >
              {title}
            </text>
          </mask>

          <filter height="300%" id="dropshadow" width="300%" x="-100%" y="-100%">
            <feDropShadow dx="0" dy="0" floodColor="#000000" floodOpacity="1" stdDeviation="8" />
            <feDropShadow dx="0" dy="0" floodColor="#000000" floodOpacity="1" stdDeviation="4" />
          </filter>
        </defs>
        <g filter="url(#dropshadow)">
          <text
            dominantBaseline="middle"
            fill="black"
            fontFamily="C_Busorama"
            letterSpacing="-0.7"
            style={{ textTransform: 'uppercase' }}
            textAnchor="middle"
            x="50%"
            y={card.height - 250}
          >
            {title}
          </text>
        </g>
        <rect fill={`url(#${gradient})`} {...card} y={card.height - 300} height={100} mask={`url(#${textMask})`} />
        <g style={{ mixBlendMode: 'overlay' }}>
          <rect fill="black" {...card} y={card.height - 300} height={100} mask={`url(#${textShadeMask})`} />
        </g>
      </svg>
    </div>
  );
};
