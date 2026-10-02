/* Three throwaway social-card layouts, compared at /prototype/social-cards/?variant=A. */
import type { CSSProperties, ReactNode } from 'react';

export type CardInput = {
  name: string;
  kind: string;
  text: string;
  shape: string;
  artwork: string;
};
export type Variant = 'A' | 'B' | 'C';
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
export function clip(value: string, limit: number) {
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
  if (!input.artwork)
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
  return (
    <img
      src={input.artwork}
      width={width}
      height={height}
      style={{ objectFit: 'contain', borderRadius: input.shape === 'round' ? Math.min(width, height) / 2 : 0 }}
    />
  );
}
export function VariantA(input: CardInput) {
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
export function VariantB(input: CardInput) {
  const name = clip(input.name, 78);
  return (
    <div style={{ ...base, backgroundColor: '#111b1c' }}>
      <div style={{ ...at(38, 36), fontSize: 19, letterSpacing: 4, color: gold }}>{input.kind.toUpperCase()}</div>
      <div style={{ ...at(990, 36), ...title, fontSize: 21, color: gold }}>Dune Zone</div>
      <div style={{ ...at(250, 63), width: 700, height: 370, alignItems: 'center', justifyContent: 'center' }}>
        {art(input, input.shape === 'landscape' ? 640 : input.shape === 'round' ? 360 : 285, 360)}
      </div>
      <div
        style={{
          ...at(0, 463),
          width: 1200,
          height: 167,
          backgroundColor: '#d6c891',
          color: '#172e30',
          padding: '26px 44px',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            ...title,
            fontSize: name.length > 46 ? 35 : name.length > 24 ? 45 : 59,
            maxHeight: 90,
            overflow: 'hidden',
          }}
        >
          {name}
        </div>
        <div style={{ fontSize: 20, marginTop: 10 }}>dune.zone</div>
      </div>
    </div>
  );
}
export function VariantC(input: CardInput) {
  const name = clip(input.name, 78);
  return (
    <div style={{ ...base, backgroundColor: '#eee7cf', color: '#192e2d' }}>
      <div style={{ ...at(0, 0), width: 22, height: 630, backgroundColor: '#a38742' }} />
      <div style={{ ...at(65, 45), ...title, fontSize: 25, letterSpacing: 2 }}>Dune Zone</div>
      <div style={{ ...at(65, 125), fontSize: 21, letterSpacing: 4, color: '#70603c' }}>{input.kind.toUpperCase()}</div>
      <div
        style={{
          ...at(65, 179),
          width: 1050,
          ...title,
          fontSize: name.length > 46 ? 48 : name.length > 24 ? 62 : 83,
          maxHeight: 195,
          overflow: 'hidden',
        }}
      >
        {name}
      </div>
      <div style={{ ...at(65, 410), alignItems: 'center', gap: 30 }}>
        {art(input, 120, 120, '#746033')}
        <div style={{ display: 'flex', flexDirection: 'column', width: 860 }}>
          {input.text && (
            <div style={{ fontSize: 28, lineHeight: 1.25, maxHeight: 106, overflow: 'hidden' }}>
              {clip(input.text, 160)}
            </div>
          )}
          <div style={{ fontSize: 21, marginTop: input.text ? 14 : 0, color: '#70603c' }}>dune.zone</div>
        </div>
      </div>
    </div>
  );
}
export function card(input: CardInput, variant: Variant) {
  return variant === 'A' ? VariantA(input) : variant === 'B' ? VariantB(input) : VariantC(input);
}
