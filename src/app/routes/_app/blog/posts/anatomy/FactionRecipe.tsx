import { UnstyledButton } from '@mantine/core';
import type { FactionInput } from '@shared/factions/schema';
import { resolveAsset } from '@shared/media/resolveAsset';
import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';

import styles from './FactionRecipe.module.css';
import { HOUSE_ATREIDES } from './houseAtreides';
import { Machine } from './Machine';
import { OUTPUT_ORDER, outputsFor } from './outputs';
import type { OutputId } from './outputs';

/*
 * The post's main figure, in three bands: what an author enters and picks in the faction editor, the one faction record the database keeps, and the assets the site draws from that record.
 * Picking an ingredient lights the assets that use it, and picking an asset lights its ingredients; pulses run along the lit lines from the editor, through the record, to the assets.
 * The outputs are the site's own renderers fed through `FactionRender`, so the figure draws what the site draws.
 */

/** House Atreides as the faction page shows it, led by Paul. */
const FACTION: FactionInput = HOUSE_ATREIDES;
const OUTPUTS = outputsFor(FACTION);

type InputId =
  | 'name'
  | 'colours'
  | 'theme'
  | 'rules'
  | 'alliance'
  | 'logo'
  | 'troop'
  | 'texture'
  | 'leaders'
  | 'factionLeader';

/** Which ingredients each asset reads, as `FactionRender` in `@shared/factions/schema` picks them. */
const USES: Record<OutputId, readonly InputId[]> = {
  sheet: ['name', 'theme', 'logo', 'texture', 'colours', 'leaders', 'troop', 'rules', 'alliance'],
  leaderTokens: ['leaders', 'texture', 'colours', 'logo'],
  traitors: ['leaders', 'logo', 'texture', 'colours', 'name'],
  troopToken: ['troop', 'texture', 'colours'],
  token: ['logo', 'texture', 'colours'],
  alliance: ['name', 'alliance', 'logo', 'texture', 'colours', 'troop'],
  shield: ['name', 'factionLeader', 'texture', 'colours', 'logo'],
};

/** The ingredients by kind: typed in, the colouring, picked from the vector library, or picked from the image library. */
const GROUPS: readonly { title: string; inputs: readonly InputId[] }[] = [
  { title: 'Typed in', inputs: ['name', 'rules', 'alliance'] },
  { title: 'Colouring', inputs: ['colours', 'theme', 'texture'] },
  { title: 'Vectors', inputs: ['logo', 'troop'] },
  { title: 'Images', inputs: ['leaders', 'factionLeader'] },
];

const INPUT_ORDER: readonly InputId[] = GROUPS.flatMap((group) => group.inputs);

/** How often the figure moves on to the next ingredient by itself; the stylesheet's `--pulse-duration` matches it. */
const TOUR_MS = 2600;

type Selection = { kind: 'input'; id: InputId } | { kind: 'output'; id: OutputId } | null;

function litSets(pick: Selection): { inputs: ReadonlySet<InputId>; outputs: ReadonlySet<OutputId> } | null {
  if (!pick) {
    return null;
  }
  if (pick.kind === 'input') {
    return {
      inputs: new Set([pick.id]),
      outputs: new Set(OUTPUT_ORDER.filter((output) => USES[output].includes(pick.id))),
    };
  }
  return { inputs: new Set(USES[pick.id]), outputs: new Set([pick.id]) };
}

function Swatch({ color }: { color: string }) {
  return <span className={styles.swatch} style={{ background: color }} />;
}

function Glyph({ src }: { src: string }) {
  return <span className={styles.glyph} style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }} />;
}

function Portrait({ src }: { src: string }) {
  return <img className={styles.portrait} src={resolveAsset(src, 'small')} alt="" />;
}

/* Art is built when the figure renders, not when the module loads, so the media resolver sees every key a render asks for. */
/* `zoom` sizes an ingredient's art against the others, so the row has a rhythm rather than ten equal tiles. */
const INPUTS: Record<InputId, { label: string; zoom?: number; art: () => ReactNode }> = {
  name: { label: 'Name', zoom: 1.15, art: () => <span className={styles.name}>{FACTION.name}</span> },
  colours: {
    label: 'Colours',
    zoom: 0.9,
    art: () => (
      <span className={styles.swatches}>
        {FACTION.background.colors.map((color, index) =>
          typeof color === 'string' ? <Swatch key={index} color={color} /> : null
        )}
      </span>
    ),
  },
  theme: { label: 'Theme colour', zoom: 0.8, art: () => <Swatch color={FACTION.themeColor} /> },
  rules: {
    label: 'Rules',
    art: () => (
      <span className={styles.text}>
        {FACTION.rules.advantages
          .map((advantage) => advantage.title)
          .filter(Boolean)
          .slice(0, 3)
          .join(', ')}
        …
      </span>
    ),
  },
  alliance: {
    label: 'Alliance',
    art: () => <span className={styles.text}>{FACTION.rules.alliance.text}</span>,
  },
  logo: { label: 'Logo', zoom: 2.5, art: () => <Glyph src={FACTION.logo} /> },
  troop: { label: 'Troop', zoom: 2.1, art: () => <Glyph src={FACTION.troops[0]?.image ?? ''} /> },
  texture: {
    label: 'Texture',
    zoom: 1.15,
    art: () => <img className={styles.texture} src={resolveAsset(FACTION.background.image, 'small')} alt="" />,
  },
  leaders: {
    label: 'Leaders',
    zoom: 1.25,
    art: () => (
      <span className={styles.portraits}>
        {FACTION.leaders.map((leader) => (
          <Portrait key={leader.name} src={leader.image} />
        ))}
      </span>
    ),
  },
  factionLeader: { label: 'Faction leader', zoom: 1.3, art: () => <Portrait src={FACTION.factionLeader.image} /> },
};

type Line = { key: string; d: string; input?: InputId; output?: OutputId };

/** How far a drop curves as it turns onto its bus. */
const BUS_RADIUS = 6;

/** An S-curve from one point straight down to another. */
function curve(x1: number, y1: number, x2: number, y2: number) {
  const middle = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2}`;
}

/** Where the figure's parts sit, relative to its own box. */
type Frame = { box: DOMRect; hubX: number; hubTop: number };

/** The path from one ingredient down onto its kind's bus, or, for an ingredient above the bottom row, a start at the bus itself. */
function dropPath(rect: DOMRect, frame: Frame, bus: { x: number; y: number }, onBottomRow: boolean) {
  const x = rect.left + rect.width / 2 - frame.box.left;
  if (!onBottomRow) {
    return `M ${bus.x} ${bus.y}`;
  }
  const top = `M ${x} ${rect.bottom - frame.box.top}`;
  const turn = Math.sign(bus.x - x) * Math.min(BUS_RADIUS, Math.abs(bus.x - x));
  if (turn === 0) {
    return `${top} V ${bus.y}`;
  }
  return `${top} V ${bus.y - BUS_RADIUS} Q ${x} ${bus.y}, ${x + turn} ${bus.y} H ${bus.x}`;
}

/*
 * Each kind of ingredient has a bus under it, like a wiring harness: a line drops from each ingredient onto the bus, runs along it to the middle, and one trunk carries the whole kind into the intake.
 * When a kind wraps onto more rows, as on a phone, only the bottom row drops onto the bus, so no line crosses an ingredient; the rows above light up the trunk alone.
 */
function groupLines(group: HTMLElement, groups: readonly HTMLElement[], frame: Frame): Line[] {
  const busRect = group.querySelector<HTMLElement>('[data-bus]')?.getBoundingClientRect();
  if (!busRect) {
    return [];
  }
  const bus = { x: busRect.left + busRect.width / 2 - frame.box.left, y: busRect.top - frame.box.top };
  /* A cluster with another cluster below it, as in a phone's top row, turns its trunk into the middle first and runs straight down the gap. */
  const groupBottom = group.getBoundingClientRect().bottom;
  const above = groups.some((other) => other.getBoundingClientRect().top > groupBottom);
  const trunk = above
    ? ` C ${bus.x} ${bus.y + 24}, ${frame.hubX} ${bus.y + 8}, ${frame.hubX} ${bus.y + 32} V ${frame.hubTop}`
    : curve(bus.x, bus.y, frame.hubX, frame.hubTop).slice(`M ${bus.x} ${bus.y}`.length);
  const tiles = [...group.querySelectorAll<HTMLElement>('[data-input]')];
  const lowest = Math.max(...tiles.map((element) => element.getBoundingClientRect().bottom));
  return tiles.map((element) => {
    const rect = element.getBoundingClientRect();
    const input = element.dataset.input as InputId;
    return { key: `in-${input}`, input, d: `${dropPath(rect, frame, bus, rect.bottom > lowest - 4)}${trunk}` };
  });
}

/** Curves from each ingredient's art down into the record, and from the record down to each asset, measured from the laid-out figure. */
function measureLines(root: HTMLElement): Line[] {
  const box = root.getBoundingClientRect();
  const hub = root.querySelector<HTMLElement>('[data-hub]')?.getBoundingClientRect();
  if (!hub) {
    return [];
  }
  const frame: Frame = { box, hubX: hub.left + hub.width / 2 - box.left, hubTop: hub.top - box.top };
  const groups = [...root.querySelectorAll<HTMLElement>('[data-group]')];
  const inputs = groups.flatMap((group) => groupLines(group, groups, frame));
  const outputs = [...root.querySelectorAll<HTMLElement>('[data-output]')].map((element) => {
    const rect = element.getBoundingClientRect();
    const output = element.dataset.output as OutputId;
    const d = curve(frame.hubX, hub.bottom - box.top, rect.left + rect.width / 2 - box.left, rect.top - box.top);
    return { key: `out-${output}`, output, d };
  });
  return [...inputs, ...outputs];
}

/** Lines measured from the laid-out figure, measured again whenever it or any of its parts changes size. */
function useLines(rootRef: RefObject<HTMLElement | null>) {
  const [lines, setLines] = useState<Line[]>([]);
  const remeasure = useCallback(() => {
    if (rootRef.current) {
      setLines(measureLines(rootRef.current));
    }
  }, [rootRef]);
  useLayoutEffect(() => {
    remeasure();
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(remeasure);
    observer.observe(root);
    for (const part of root.querySelectorAll('[data-input], [data-output], [data-hub], [data-group]')) {
      observer.observe(part);
    }
    return () => observer.disconnect();
  }, [rootRef, remeasure]);
  return lines;
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The tour runs only on a figure that is mounted, untouched, observable, and shown to a reader who welcomes motion. */
function canTour(root: HTMLElement | null, paused: boolean): root is HTMLElement {
  if (paused || !root) {
    return false;
  }
  return typeof IntersectionObserver !== 'undefined' && !prefersReducedMotion();
}

/** While nobody has picked anything, the figure steps through the ingredients on its own, as long as it is on screen; under reduced motion it waits for a pick. */
function useTour(rootRef: RefObject<HTMLElement | null>, paused: boolean) {
  const [step, setStep] = useState(-1);
  useEffect(() => {
    const root = rootRef.current;
    if (!canTour(root, paused)) {
      return;
    }
    let timer: ReturnType<typeof setInterval> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      clearInterval(timer);
      if (entry?.isIntersecting) {
        setStep((current) => Math.max(current, 0));
        timer = setInterval(() => setStep((current) => (current + 1) % INPUT_ORDER.length), TOUR_MS);
      }
    });
    observer.observe(root);
    return () => {
      observer.disconnect();
      clearInterval(timer);
    };
  }, [rootRef, paused]);
  return paused || step < 0 ? null : (INPUT_ORDER[step] ?? null);
}

function isLineLit(line: Line, lit: ReturnType<typeof litSets>) {
  if (!lit) {
    return false;
  }
  return line.input ? lit.inputs.has(line.input) : Boolean(line.output && lit.outputs.has(line.output));
}

function same(a: Selection, b: Selection) {
  return a !== null && b !== null && a.kind === b.kind && a.id === b.id;
}

/** What the reader has picked or is pointing at, falling back to the tour while they have done neither. */
function useSelection(rootRef: RefObject<HTMLElement | null>) {
  const [pick, setPick] = useState<Selection>(null);
  const [hover, setHover] = useState<Selection>(null);
  const [touched, setTouched] = useState(false);
  const touring = useTour(rootRef, touched);
  const tour: Selection = touring ? { kind: 'input', id: touring } : null;
  return {
    pick,
    active: hover ?? pick ?? tour,
    choose: (next: Selection) => {
      setTouched(true);
      setPick((current) => (same(current, next) ? null : next));
    },
    point: (next: Selection) => {
      setTouched(true);
      setHover(next);
    },
  };
}

function Tile({
  selection,
  label,
  art,
  zoom,
  lit,
  pressed,
  onChoose,
  onPoint,
}: {
  selection: NonNullable<Selection>;
  label: string;
  art: ReactNode;
  zoom?: number;
  lit: boolean;
  pressed: boolean;
  onChoose: (selection: Selection) => void;
  onPoint: (selection: Selection) => void;
}) {
  const isInput = selection.kind === 'input';
  return (
    <UnstyledButton
      data-input={isInput ? selection.id : undefined}
      data-output={isInput ? undefined : selection.id}
      className={clsx(styles.tile, lit && styles.lit)}
      style={zoom ? ({ '--zoom': zoom } as CSSProperties) : undefined}
      aria-pressed={pressed}
      onClick={() => onChoose(selection)}
      onMouseEnter={() => onPoint(selection)}
      onMouseLeave={() => onPoint(null)}
    >
      <span className={isInput ? styles.inputArt : styles.outputArt} aria-hidden="true">
        {art}
      </span>
      <span className={styles.label}>{label}</span>
    </UnstyledButton>
  );
}

export function FactionRecipe() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lines = useLines(rootRef);
  const { pick, active, choose, point } = useSelection(rootRef);
  const lit = litSets(active);
  /* Changing the key restarts the pulses, so every new pick starts its round from the editor. */
  const pulseRound = active ? `${active.kind}-${active.id}` : 'none';
  const lineLit = (line: Line) => isLineLit(line, lit);
  const tileProps = (selection: NonNullable<Selection>) => ({
    selection,
    pressed: same(pick, selection),
    onChoose: choose,
    onPoint: point,
  });

  return (
    <div
      ref={rootRef}
      className={clsx(styles.root, lit && styles.focused)}
      role="group"
      aria-label={`How ${FACTION.name} is drawn: its ingredients, the record they are kept in, and the assets drawn from it`}
    >
      <svg className={styles.lines} aria-hidden>
        {lines.map((line) => (
          <path key={line.key} d={line.d} className={clsx(styles.line, lineLit(line) && styles.lit)} />
        ))}
        <g key={pulseRound}>
          {lines.filter(lineLit).map((line) => (
            <path
              key={line.key}
              d={line.d}
              pathLength={1}
              className={clsx(styles.pulse, line.output ? styles.pulseOut : styles.pulseIn)}
            />
          ))}
        </g>
      </svg>
      <p className={styles.band}>Entered and picked in the faction editor</p>
      <div className={styles.groups}>
        {GROUPS.map((group) => (
          <div key={group.title} className={styles.group} data-group>
            <p className={styles.groupTitle}>{group.title}</p>
            <div className={styles.inputs}>
              {group.inputs.map((id) => (
                <Tile
                  key={id}
                  {...tileProps({ kind: 'input', id })}
                  label={INPUTS[id].label}
                  art={INPUTS[id].art()}
                  zoom={INPUTS[id].zoom}
                  lit={lit?.inputs.has(id) === true}
                />
              ))}
            </div>
            <span className={styles.bus} data-bus />
          </div>
        ))}
      </div>
      <div className={styles.hub} data-hub>
        <Machine title={FACTION.name} subtitle="Faction record" />
      </div>
      <div className={styles.outputs}>
        {OUTPUT_ORDER.map((id) => (
          <Tile
            key={id}
            {...tileProps({ kind: 'output', id })}
            label={OUTPUTS[id].label}
            art={OUTPUTS[id].art()}
            lit={lit?.outputs.has(id) === true}
          />
        ))}
      </div>
      <p className={styles.band}>Drawn from that record, live, in your browser</p>
    </div>
  );
}
