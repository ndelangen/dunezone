import { createElement } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { clipSocialCardText } from '../../src/shared/socialCard';
import type { SocialCardInput } from '../../src/shared/socialCard';
import { jpegProfile } from './image-inspection';

type CardInput = SocialCardInput & { artwork: ArrayBuffer | null };
const ink = '#eee7c4';
const gold = '#d6c891';
const base: CSSProperties = {
  display: 'flex',
  position: 'relative',
  width: 1200,
  height: 630,
  overflow: 'hidden',
  fontFamily: 'Candara',
  color: ink,
  backgroundColor: '#172e30',
};
const at = (left: number, top: number): CSSProperties => ({ position: 'absolute', left, top, display: 'flex' });
const title: CSSProperties = { fontFamily: 'Copperplate', lineHeight: 1.12 };
function art(input: CardInput, width: number, height: number): ReactNode {
  let fittedWidth = width;
  let fittedHeight = height;
  if (input.artwork) {
    const { widthPx, heightPx } = jpegProfile(new Uint8Array(input.artwork));
    const scale = Math.min(width / widthPx, height / heightPx);
    fittedWidth = widthPx * scale;
    fittedHeight = heightPx * scale;
  }
  return (
    <div style={{ display: 'flex', width, height, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', position: 'relative', width: fittedWidth, height: fittedHeight }}>
        {/* Opaque JPEG pixels cover the monogram; failed decoding leaves it visible. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: fittedWidth,
            height: fittedHeight,
            border: `2px solid ${gold}`,
            color: gold,
            fontFamily: 'Copperplate',
            fontSize: Math.min(fittedWidth, fittedHeight) / 3,
            borderRadius: input.artwork && input.shape === 'round' ? Math.min(width, height) / 2 : 0,
          }}
        >
          DZ
        </div>
        {/* Binary sources bypass Satori's persistent URL image cache. */}
        {input.artwork &&
          createElement('img', {
            alt: '',
            src: input.artwork,
            width: fittedWidth,
            height: fittedHeight,
            style: {
              position: 'absolute',
              left: 0,
              top: 0,
              borderRadius: input.shape === 'round' ? Math.min(width, height) / 2 : 0,
            },
          })}
      </div>
    </div>
  );
}
/*
 * Portrait and round artwork (cards, tokens, portraits) sits in a tall slot beside a wide text column.
 * Landscape artwork (screenshots of the table) gets a wide slot and the text column narrows to make room, so the picture reads at a glance.
 */
/* Clips the card's text on a word boundary, so it never ends in half a word. */
function clipAtWord(value: string, limit: number): string {
  const clipped = clipSocialCardText(value, limit);
  if (!clipped.endsWith('…')) {
    return clipped;
  }
  const words = clipped
    .slice(0, -1)
    .replace(/\s+\S*$/, '')
    .replace(/[\s,;:.]+$/, '');
  return `${words || clipped.slice(0, -1)}…`;
}

const LAYOUTS = {
  tall: {
    textWidth: 610,
    artLeft: 745,
    artWidth: 370,
    artHeight: 420,
    titleSizes: [39, 48, 62],
    textLimits: [140, 180],
  },
  wide: {
    textWidth: 470,
    artLeft: 580,
    artWidth: 560,
    artHeight: 420,
    titleSizes: [34, 42, 54],
    textLimits: [120, 120],
  },
} as const;

export function socialCard(input: CardInput) {
  const name = clipSocialCardText(input.name, 78);
  const layout = LAYOUTS[input.shape === 'landscape' ? 'wide' : 'tall'];
  const [smallTitle, mediumTitle, largeTitle] = layout.titleSizes;
  const artHeight = input.shape === 'round' ? layout.artWidth : layout.artHeight;
  return (
    <div style={base}>
      <div style={{ ...at(24, 24), width: 1152, height: 582, border: '1px solid #d6c89155' }} />
      <div style={{ ...at(60, 48), ...title, color: gold, fontSize: 25, letterSpacing: 3 }}>Dune Zone</div>
      <div style={{ ...at(60, 145), width: layout.textWidth, flexDirection: 'column' }}>
        <div style={{ color: '#b5c4bb', fontSize: 20, letterSpacing: 4 }}>{input.kind.toUpperCase()}</div>
        <div
          style={{
            ...title,
            fontSize: name.length > 46 ? smallTitle : name.length > 24 ? mediumTitle : largeTitle,
            marginTop: 22,
            maxHeight: 180,
            overflow: 'hidden',
          }}
        >
          {name}
        </div>
        {input.text && (
          <div
            style={{
              fontSize: 28,
              lineHeight: 1.3,
              marginTop: 22,
              maxHeight: 145,
              overflow: 'hidden',
              color: '#dedecb',
            }}
          >
            {clipAtWord(input.text, name.length > 46 ? layout.textLimits[0] : layout.textLimits[1])}
          </div>
        )}
      </div>
      <div
        style={{
          ...at(layout.artLeft, 113),
          width: layout.artWidth,
          height: 420,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {art(input, layout.artWidth, artHeight)}
      </div>
      <div style={{ ...at(60, 554), fontSize: 21, color: gold }}>dune.zone</div>
    </div>
  );
}
