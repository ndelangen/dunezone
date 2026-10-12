/* oxlint-disable jsx-a11y/alt-text -- Decorative game-card layers. */
import type { FC } from 'react';
import type { z } from 'zod';

import type { CardBack as CardBackType } from '../../data/objects';
import { card } from '../../data/sizes';
import { useAssetResolver } from '../assetRenderMode';
import { BackgroundRenderer } from '../utils/BackgroundRenderer';
import { useCountId } from '../utils/useCountId';
import styles from './Back.module.css';

export const CardBack: FC<z.infer<typeof CardBackType>> = ({
  image,
  background,
  name,
  imageOffset,
  imageScale,
  nameScale = 1,
  nameFont = 'C_Busorama',
}) => {
  const prefix = useCountId();
  const resolveAsset = useAssetResolver();

  const gradient = `${prefix}gradient`;
  const textMask = `${prefix}text-mask`;
  const textShadeMask = `${prefix}text-shade-mask`;
  const multicolor = image.endsWith('-multicolor.svg') || !image.endsWith('.svg');
  /* Larger labels may extend beyond the original paint strip; the text masks still limit the paint to their glyphs. */
  const labelPaint = nameScale > 1 ? card : { ...card, y: card.height - 300, height: 100 };
  /*
   * The Storm back needs the closed S from the existing regular face.
   * Its size and baseline align that letter with the other bold capitals.
   */
  const label =
    nameFont === 'C_Busorama_Bold' && name.toUpperCase() === 'STORM' ? (
      <>
        <tspan baselineShift="0.025em" fontFamily="C_Busorama" fontSize="95%" fontWeight="bold">
          S
        </tspan>
        {name.slice(1)}
      </>
    ) : (
      name
    );

  return (
    <div className={styles.card}>
      <BackgroundRenderer className={styles.bg} background={background} />
      <div
        className={styles.decal_bg_1}
        style={{
          filter: 'drop-shadow(0 0 3px black) drop-shadow(0 0 8px black)',
        }}
      />
      <div
        className={styles.decal_bg_2}
        style={{
          filter: 'drop-shadow(0 0 3px black) drop-shadow(0 0 8px black)',
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
        <img alt="" src={resolveAsset(image)} />
        {!multicolor && <img alt="" src={resolveAsset(image)} />}
        {!multicolor && <img alt="" src={resolveAsset(image)} />}
      </div>

      <svg className={styles.svg}>
        <defs>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={gradient}
            x1="0"
            x2="0"
            y1={card.height - 300}
            y2={card.height - 200}
          >
            <stop offset="0%" stopColor="#faf8eb" />
            <stop offset="100%" stopColor="#cfaf45" />
          </linearGradient>
          <mask id={textMask} maskUnits="userSpaceOnUse">
            <rect fill="black" {...card} />
            <text
              dominantBaseline="middle"
              fill="white"
              fontFamily={nameFont}
              fontSize={90 * nameScale}
              letterSpacing="-0.7"
              style={{ textTransform: 'uppercase' }}
              textAnchor="middle"
              x="50%"
              y={card.height - 250}
            >
              {label}
            </text>
          </mask>
          <mask id={textShadeMask} maskUnits="userSpaceOnUse">
            <rect fill="black" {...card} />
            <text
              dominantBaseline="middle"
              fill="white"
              fontFamily={nameFont}
              fontSize={90 * nameScale}
              letterSpacing="-0.7"
              style={{ textTransform: 'uppercase' }}
              textAnchor="middle"
              x="50%"
              y={card.height - 250}
            >
              {label}
            </text>
            <text
              dominantBaseline="middle"
              fill="black"
              fontFamily={nameFont}
              fontSize={90 * nameScale}
              letterSpacing="-0.7"
              style={{ textTransform: 'uppercase' }}
              textAnchor="middle"
              x="50%"
              y={card.height - 254}
            >
              {label}
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
            fontFamily={nameFont}
            fontSize={90 * nameScale}
            letterSpacing="-0.7"
            style={{ textTransform: 'uppercase' }}
            textAnchor="middle"
            x="50%"
            y={card.height - 250}
          >
            {label}
          </text>
        </g>
        <rect fill={`url(#${gradient})`} {...labelPaint} mask={`url(#${textMask})`} />
        <g style={{ mixBlendMode: 'overlay' }}>
          <rect fill="black" {...labelPaint} mask={`url(#${textShadeMask})`} />
        </g>
      </svg>
    </div>
  );
};
