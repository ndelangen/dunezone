import { UnstyledButton } from '@mantine/core';
import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';
import { FactionRender } from '@shared/factions/schema';
import type { FactionInput } from '@shared/factions/schema';
import { resolveAsset } from '@shared/media/resolveAsset';
import { CanvasScale } from '@ui/layout/CanvasScale';
import clsx from 'clsx';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';

import { FactionSheetPagePreview } from '@app/widgets/faction-editor/FactionSheetPagePreview';
import { AllianceCard } from '@game/assets/faction/alliance/Alliance';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Shield } from '@game/assets/faction/shield/Shield';
import { Token } from '@game/assets/faction/token/Token';
import { TraitorCard } from '@game/assets/faction/traitor/Traitor';
import { TroopToken } from '@game/assets/faction/troop/Troop';
import { card, disc, page, shield } from '@game/data/sizes';

import styles from './FactionRecipe.module.css';

/*
 * The post's main figure, in three bands: what an author enters and picks in the faction editor, the one faction record the database keeps, and the assets the site draws from that record.
 * Picking an ingredient lights the assets that use it, and picking an asset lights its ingredients; pulses run along the lit lines from the editor, through the record, to the assets.
 * The outputs are the site's own renderers fed through `FactionRender`, so the figure draws what the site draws.
 */

/** The sample Atreides the asset publisher is tested with, led by Paul as on the faction page. */
const FACTION: FactionInput = {
  ...assetPublishingFaction,
  factionLeader: {
    ...assetPublishingFaction.factionLeader,
    name: 'Paul Atreides',
    image: '/image/leader/official/paul.jpg',
  },
};

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

type OutputId = 'sheet' | 'leaderTokens' | 'traitors' | 'troopToken' | 'token' | 'alliance' | 'shield';

/** Which ingredients each asset reads, as `FactionRender` in `@shared/factions/schema` picks them. */
const USES: Record<OutputId, readonly InputId[]> = {
  sheet: ['name', 'theme', 'logo', 'texture', 'colours', 'leaders', 'troop', 'rules'],
  leaderTokens: ['leaders', 'texture', 'colours', 'logo'],
  traitors: ['leaders', 'logo', 'texture', 'colours', 'name'],
  troopToken: ['troop', 'texture', 'colours'],
  token: ['logo', 'texture', 'colours'],
  alliance: ['name', 'alliance', 'logo', 'texture', 'colours', 'troop'],
  shield: ['name', 'factionLeader', 'texture', 'colours', 'logo'],
};

/** The ingredients by kind: typed in, picked from the vector library, or picked from the image library. */
const GROUPS: readonly { title: string; inputs: readonly InputId[] }[] = [
  { title: 'Typed in', inputs: ['name', 'colours', 'theme', 'rules', 'alliance'] },
  { title: 'Vectors', inputs: ['logo', 'troop'] },
  { title: 'Images', inputs: ['texture', 'leaders', 'factionLeader'] },
];

const INPUT_ORDER: readonly InputId[] = GROUPS.flatMap((group) => group.inputs);

const OUTPUT_ORDER: readonly OutputId[] = [
  'sheet',
  'leaderTokens',
  'traitors',
  'troopToken',
  'token',
  'alliance',
  'shield',
];

/** How often the figure moves on to the next ingredient by itself; the stylesheet's `--pulse-duration` matches it. */
const TOUR_MS = 2600;

type Pick = { kind: 'input'; id: InputId } | { kind: 'output'; id: OutputId } | null;

function litSets(pick: Pick): { inputs: ReadonlySet<InputId>; outputs: ReadonlySet<OutputId> } | null {
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
const INPUTS: Record<InputId, { label: string; art: () => ReactNode }> = {
  name: { label: 'Name', art: () => <span className={styles.name}>{FACTION.name}</span> },
  colours: {
    label: 'Colours',
    art: () => (
      <span className={styles.swatches}>
        {FACTION.background.colors.map((color, index) =>
          typeof color === 'string' ? <Swatch key={index} color={color} /> : null
        )}
      </span>
    ),
  },
  theme: { label: 'Theme colour', art: () => <Swatch color={FACTION.themeColor} /> },
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
  logo: { label: 'Logo', art: () => <Glyph src={FACTION.logo} /> },
  troop: { label: 'Troop', art: () => <Glyph src={FACTION.troops[0]?.image ?? ''} /> },
  texture: {
    label: 'Texture',
    art: () => <img className={styles.texture} src={resolveAsset(FACTION.background.image, 'small')} alt="" />,
  },
  leaders: {
    label: 'Leaders',
    art: () => (
      <span className={styles.portraits}>
        {FACTION.leaders.map((leader) => (
          <Portrait key={leader.name} src={leader.image} />
        ))}
      </span>
    ),
  },
  factionLeader: { label: 'Faction leader', art: () => <Portrait src={FACTION.factionLeader.image} /> },
};

/**
 * A renderer drawn at its native canvas size and scaled to the output row's height times `scale`.
 * The scales keep the assets roughly in the sizes they have on the table, relative to each other.
 */
function Scaled({
  size,
  scale = 1,
  round = false,
  children,
}: {
  size: { width: number; height: number };
  scale?: number;
  round?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(styles.scaled, round && styles.round)}
      style={{ '--art-aspect': size.width / size.height, '--art-scale': scale } as CSSProperties}
    >
      <CanvasScale canvasWidth={size.width} canvasHeight={size.height}>
        {children}
      </CanvasScale>
    </span>
  );
}

const leaders = FactionRender.leaders.parse(FACTION);
const traitors = FactionRender.traitors.parse(FACTION);
const troops = FactionRender.troops.parse(FACTION);

const OUTPUTS: Record<OutputId, { label: string; art: () => ReactNode }> = {
  sheet: {
    label: 'Faction sheet',
    art: () => (
      <Scaled size={page} scale={1.15}>
        <span className={styles.sheet}>
          <FactionSheetPagePreview faction={FACTION} pageNumber={1} />
        </span>
      </Scaled>
    ),
  },
  leaderTokens: {
    label: 'Leader tokens',
    art: () => (
      <span className={styles.stack}>
        {leaders.map((leader) => (
          <Scaled key={leader.name} size={disc} scale={0.75} round>
            <LeaderToken {...leader} />
          </Scaled>
        ))}
      </span>
    ),
  },
  traitors: {
    label: 'Traitor cards',
    art: () => (
      <span className={styles.fan}>
        {traitors.slice(-3).map((traitor) => (
          <Scaled key={traitor.name} size={card}>
            <TraitorCard {...traitor} />
          </Scaled>
        ))}
      </span>
    ),
  },
  troopToken: {
    label: 'Troop token',
    art: () =>
      troops[0] ? (
        <Scaled size={disc} scale={0.5} round>
          <TroopToken {...troops[0]} />
        </Scaled>
      ) : null,
  },
  token: {
    label: 'Faction token',
    art: () => (
      <Scaled size={disc} scale={1.05} round>
        <Token {...FactionRender.token.parse(FACTION)} />
      </Scaled>
    ),
  },
  alliance: {
    label: 'Alliance card',
    art: () => (
      <Scaled size={card}>
        <AllianceCard {...FactionRender.alliance.parse(FACTION)} />
      </Scaled>
    ),
  },
  shield: {
    label: 'Shield',
    art: () => (
      <Scaled size={shield}>
        <Shield {...FactionRender.shield.parse(FACTION)} />
      </Scaled>
    ),
  },
};

type Line = { key: string; d: string; input?: InputId; output?: OutputId };

/** Curves from each ingredient's art down into the record, and from the record down to each asset, measured from the laid-out figure. */
function measureLines(root: HTMLElement): Line[] {
  const box = root.getBoundingClientRect();
  const hub = root.querySelector<HTMLElement>('[data-hub]')?.getBoundingClientRect();
  if (!hub) {
    return [];
  }
  const hubX = hub.left + hub.width / 2 - box.left;
  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const middle = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2}`;
  };
  const lines: Line[] = [];
  for (const element of root.querySelectorAll<HTMLElement>('[data-input]')) {
    const rect = element.getBoundingClientRect();
    const input = element.dataset.input as InputId;
    lines.push({
      key: `in-${input}`,
      input,
      d: curve(rect.left + rect.width / 2 - box.left, rect.bottom - box.top, hubX, hub.top - box.top),
    });
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-output]')) {
    const rect = element.getBoundingClientRect();
    const output = element.dataset.output as OutputId;
    lines.push({
      key: `out-${output}`,
      output,
      d: curve(hubX, hub.bottom - box.top, rect.left + rect.width / 2 - box.left, rect.top - box.top),
    });
  }
  return lines;
}

/** While nobody has picked anything, the figure steps through the ingredients on its own, as long as it is on screen. */
function useTour(rootRef: RefObject<HTMLElement | null>, paused: boolean) {
  const [step, setStep] = useState(-1);
  useEffect(() => {
    const root = rootRef.current;
    if (paused || !root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    let timer: ReturnType<typeof setInterval> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      clearInterval(timer);
      if (entry?.isIntersecting) {
        setStep((current) => (current < 0 ? 0 : current));
        timer = setInterval(() => setStep((current) => (current + 1) % INPUT_ORDER.length), TOUR_MS);
      }
    });
    observer.observe(root);
    return () => {
      observer.disconnect();
      clearInterval(timer);
    };
  }, [rootRef, paused]);
  return step < 0 ? null : (INPUT_ORDER[step] ?? null);
}

/** The database the record lives in, drawn as the usual stack of disks. */
function Record() {
  return (
    <div className={styles.hub} data-hub>
      <svg className={styles.cylinder} viewBox="0 0 240 120" preserveAspectRatio="none" aria-hidden>
        <path d="M 2 18 V 102 A 118 16 0 0 0 238 102 V 18" />
        <ellipse cx="120" cy="18" rx="118" ry="16" />
      </svg>
      <span className={styles.hubName}>
        <Glyph src={FACTION.logo} />
        House {FACTION.name}
      </span>
      <span className={styles.hubNote}>one faction record in the database</span>
    </div>
  );
}

export function FactionRecipe() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState<Pick>(null);
  const [hover, setHover] = useState<Pick>(null);
  const [touched, setTouched] = useState(false);
  const touring = useTour(rootRef, touched);
  const active = hover ?? pick ?? (touring ? { kind: 'input' as const, id: touring } : null);
  const lit = litSets(active);
  /* Changing the key restarts the pulses, so every new pick starts its round from the editor. */
  const pulseRound = active ? `${active.kind}-${active.id}` : 'none';

  const remeasure = useCallback(() => {
    if (rootRef.current) {
      setLines(measureLines(rootRef.current));
    }
  }, []);

  useLayoutEffect(() => {
    remeasure();
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(remeasure);
    observer.observe(root);
    for (const tile of root.querySelectorAll('[data-input], [data-output], [data-hub]')) {
      observer.observe(tile);
    }
    return () => observer.disconnect();
  }, [remeasure]);

  const choose = (next: Pick) => {
    setTouched(true);
    setPick((current) => (current && next && current.kind === next.kind && current.id === next.id ? null : next));
  };

  const lineLit = (line: Line) =>
    lit !== null && ((line.input && lit.inputs.has(line.input)) || (line.output && lit.outputs.has(line.output)));

  const tile = (kind: 'input' | 'output', id: InputId | OutputId, label: string, art: ReactNode) => {
    const next = { kind, id } as Pick;
    const isLit = kind === 'input' ? lit?.inputs.has(id as InputId) : lit?.outputs.has(id as OutputId);
    return (
      <UnstyledButton
        key={id}
        {...{ [`data-${kind}`]: id }}
        className={clsx(styles.tile, isLit && styles.lit)}
        aria-pressed={pick?.kind === kind && pick.id === id}
        onClick={() => choose(next)}
        onMouseEnter={() => {
          setTouched(true);
          setHover(next);
        }}
        onMouseLeave={() => setHover(null)}
      >
        <span className={kind === 'input' ? styles.inputArt : styles.outputArt}>{art}</span>
        <span className={styles.label}>{label}</span>
      </UnstyledButton>
    );
  };

  return (
    <div ref={rootRef} className={clsx(styles.root, lit && styles.focused)}>
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
          <div key={group.title} className={styles.group}>
            <p className={styles.groupTitle}>{group.title}</p>
            <div className={styles.inputs}>
              {group.inputs.map((id) => (
                <Fragment key={id}>{tile('input', id, INPUTS[id].label, INPUTS[id].art())}</Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Record />
      <div className={styles.outputs}>
        {OUTPUT_ORDER.map((id) => (
          <Fragment key={id}>{tile('output', id, OUTPUTS[id].label, OUTPUTS[id].art())}</Fragment>
        ))}
      </div>
      <p className={styles.band}>Drawn from that record, live, in your browser</p>
    </div>
  );
}
