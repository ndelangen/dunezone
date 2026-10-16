import { UnstyledButton } from '@mantine/core';
import { assetPublishingFaction } from '@shared/factions/fixtures/assetPublishingFaction';
import { FactionRender } from '@shared/factions/schema';
import { resolveAsset } from '@shared/media/resolveAsset';
import { CanvasScale } from '@ui/layout/CanvasScale';
import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

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
 * The post's main figure: House Atreides' ingredients on top, the faction they make in the middle, and the assets drawn from it below.
 * Picking an ingredient lights the assets that use it, and picking an asset lights its ingredients.
 * The outputs are the site's own renderers fed through `FactionRender`, so the figure draws what the site draws.
 */

const FACTION = assetPublishingFaction;

type InputId =
  | 'name'
  | 'logo'
  | 'texture'
  | 'colours'
  | 'theme'
  | 'leaders'
  | 'factionLeader'
  | 'troop'
  | 'rules'
  | 'alliance';

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

type Pick = { kind: 'input'; id: InputId } | { kind: 'output'; id: OutputId } | null;

const INPUT_ORDER: readonly InputId[] = [
  'name',
  'logo',
  'texture',
  'colours',
  'theme',
  'leaders',
  'factionLeader',
  'troop',
  'rules',
  'alliance',
];

const OUTPUT_ORDER: readonly OutputId[] = [
  'sheet',
  'leaderTokens',
  'traitors',
  'troopToken',
  'token',
  'alliance',
  'shield',
];

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

const INPUTS: Record<InputId, { label: string; art: () => ReactNode }> = {
  name: { label: 'Name', art: () => <span className={styles.name}>{FACTION.name}</span> },
  logo: { label: 'Logo', art: () => <Glyph src={FACTION.logo} /> },
  texture: {
    label: 'Texture',
    art: () => <img className={styles.texture} src={resolveAsset(FACTION.background.image, 'small')} alt="" />,
  },
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
  troop: { label: 'Troop', art: () => <Glyph src={FACTION.troops[0]?.image ?? ''} /> },
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
};

/** A renderer drawn at its native canvas size and scaled to `width`, a CSS length the stylesheet's art height sets. */
function Scaled({
  size,
  round = false,
  children,
}: {
  size: { width: number; height: number };
  round?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(styles.scaled, round && styles.round)}
      style={{ '--art-aspect': size.width / size.height } as CSSProperties}
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
      <span className={styles.sheet} style={{ '--art-aspect': page.width / page.height } as CSSProperties}>
        <FactionSheetPagePreview faction={FACTION} pageNumber={1} />
      </span>
    ),
  },
  leaderTokens: {
    label: 'Leader tokens',
    art: () => (
      <span className={styles.stack}>
        {leaders.map((leader) => (
          <Scaled key={leader.name} size={disc} round>
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
        <Scaled size={disc} round>
          <TroopToken {...troops[0]} />
        </Scaled>
      ) : null,
  },
  token: {
    label: 'Faction token',
    art: () => (
      <Scaled size={disc} round>
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

/** Curves from each ingredient down into the faction, and from the faction down to each asset, measured from the laid-out tiles. */
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
function useTour(rootRef: React.RefObject<HTMLElement | null>, paused: boolean) {
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
        timer = setInterval(() => setStep((current) => (current + 1) % INPUT_ORDER.length), 2200);
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

export function FactionRecipe() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState<Pick>(null);
  const [hover, setHover] = useState<Pick>(null);
  const [touched, setTouched] = useState(false);
  const touring = useTour(rootRef, touched);
  const lit = litSets(hover ?? pick ?? (touring ? { kind: 'input', id: touring } : null));

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

  return (
    <div ref={rootRef} className={clsx(styles.root, lit && styles.focused)}>
      <svg className={styles.lines} aria-hidden>
        {lines.map((line) => (
          <path key={line.key} d={line.d} className={clsx(styles.line, lineLit(line) && styles.lit)} />
        ))}
      </svg>
      <p className={styles.heading}>Ingredients</p>
      <div className={styles.inputs}>
        {INPUT_ORDER.map((id) => (
          <UnstyledButton
            key={id}
            data-input={id}
            className={clsx(styles.tile, lit?.inputs.has(id) && styles.lit)}
            aria-pressed={pick?.kind === 'input' && pick.id === id}
            onClick={() => choose({ kind: 'input', id })}
            onMouseEnter={() => {
              setTouched(true);
              setHover({ kind: 'input', id });
            }}
            onMouseLeave={() => setHover(null)}
          >
            <span className={styles.inputArt}>{INPUTS[id].art()}</span>
            <span className={styles.label}>{INPUTS[id].label}</span>
          </UnstyledButton>
        ))}
      </div>
      <div className={styles.hub} data-hub>
        <Glyph src={FACTION.logo} />
        <span>House {FACTION.name}</span>
      </div>
      <div className={styles.outputs}>
        {OUTPUT_ORDER.map((id) => (
          <UnstyledButton
            key={id}
            data-output={id}
            className={clsx(styles.tile, lit?.outputs.has(id) && styles.lit)}
            aria-pressed={pick?.kind === 'output' && pick.id === id}
            onClick={() => choose({ kind: 'output', id })}
            onMouseEnter={() => {
              setTouched(true);
              setHover({ kind: 'output', id });
            }}
            onMouseLeave={() => setHover(null)}
          >
            <span className={styles.outputArt}>{OUTPUTS[id].art()}</span>
            <span className={styles.label}>{OUTPUTS[id].label}</span>
          </UnstyledButton>
        ))}
      </div>
    </div>
  );
}
