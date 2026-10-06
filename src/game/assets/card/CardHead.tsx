import { COMPONENT_GEOMETRY_PROTOCOL } from '@shared/asset-publishing/componentGeometry';
import type { CardHead } from '@shared/assets/schema';
import type { z } from 'zod';

import { BackgroundRenderer } from '../utils/BackgroundRenderer';
import styles from './CardHead.module.css';
import { cardTitleFontSize } from './cardTitleFontSize';

type HeadProps = z.infer<typeof CardHead> & {
  measureParts?: boolean;
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
}: Omit<HeadProps, 'head'>) {
  const iconSize = 85 * iconScale;
  return (
    <>
      <BackgroundRenderer
        className={styles.symbol}
        background={icon[0]}
        componentPart={measureParts ? 'icon' : undefined}
      >
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
      </BackgroundRenderer>
      <div
        className={styles.title}
        style={{ width: 560, fontSize: cardTitleFontSize(name) }}
        {...{
          [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: measureParts && name.trim() ? 'name' : undefined,
        }}
      >
        <span className={styles.titleText}>{name}</span>
      </div>
      <div
        className={styles.subtitle}
        {...{
          [COMPONENT_GEOMETRY_PROTOCOL.partAttribute]: measureParts && subName.trim() ? 'type' : undefined,
        }}
      >
        {subName}
      </div>
    </>
  );
}
