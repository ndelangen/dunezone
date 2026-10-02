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
export function socialCard(input: CardInput) {
  const name = clipSocialCardText(input.name, 78);
  return (
    <div style={base}>
      <div style={{ ...at(24, 24), width: 1152, height: 582, border: '1px solid #d6c89155' }} />
      <div style={{ ...at(60, 48), ...title, color: gold, fontSize: 25, letterSpacing: 3 }}>Dune Zone</div>
      <div style={{ ...at(60, 145), width: 610, flexDirection: 'column' }}>
        <div style={{ color: '#b5c4bb', fontSize: 20, letterSpacing: 4 }}>{input.kind.toUpperCase()}</div>
        <div
          style={{
            ...title,
            fontSize: name.length > 46 ? 39 : name.length > 24 ? 48 : 62,
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
            {clipSocialCardText(input.text, name.length > 46 ? 140 : 180)}
          </div>
        )}
      </div>
      <div style={{ ...at(745, 113), width: 370, height: 420, alignItems: 'center', justifyContent: 'center' }}>
        {art(input, 370, input.shape === 'round' ? 370 : 420)}
      </div>
      <div style={{ ...at(60, 554), fontSize: 21, color: gold }}>dune.zone</div>
    </div>
  );
}
