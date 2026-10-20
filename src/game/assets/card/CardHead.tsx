import { COMPONENT_GEOMETRY_PROTOCOL } from '@shared/asset-publishing/componentGeometry';
import type { CardHead } from '@shared/assets/schema';
import type { z } from 'zod';

import { useAsset } from '../assetRenderMode';
import { BackgroundRenderer } from '../utils/BackgroundRenderer';
import { CardTitle } from '../utils/CardTitle';
import styles from './CardHead.module.css';

type HeadProps = z.infer<typeof CardHead> & {
  measureParts?: boolean;
  iconPresentation?: 'symbol' | 'image';
};

/** Draws the shared Head background underneath the card's printed frame. */
export function CardHeadBackground({ head, measureParts = false }: Pick<HeadProps, 'head' | 'measureParts'>) {
  return (
    <>
      <BackgroundRenderer className={styles.head} background={head} componentPart={measureParts ? 'head' : undefined} />
      <div className={styles.shade} />
    </>
  );
}

/** Draws the standard title, Type and authored symbol over either card's body. */
export function CardHeadContents({
  name,
  subName,
  icon,
  iconOffset = [0, 0],
  iconScale = 1,
  iconInvert = false,
  iconOpacity = 1,
  measureParts = false,
  iconPresentation = 'symbol',
}: Omit<HeadProps, 'head'>) {
  const iconSize = 85 * iconScale;
  const image = useAsset(icon[1]);
  /* The unmasked image scales around its centre and can extend left of the printed symbol disc. */
  const titleWidth = iconPresentation === 'image' ? Math.min(560, 694 - 64.5 * (1 + iconScale)) : 560;
  return (
    <>
      <BackgroundRenderer
        className={styles.symbol}
        background={icon[0]}
        componentPart={measureParts ? 'icon' : undefined}
      >
        {iconPresentation === 'symbol' ? (
          <>
            <img
              alt=""
              src={icon[1]}
              className={styles.symbolOverlay}
              style={{
                marginLeft: iconOffset[0] * 2,
                marginTop: iconOffset[1] * 2,
                width: iconSize,
                height: iconSize,
                filter: iconInvert ? 'invert(1)' : undefined,
                opacity: iconOpacity,
              }}
            />
            <img
              alt=""
              src={icon[1]}
              className={styles.symbolShade}
              style={{
                marginLeft: iconOffset[0],
                marginTop: iconOffset[1],
                width: iconSize,
                height: iconSize,
                top: (125 - iconSize) / 2,
                left: (125 - iconSize) / 2,
                opacity: 0.5 * iconOpacity,
              }}
            />
          </>
        ) : null}
      </BackgroundRenderer>
      {iconPresentation === 'image' ? (
        <img alt="" src={image} className={styles.picture} style={{ transform: `scale(${iconScale})` }} />
      ) : null}
      <CardTitle
        className={styles.title}
        text={name}
        style={{ width: titleWidth }}
        {...{
          [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: measureParts && name.trim() ? 'name' : undefined,
        }}
      />
      <CardTitle
        className={styles.subtitle}
        text={subName}
        baseSize={40}
        {...{
          [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: measureParts && subName.trim() ? 'type' : undefined,
        }}
      />
    </>
  );
}
