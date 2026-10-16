import type { CSSProperties, ReactNode } from 'react';
import { useId } from 'react';

import { Callout, Gear } from './Machine';
import styles from './Machine.module.css';

/*
 * Five takes on the middle of the faction diagram, each drawn as a blueprint of a copying machine.
 * Every take shows the same five jobs: the record kept in storage, retrieved, rendered in the browser, printed as a PDF, and its images saved back to storage.
 * The ingredients always enter at the top centre and the assets always leave at the bottom centre, where the diagram's lines meet the drawing.
 */

const LEFT = -100;
const WIDTH = 560;

type MachineProps = { title: string; subtitle: string };

/** The sheet of blueprint paper every take is drawn on, with a grid, a border and a title block in the corner. */
function Sheet({
  height,
  drawing,
  title,
  subtitle,
  children,
}: MachineProps & { height: number; drawing: string; children: ReactNode }) {
  const id = useId();
  const grid = `${id}-grid`;
  const arrow = `${id}-arrow`;
  return (
    <svg
      className={styles.machine}
      viewBox={`${LEFT} 0 ${WIDTH} ${height}`}
      role="img"
      aria-label={`${title}: ${subtitle}`}
      style={{ aspectRatio: `${WIDTH} / ${height}` }}
    >
      <defs>
        <pattern id={grid} width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M 10 0 H 0 V 10" className={styles.gridLine} />
        </pattern>
        <marker id={arrow} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 8 4 L 0 8 Z" className={styles.dot} />
        </marker>
      </defs>
      <rect x={LEFT + 4} y="6" width={WIDTH - 8} height={height - 12} rx="6" className={styles.paper} />
      <rect x={LEFT + 4} y="6" width={WIDTH - 8} height={height - 12} rx="6" fill={`url(#${grid})`} />
      <g className={styles.ink}>
        <rect x={LEFT + 10} y="12" width={WIDTH - 20} height={height - 24} rx="3" className={styles.thin} />
        <rect x={LEFT + WIDTH - 158} y={height - 44} width="148" height="32" className={styles.thin} />
        <path d={`M ${LEFT + WIDTH - 158} ${height - 32} H ${LEFT + WIDTH - 10}`} className={styles.thin} />
      </g>
      <text x={LEFT + WIDTH - 154} y={height - 35} className={styles.note}>
        {drawing}
      </text>
      <text x={LEFT + WIDTH - 154} y={height - 18} className={styles.tag}>
        {title.toUpperCase()}
      </text>
      <g style={{ '--arrow': `url(#${arrow})` } as CSSProperties}>{children}</g>
    </svg>
  );
}

/** A small browser window: a title bar with three dots and an address, and the record's title on the page. */
function Browser({
  x,
  y,
  width,
  height,
  title,
  subtitle,
}: MachineProps & { x: number; y: number; width: number; height: number }) {
  const centre = x + width / 2;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx="3" />
      <path d={`M ${x} ${y + 10} H ${x + width}`} className={styles.thin} />
      {[0, 1, 2].map((dot) => (
        <circle key={dot} cx={x + 6 + dot * 5} cy={y + 5} r="1.4" className={styles.thin} />
      ))}
      <rect x={x + 24} y={y + 2.5} width={width - 30} height="5" rx="2.5" className={styles.thin} />
      <text x={x + 28} y={y + 6.6} className={styles.address}>
        dune.zone/factions/atreides
      </text>
      <text x={centre} y={y + height * 0.45 + 6} className={styles.screenSmall}>
        {subtitle.toUpperCase()}
      </text>
      <text x={centre} y={y + height * 0.45 + 22} className={styles.screenTitle}>
        {title.toUpperCase()}
      </text>
      <path d={`M ${centre - 26} ${y + height - 10} H ${centre + 22}`} className={styles.thin} />
      <rect x={centre + 25} y={y + height - 14} width="4" height="6" className={styles.cursor} />
    </g>
  );
}

/** A sheet of paper with a word on it, sliding out of the machine along `axis`. */
function Paper({
  x,
  y,
  width,
  height,
  label,
  axis,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  axis: 'x' | 'y';
}) {
  return (
    <g className={axis === 'x' ? styles.sheetOutLeft : styles.sheetOutDown}>
      <path
        d={`M ${x} ${y} H ${x + width - 5} L ${x + width} ${y + 5} V ${y + height} H ${x} Z M ${x + width - 5} ${y} V ${y + 5} H ${x + width}`}
        className={styles.page}
      />
      <text x={x + width / 2} y={y + height / 2 + 2.5} className={styles.pageLabel}>
        {label}
      </text>
    </g>
  );
}

/** A picture glyph: a frame with a sun and a dune, the sign for a saved image. */
function Picture({ x, y, size }: { x: number; y: number; size: number }) {
  return (
    <g className={styles.thin}>
      <rect x={x} y={y} width={size} height={size * 0.75} rx="1" />
      <circle cx={x + size * 0.7} cy={y + size * 0.25} r={size * 0.09} />
      <path
        d={`M ${x + 1} ${y + size * 0.7} Q ${x + size * 0.35} ${y + size * 0.3}, ${x + size - 1} ${y + size * 0.68}`}
      />
    </g>
  );
}

/** A hollow arrow along a hidden line, for the images that go back into storage. */
function Return({ d }: { d: string }) {
  return <path d={d} className={styles.returnPath} />;
}

/** The outlet at the bottom centre that the assets leave through. */
function Outlet({ top, height }: { top: number; height: number }) {
  return (
    <g>
      <path d={`M 168 ${top} V ${top + 8} M 192 ${top} V ${top + 8}`} />
      <path d={`M 154 ${top + 8} H 206 L 198 ${height} H 162 Z`} />
    </g>
  );
}

/* Option 1: an office copier seen from the front, with a document feeder, a scanner, a browser for a control panel, a PDF tray and paper drawers for storage. */
export function OfficeCopier(props: MachineProps) {
  const height = 270;
  return (
    <Sheet {...props} height={height} drawing="FIG. A · OFFICE COPIER">
      <g className={styles.ink}>
        {/* Document feeder, which the ingredients drop into. */}
        <path d="M 128 0 H 232 L 252 22 H 108 Z" />
        <path d="M 138 7 H 222 M 134 13 H 226" className={styles.thin} />
        {/* Lid and scanner glass, with the scan light that retrieves the record. */}
        <rect x="60" y="22" width="240" height="14" rx="2" />
        <rect x="64" y="36" width="232" height="8" className={styles.thin} />
        <rect x="66" y="37" width="5" height="6" className={styles.scan} />
        {/* The body. */}
        <rect x="50" y="44" width="260" height="176" rx="6" />
        {/* Keypad and start button. */}
        {[0, 1, 2].map((col) =>
          [0, 1, 2, 3].map((row) => (
            <rect
              key={`${col}-${row}`}
              x={68 + col * 13}
              y={58 + row * 12}
              width="9"
              height="8"
              rx="1.5"
              className={styles.thin}
            />
          ))
        )}
        <circle cx="128" cy="70" r="9" />
        <circle cx="128" cy="70" r="4" className={styles.lamp} />
        {[0, 1, 2].map((lamp) => (
          <circle
            key={lamp}
            cx={116 + lamp * 10}
            cy="96"
            r="2.6"
            className={styles.lamp}
            style={{ animationDelay: `${lamp * 0.3}s` }}
          />
        ))}
        {/* The control panel is a browser, rendering the record. */}
        <Browser x={154} y={54} width={144} height={74} {...props} />
        {/* The PDF tray on the left side. */}
        <path d="M 50 112 L 12 122 V 126 L 50 118" className={styles.thin} />
        <Paper x={18} y={98} width={28} height={18} label="PDF" axis="x" />
        {/* Paper drawers: the storage, holding the record and the saved images. */}
        {['RECORDS', 'IMAGES', 'PRINTS'].map((label, index) => {
          const y = 140 + index * 25;
          return (
            <g key={label}>
              <rect x="62" y={y} width="236" height="21" rx="2" />
              <path d={`M 164 ${y + 14} H 196`} />
              <text x="70" y={y + 13} className={styles.drawerLabel}>
                {label}
              </text>
              {label === 'IMAGES' && <Picture x={270} y={y + 5} size={14} />}
            </g>
          );
        })}
        <Return d="M 22 128 C 22 170, 34 176, 58 176" />
        <Outlet top={220} height={height - 12} />
      </g>
      <Callout from={[296, 40]} to={[340, 30]} text="RETRIEVAL" anchor="start" />
      <Callout from={[298, 92]} to={[340, 100]} text="BROWSER RENDER" anchor="start" />
      <Callout from={[298, 152]} to={[340, 168]} text="STORAGE" anchor="start" />
      <Callout from={[16, 106]} to={[0, 70]} text="PDF PRINT" anchor="end" />
      <Callout from={[30, 168]} to={[0, 200]} text="IMAGES SAVED" anchor="end" />
    </Sheet>
  );
}

/* Option 2: a cutaway of a copier, the paper path running from the feeder past a rendering drum and out of the bottom, with the storage cassettes beside it. */
export function CopierCutaway(props: MachineProps) {
  const height = 280;
  return (
    <Sheet {...props} height={height} drawing="FIG. B · SECTION A–A">
      <g className={styles.ink}>
        {/* The housing, open at the top and bottom where the paper path runs. */}
        <path d="M 156 18 H 30 V 232 H 168 M 192 232 H 330 V 18 H 204" />
        <path d="M 156 18 L 140 0 M 204 18 L 220 0" />
        <path d="M 36 24 H 324 V 226 H 36 Z" className={styles.hidden} />
        {/* Feed rollers. */}
        <Gear cx={170} cy={32} outer={8} teeth={8} />
        <Gear cx={190} cy={32} outer={8} teeth={8} reverse />
        {/* The browser unit writing the record onto the drum. */}
        <rect x="138" y="48" width="84" height="20" rx="2" />
        <text x="180" y="61" className={styles.drawerLabel} textAnchor="middle">
          BROWSER
        </text>
        <path d="M 168 68 L 180 88 M 192 68 L 180 88" className={styles.beam} />
        {/* The drum, turning. */}
        <circle cx="180" cy="124" r="34" />
        <Gear cx={180} cy={124} outer={22} teeth={14} />
        {/* The paper path, flowing from the feeder round the drum and out of the bottom. */}
        <path d="M 180 40 V 90 A 34 34 0 0 1 180 158 V 236" className={styles.flow} />
        {/* The record's plate. */}
        <rect x="48" y="176" width="112" height="42" rx="3" />
        <text x="104" y="191" className={styles.screenSmall}>
          {props.subtitle.toUpperCase()}
        </text>
        <text x="104" y="208" className={styles.plateTitle}>
          {props.title.toUpperCase()}
        </text>
        {/* Storage cassettes, with the pick-up roller that retrieves the record. */}
        {['RECORDS', 'IMAGES', 'PRINTS'].map((label, index) => {
          const y = 110 + index * 34;
          return (
            <g key={label}>
              <path d={`M 240 ${y} H 318 V ${y + 28} H 240 Z M 240 ${y + 6} L 250 ${y}`} />
              <text x="256" y={y + 18} className={styles.drawerLabel}>
                {label}
              </text>
              {label === 'IMAGES' && <Picture x={298} y={y + 8} size={14} />}
            </g>
          );
        })}
        <Gear cx={236} cy={100} outer={9} teeth={8} reverse />
        <path d="M 230 92 C 222 70, 226 58, 222 58" className={styles.returnPath} />
        {/* Images peel off the paper path back into storage. */}
        <Return d="M 186 168 C 200 180, 214 160, 238 160" />
        {[0, 1, 2].map((lamp) => (
          <circle
            key={lamp}
            cx={56 + lamp * 10}
            cy="40"
            r="2.6"
            className={styles.lamp}
            style={{ animationDelay: `${lamp * 0.3}s` }}
          />
        ))}
        <Paper x={168} y={236} width={24} height={18} label="PDF" axis="y" />
      </g>
      <Callout from={[222, 58]} to={[350, 60]} text="BROWSER RENDER" anchor="start" />
      <Callout from={[232, 96]} to={[350, 96]} text="RETRIEVAL" anchor="start" />
      <Callout from={[318, 150]} to={[350, 150]} text="STORAGE" anchor="start" />
      <Callout from={[210, 170]} to={[350, 200]} text="IMAGES SAVED" anchor="start" />
      <Callout from={[168, 248]} to={[0, 250]} text="PDF PRINT" anchor="end" />
      <Callout from={[146, 124]} to={[0, 124]} text="DRUM" anchor="end" />
    </Sheet>
  );
}

/* Option 3: a microfilm reader-printer: two reels of film for storage, a lens that retrieves a frame, a screen showing it as a browser page, a print slot and a camera filing images back onto the reel. */
export function MicrofilmReader(props: MachineProps) {
  const height = 280;
  const reel = (cx: number, reverse: boolean) => (
    <g>
      <circle cx={cx} cy="50" r="30" />
      <g className={reverse ? styles.gearReverse : styles.gear} style={{ transformOrigin: `${cx}px 50px` }}>
        <circle cx={cx} cy="50" r="22" className={styles.thin} />
        <circle cx={cx} cy="50" r="6" />
        {[0, 120, 240].map((angle) => (
          <path
            key={angle}
            d={`M ${cx + Math.cos((angle * Math.PI) / 180) * 6} ${50 + Math.sin((angle * Math.PI) / 180) * 6} L ${cx + Math.cos((angle * Math.PI) / 180) * 22} ${50 + Math.sin((angle * Math.PI) / 180) * 22}`}
            className={styles.thin}
          />
        ))}
      </g>
    </g>
  );
  return (
    <Sheet {...props} height={height} drawing="FIG. C · READER-PRINTER">
      <g className={styles.ink}>
        {/* Two reels of film: the storage. */}
        {reel(76, false)}
        {reel(284, true)}
        {/* The film runs through the gate, where the ingredients come in and the record is retrieved. */}
        <path d="M 76 80 L 160 36 H 200 L 284 80" className={styles.flow} />
        <path d="M 166 0 L 170 28 H 190 L 194 0" />
        <rect x="158" y="28" width="44" height="14" rx="2" />
        <circle cx="180" cy="35" r="4" />
        {/* The projection onto the screen. */}
        <path d="M 172 42 L 104 96 M 188 42 L 256 96" className={styles.hidden} />
        {/* The screen, a browser page. */}
        <rect x="94" y="92" width="172" height="96" rx="5" />
        <Browser x={100} y={98} width={160} height={84} {...props} />
        {/* The base with the print slot. */}
        <path d="M 86 188 H 274 L 292 232 H 68 Z" />
        <path d="M 150 222 H 210" />
        {[0, 1, 2].map((lamp) => (
          <circle
            key={lamp}
            cx={92 + lamp * 10}
            cy="210"
            r="2.6"
            className={styles.lamp}
            style={{ animationDelay: `${lamp * 0.3}s` }}
          />
        ))}
        <circle cx="258" cy="210" r="8" />
        <path d="M 258 210 L 263 205" className={styles.needle} style={{ transformOrigin: '258px 210px' }} />
        {/* The camera that files images back onto the film. */}
        <rect x="300" y="120" width="34" height="22" rx="2" />
        <circle cx="300" cy="131" r="7" />
        <rect x="320" y="115" width="8" height="5" className={styles.lamp} />
        <Return d="M 318 118 C 318 96, 306 88, 296 76" />
        <Paper x={168} y={226} width={24} height={20} label="PDF" axis="y" />
        <Outlet top={246} height={height - 12} />
      </g>
      <Callout from={[56, 32]} to={[0, 40]} text="STORAGE" anchor="end" />
      <Callout from={[158, 34]} to={[0, 90]} text="RETRIEVAL" anchor="end" />
      <Callout from={[266, 150]} to={[350, 176]} text="BROWSER RENDER" anchor="start" />
      <Callout from={[334, 128]} to={[350, 140]} text="IMAGES SAVED" anchor="start" />
      <Callout from={[168, 236]} to={[0, 236]} text="PDF PRINT" anchor="end" />
    </Sheet>
  );
}

/** One station on the conveyor loop: a circle with its glyph, and a name beside it. */
function Station({
  cx,
  cy,
  name,
  side,
  children,
}: {
  cx: number;
  cy: number;
  name: string;
  side: 'left' | 'right' | 'below' | 'above';
  children: ReactNode;
}) {
  const offset = { left: [-24, 3], right: [24, 3], below: [0, 28], above: [0, -20] }[side];
  return (
    <g>
      <circle cx={cx} cy={cy} r="16" className={styles.stationFill} />
      <circle cx={cx} cy={cy} r="16" />
      {children}
      <text
        x={cx + (offset[0] ?? 0)}
        y={cy + (offset[1] ?? 0)}
        textAnchor={side === 'left' ? 'end' : side === 'right' ? 'start' : 'middle'}
        className={styles.note}
      >
        {name}
      </text>
    </g>
  );
}

/* Option 4: a copy room as a conveyor loop around the record's cabinet, with a station for each job. */
export function CopyLoop(props: MachineProps) {
  const height = 280;
  const loop =
    'M 180 40 H 80 A 50 50 0 0 0 30 90 V 170 A 50 50 0 0 0 80 220 H 280 A 50 50 0 0 0 330 170 V 90 A 50 50 0 0 0 280 40 Z';
  return (
    <Sheet {...props} height={height} drawing="FIG. D · COPY LOOP">
      <g className={styles.ink}>
        <path d="M 162 0 L 172 30 H 188 L 198 0" />
        {/* The conveyor. */}
        <path d={loop} className={styles.flow} />
        <path
          d="M 180 50 H 82 A 40 40 0 0 0 40 90 V 170 A 40 40 0 0 0 82 210 H 278 A 40 40 0 0 0 320 170 V 90 A 40 40 0 0 0 278 50 Z"
          className={styles.thin}
        />
        <circle r="3.5" className={styles.runner}>
          <animateMotion dur="8s" repeatCount="indefinite" path={loop} />
        </circle>
        {/* The cabinet in the middle: the storage, with the record on its screen. */}
        <rect x="108" y="74" width="144" height="112" rx="4" />
        <rect x="116" y="82" width="128" height="44" rx="2" className={styles.thin} />
        <text x="180" y="98" className={styles.screenSmall}>
          {props.subtitle.toUpperCase()}
        </text>
        <text x="180" y="116" className={styles.screenTitle}>
          {props.title.toUpperCase()}
        </text>
        {['RECORDS', 'IMAGES'].map((label, index) => {
          const y = 134 + index * 24;
          return (
            <g key={label}>
              <rect x="116" y={y} width="128" height="19" rx="2" />
              <path d={`M 166 ${y + 13} H 194`} />
              <text x="122" y={y + 12} className={styles.drawerLabel}>
                {label}
              </text>
              {label === 'IMAGES' && <Picture x={222} y={y + 4} size={14} />}
            </g>
          );
        })}
        <path d="M 180 30 V 74" className={styles.hidden} />
        {/* Stations round the loop. */}
        <Station cx={80} cy={40} name="RETRIEVAL" side="above">
          <path d="M 80 30 V 40 A 5 5 0 1 0 85 45" className={styles.thin} />
        </Station>
        <Station cx={30} cy={130} name="BROWSER RENDER" side="left">
          <rect x="21" y="123" width="18" height="14" rx="1.5" className={styles.thin} />
          <path d="M 21 127 H 39" className={styles.thin} />
        </Station>
        <Station cx={180} cy={220} name="" side="left">
          <rect x="171" y="215" width="18" height="10" rx="1.5" className={styles.thin} />
          <path d="M 174 215 V 209 H 186 V 215" className={styles.thin} />
        </Station>
        <Station cx={330} cy={130} name="SNAPSHOT" side="right">
          <rect x="321" y="124" width="18" height="12" rx="1.5" className={styles.thin} />
          <circle cx="330" cy="130" r="3.5" className={styles.thin} />
        </Station>
        <Return d="M 314 132 C 290 140, 270 160, 252 166" />
        <Paper x={168} y={238} width={24} height={18} label="PDF" axis="y" />
      </g>
      <Callout from={[108, 150]} to={[0, 170]} text="STORAGE" anchor="end" />
      <Callout from={[166, 232]} to={[0, 248]} text="PDF PRINT" anchor="end" />
      <Callout from={[290, 148]} to={[350, 196]} text="IMAGES SAVED" anchor="start" />
    </Sheet>
  );
}

/** One slab of the exploded copier: an isometric plate, `half` wide either side of the centre line, with its top face at `y`. */
function Slab({ y, half = 110, children }: { y: number; half?: number; children?: ReactNode }) {
  const depth = half * 0.22;
  const thick = 7;
  return (
    <g className={styles.slab}>
      <path
        d={`M ${180 - half} ${y + depth} L 180 ${y} L ${180 + half} ${y + depth} L 180 ${y + depth * 2} Z`}
        className={styles.face}
      />
      <path
        d={`M ${180 - half} ${y + depth} V ${y + depth + thick} L 180 ${y + depth * 2 + thick} L ${180 + half} ${y + depth + thick} V ${y + depth} M 180 ${y + depth * 2} V ${y + depth * 2 + thick}`}
      />
      {children}
    </g>
  );
}

/* Option 5: the copier taken apart, its five layers lifted off each other like an exploded parts drawing, one layer per job. */
export function ExplodedCopier(props: MachineProps) {
  const height = 300;
  const layers = [8, 62, 116, 170, 224];
  return (
    <Sheet {...props} height={height} drawing="FIG. E · EXPLODED VIEW">
      <g className={styles.ink}>
        {/* Alignment lines down through every layer. */}
        <path d="M 70 32 V 248 M 290 32 V 248 M 180 56 V 272" className={styles.hidden} />
        <Slab y={layers[0] ?? 0}>
          {[0, 4, 8].map((lift) => (
            <path
              key={lift}
              d={`M 140 ${24 - lift} L 180 ${15 - lift} L 220 ${24 - lift} L 180 ${33 - lift} Z`}
              className={styles.face}
            />
          ))}
        </Slab>
        <Slab y={layers[1] ?? 0}>
          <ellipse cx="180" cy="86" rx="60" ry="12" className={styles.thin} />
          <path d="M 140 80 L 160 96" className={styles.scanLine} />
        </Slab>
        <Slab y={layers[2] ?? 0}>
          <path d="M 120 140 L 180 126 L 240 140 L 180 154 Z M 129 142.1 L 189 128.1" className={styles.thin} />
          {[0, 1, 2].map((dot) => (
            <circle key={dot} cx={127 + dot * 4.5} cy={139.6 - dot * 1.05} r="1" className={styles.thin} />
          ))}
          <path d="M 150 145 L 196 134.3 M 156 148 L 190 140" className={styles.thin} />
          <rect x="190" y="139" width="4" height="4" className={styles.cursor} />
        </Slab>
        <Slab y={layers[3] ?? 0}>
          <ellipse cx="150" cy="194" rx="6" ry="10" />
          <ellipse cx="210" cy="194" rx="6" ry="10" />
          <path d="M 150 184 H 210 M 150 204 H 210" />
          <path d="M 162 204 L 186 212 L 204 206 L 180 198" className={styles.thin} />
        </Slab>
        <Slab y={layers[4] ?? 0}>
          <path
            d="M 110 248 L 180 232 L 250 248 L 180 264 Z M 140 248 L 180 239 L 220 248 L 180 257 Z"
            className={styles.thin}
          />
        </Slab>
        <Return d="M 66 196 C 40 210, 40 240, 76 254" />
        <Paper x={168} y={276} width={24} height={14} label="PDF" axis="y" />
      </g>
      {[
        ['1 · INTAKE', 0],
        ['2 · RETRIEVAL', 1],
        ['3 · BROWSER RENDER', 2],
        ['4 · PDF PRINT', 3],
        ['5 · STORAGE', 4],
      ].map(([text, index]) => {
        const y = (layers[index as number] ?? 0) + 24;
        return <Callout key={text} from={[290, y]} to={[336, y - 6]} text={text as string} anchor="start" />;
      })}
      <Callout from={[44, 226]} to={[0, 226]} text="IMAGES SAVED" anchor="end" />
    </Sheet>
  );
}

export const MACHINE_OPTIONS = [OfficeCopier, CopierCutaway, MicrofilmReader, CopyLoop, ExplodedCopier] as const;
