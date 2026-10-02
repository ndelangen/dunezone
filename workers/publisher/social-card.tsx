import type { CSSProperties, ReactNode } from 'react';

import type { SocialCardInput } from '../../src/shared/socialCard';

type CardInput = SocialCardInput & { artwork: string };
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
function clip(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const chars = Array.from(normalized);
  return chars.length > limit
    ? chars
        .slice(0, limit - 1)
        .join('')
        .trimEnd() + '…'
    : normalized;
}
function art(input: CardInput, width: number, height: number, fallbackColor = gold): ReactNode {
  if (!input.artwork) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width,
          height,
          border: `2px solid ${fallbackColor}`,
          color: fallbackColor,
          fontFamily: 'Copperplate',
          fontSize: Math.min(width, height) / 3,
        }}
      >
        DZ
      </div>
    );
  }
  return (
    <img
      alt=""
      src={input.artwork}
      width={width}
      height={height}
      style={{ objectFit: 'contain', borderRadius: input.shape === 'round' ? Math.min(width, height) / 2 : 0 }}
    />
  );
}
export function socialCard(input: CardInput) {
  const name = clip(input.name, 78);
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
            {clip(input.text, name.length > 46 ? 140 : 180)}
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
