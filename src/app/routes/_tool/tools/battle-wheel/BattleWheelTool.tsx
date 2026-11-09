import { BATTLE_DIALING_OPTIONS } from '@shared/rulesets/battleDialing';
import { Pending } from '@ui/content/Pending';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import clsx from 'clsx';
import { Minus, Plus, RotateCcw, Settings2, Users } from 'lucide-react';
import { useState } from 'react';
import type { ComponentType, ReactNode } from 'react';

import type { FactionToken as SearchedFaction } from '@app/widgets/faction-token/FactionTokenFace';
import { TrackerPopover, TrackerTouch, useActionSize } from '@app/widgets/treachery-tracker/TrackerSurface';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token } from '@game/assets/faction/token/Token';
import { TroopToken } from '@game/assets/faction/troop/Troop';

import {
  leaderOf,
  mostUsefulSpice,
  spiceChoices,
  strengthText,
  supportable,
  troopsDialed,
  wheelResult,
  withTroops,
} from './battleWheel';
import type {
  FactionChoice,
  WheelFace,
  WheelFaction,
  WheelLeader,
  WheelPlan,
  WheelResult,
  WheelRuleset,
} from './battleWheel';
import styles from './BattleWheelTool.module.css';
import { useBattleWheel } from './useBattleWheel';
import type { WheelState } from './useBattleWheel';

/*
 * The battle wheel tool: a phone stands in for the battle wheel at a real table (Norbert, 2026-11-09).
 * Pick a leader and dial troops; the tool counts the dial and the total strength the way the table's Ruleset dials.
 * No Treachery cards: the wheel only adds up.
 */

/** A search over every faction on Dune Zone, handed in by the page, which reads the server. */
export type FactionSearch = ComponentType<
  Readonly<{ seated: readonly string[]; onPick: (faction: SearchedFaction) => void }>
>;

type ToolProps = Readonly<{
  /** Where this browser keeps the wheel. */
  storageKey: string;
  /** The wheel to show before anything is stored, for stories. */
  initial?: WheelState;
  /** Every Ruleset and how it dials; undefined while they load. */
  rulesets: readonly WheelRuleset[] | undefined;
  /** The Ruleset a first visit counts with. */
  defaultRulesetId?: string;
  /** The factions offered first, before any search: the base game's six; undefined while they load. */
  factions: readonly FactionChoice[] | undefined;
  search: FactionSearch;
  /** Reads a picked faction's leaders and troops. */
  loadFaction: (faction: Readonly<{ id: string; name: string }>) => Promise<WheelFaction>;
}>;

type Wheel = Readonly<{
  ruleset: WheelRuleset;
  faction: WheelFaction;
  plan: WheelPlan;
  setPlan: (plan: WheelPlan) => void;
  result: WheelResult;
}>;

export function BattleWheelTool({
  storageKey,
  initial,
  rulesets,
  defaultRulesetId,
  factions: starting,
  search: Search,
  loadFaction,
}: ToolProps) {
  const { state, setPlan, chooseRuleset, chooseFaction, clear } = useBattleWheel(storageKey, initial);
  const [setup, setSetup] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  if (!rulesets || rulesets.length === 0) {
    return (
      <div className={styles.tool}>
        <main className={styles.body}>
          <Pending>Loading the Rulesets…</Pending>
        </main>
      </div>
    );
  }
  const ruleset =
    rulesets.find((candidate) => candidate.id === state.rulesetId) ??
    rulesets.find((candidate) => candidate.id === defaultRulesetId) ??
    rulesets[0]!;
  const faction = state.faction;
  const choices = [
    ...(starting ?? []),
    ...(state.recent ?? []).filter((recent) => !starting?.some((known) => known.id === recent.id)),
  ];
  const pick = (choice: Readonly<{ id: string; name: string }>) => {
    if (choice.id === faction?.id) {
      setSetup(false);
      return;
    }
    setLoading(choice.name);
    setFailed(null);
    void loadFaction(choice)
      .then((loaded) => {
        chooseFaction(loaded);
        setSetup(false);
      })
      .catch(() => setFailed(choice.name))
      .finally(() => setLoading(null));
  };
  const opened = setup || !faction;
  return (
    <TrackerTouch>
      <div className={styles.tool}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.who}
            aria-label={faction ? `${faction.name} on ${ruleset.name}: change` : 'Pick your faction'}
            onClick={() => setSetup(true)}
          >
            {faction ? (
              <span className={styles.emblem}>
                <FactionToken faction={faction} />
              </span>
            ) : null}
            <span className={styles.whoWords}>
              <span className={styles.factionName}>{faction?.name ?? 'Battle wheel'}</span>
              <span className={styles.rulesetName}>
                {ruleset.name} · {BATTLE_DIALING_OPTIONS[ruleset.dialing].label} dialing
              </span>
            </span>
          </button>
          {faction ? (
            <IconAction label="Clear the wheel" emphasis="quiet" icon={<RotateCcw size={20} />} onClick={clear} />
          ) : null}
          <TrackerPopover opened={opened} onChange={(open) => setSetup(open)}>
            <TrackerPopover.Target>
              <IconAction
                label="Ruleset and faction"
                emphasis="quiet"
                icon={<Settings2 size={20} />}
                onClick={() => setSetup(true)}
              />
            </TrackerPopover.Target>
            <TrackerPopover.Dropdown>
              <div className={styles.setup}>
                <p className={styles.setupTitle}>Ruleset and faction</p>
                <p className={styles.setupLabel}>Your table’s Ruleset</p>
                <div className={styles.rulesets}>
                  {rulesets.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className={styles.choice}
                      aria-pressed={candidate.id === ruleset.id}
                      onClick={() => chooseRuleset(candidate.id)}
                    >
                      <strong>{candidate.name}</strong>
                      <span>{BATTLE_DIALING_OPTIONS[candidate.dialing].description.split('\n')[0]}</span>
                    </button>
                  ))}
                </div>
                <p className={styles.setupLabel}>Your faction</p>
                {starting ? null : <Pending>Loading the factions…</Pending>}
                <div className={styles.factions}>
                  {choices.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className={styles.factionChoice}
                      aria-pressed={candidate.id === faction?.id}
                      disabled={loading !== null}
                      onClick={() => pick(candidate)}
                    >
                      <span className={styles.factionToken}>
                        <FactionToken faction={candidate} />
                      </span>
                      <span>{candidate.name}</span>
                    </button>
                  ))}
                </div>
                {loading ? <Pending>{`Reading ${loading}’s leaders and troops…`}</Pending> : null}
                {failed ? (
                  <p className={styles.failed}>{`${failed} could not be read. Try again, or pick another faction.`}</p>
                ) : null}
                <p className={styles.setupLabel}>Any faction on Dune Zone</p>
                {opened ? <Search seated={faction ? [faction.id] : []} onPick={pick} /> : null}
              </div>
            </TrackerPopover.Dropdown>
          </TrackerPopover>
        </header>
        {faction ? (
          <WheelBody
            wheel={{ ruleset, faction, plan: state.plan, setPlan, result: wheelResult(ruleset, faction, state.plan) }}
          />
        ) : (
          <main className={styles.body}>
            <LabeledAction icon={<Users size={18} />} onClick={() => setSetup(true)}>
              Pick your faction
            </LabeledAction>
          </main>
        )}
      </div>
    </TrackerTouch>
  );
}

function Disc({
  faction,
  leader,
  className,
}: Readonly<{ faction: WheelFaction; leader: WheelLeader; className?: string }>) {
  return (
    <span className={clsx(styles.disc, className)}>
      <LeaderToken
        background={faction.background}
        image={leader.image}
        emblem={faction.emblem}
        name={leader.name}
        strength={leader.strength === null ? 'X' : String(leader.strength)}
      />
    </span>
  );
}

function TroopFace({ faction, face }: Readonly<{ faction: WheelFaction; face: WheelFace }>) {
  return (
    <TroopToken
      background={faction.background}
      image={face.image}
      star={face.star}
      hue={face.hue}
      striped={face.striped}
    />
  );
}

/* The faction's own round token, as on the table. */
function FactionToken({ faction }: Readonly<{ faction: FactionChoice }>) {
  return <Token background={faction.background} emblem={faction.emblem} />;
}

/* The faction's leaders as discs: a tap sends one into battle, a second tap takes it back. */
function LeaderPicker({ wheel }: Readonly<{ wheel: Wheel }>) {
  const { faction, plan, setPlan } = wheel;
  const chosen = leaderOf(faction, plan);
  return (
    <div className={styles.leaderBlock}>
      <div className={styles.leaderGrid} role="group" aria-label="Leader">
        {faction.leaders.map((leader) => (
          <button
            key={leader.id}
            type="button"
            className={styles.leaderButton}
            aria-pressed={leader.id === plan.leaderId}
            aria-label={`${leader.name}, strength ${leader.strength ?? 'X'}`}
            onClick={() => setPlan({ ...plan, leaderId: leader.id === plan.leaderId ? null : leader.id })}
          >
            <Disc faction={faction} leader={leader} />
          </button>
        ))}
      </div>
      <p className={styles.leaderName}>{chosen ? `${chosen.name}` : 'No leader: tap a disc to send one into battle'}</p>
      {chosen && chosen.strength === null ? (
        <Stepper
          label={`${chosen.name}’s strength (X)`}
          value={plan.leaderX}
          min={0}
          max={10}
          onChange={(leaderX) => setPlan({ ...plan, leaderX })}
        />
      ) : null}
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  icon,
  detail,
}: Readonly<{
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  icon?: ReactNode;
  detail?: string;
}>) {
  /* A thumb's width on a phone. */
  const size = useActionSize();
  return (
    <div className={styles.stepper}>
      {icon ? <span className={styles.stepperIcon}>{icon}</span> : null}
      <span className={styles.stepperWords}>
        <span className={styles.stepperLabel}>{label}</span>
        {detail ? <span className={styles.stepperDetail}>{detail}</span> : null}
      </span>
      <IconAction
        label={`Fewer: ${label}`}
        size={size}
        emphasis="standard"
        icon={<Minus size={22} />}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      />
      <output className={styles.stepperValue}>{value}</output>
      <IconAction
        label={`More: ${label}`}
        size={size}
        emphasis="standard"
        icon={<Plus size={22} />}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      />
    </div>
  );
}

function faceDetail(wheel: Wheel, face: WheelFace) {
  if (wheel.ruleset.dialing === 'advanced' && supportable(face)) {
    return `${strengthText(face.strength)}, or ${strengthText(face.supportedStrength)} with ${face.supportCost} spice · ${face.count} owned`;
  }
  const free = face.supportCost === 0 && wheel.ruleset.dialing !== 'basic' ? ', dials free' : '';
  return `Strength ${strengthText(face.supportedStrength)}${free} · ${face.count} owned`;
}

function TroopSteppers({ wheel }: Readonly<{ wheel: Wheel }>) {
  const { faction, plan, setPlan } = wheel;
  return (
    <div className={styles.stack}>
      {faction.faces.map((face) => (
        <Stepper
          key={face.id}
          icon={<TroopFace faction={faction} face={face} />}
          label={face.name}
          detail={faceDetail(wheel, face)}
          value={plan.troops[face.id] ?? 0}
          min={0}
          max={face.count}
          onChange={(count) => setPlan(withTroops(plan, face, count))}
        />
      ))}
    </div>
  );
}

/* Spice, as the Ruleset dials it: Advanced supports troops, GF9 2.0 buys a bonus, KISS charges by the troop, Basic has none. */
function SpiceControl({ wheel }: Readonly<{ wheel: Wheel }>) {
  const { ruleset, faction, plan, setPlan, result } = wheel;
  if (ruleset.dialing === 'basic') {
    return null;
  }
  if (ruleset.dialing === 'kiss') {
    return (
      <p className={styles.spiceNote}>
        <SpiceDot /> Pay <strong>{result.spice} spice</strong>: the first 2 troops are free, then 1 each.
        {result.capped ? ' The dial stops at 20.' : ''}
      </p>
    );
  }
  if (ruleset.dialing === 'gf92') {
    const choices = spiceChoices(ruleset, faction, plan);
    return (
      <div className={styles.spiceTiers} role="group" aria-label="Spice strength">
        <span className={styles.stepperLabel}>
          <SpiceDot /> Spice strength
        </span>
        <div className={styles.tierButtons}>
          {[0, 2, 4, 8].map((spice) => (
            <button
              key={spice}
              type="button"
              className={styles.tier}
              disabled={!choices.includes(spice)}
              aria-pressed={result.spice === spice}
              onClick={() => setPlan({ ...plan, spice })}
            >
              {spice === 0 ? 'None' : `${spice} spice +${{ 2: 1, 4: 2, 8: 3 }[spice]}`}
            </button>
          ))}
        </div>
      </div>
    );
  }
  const most = mostUsefulSpice(ruleset, faction, plan);
  return (
    <Stepper
      icon={<SpiceDot large />}
      label="Spice"
      detail={
        most === 0
          ? 'Nothing dialed needs spice'
          : `Supports ${result.supported} of ${troopsDialed(plan, faction)} troops`
      }
      value={Math.min(plan.spice, most)}
      min={0}
      max={most}
      onChange={(spice) => setPlan({ ...plan, spice })}
    />
  );
}

function SpiceDot({ large }: Readonly<{ large?: boolean }>) {
  return <span className={clsx(styles.spiceDot, large && styles.spiceDotLarge)} aria-hidden />;
}

/* The answer stays on top while the thumb works below: total, then leader plus dial. */
function WheelBody({ wheel }: Readonly<{ wheel: Wheel }>) {
  const { result } = wheel;
  return (
    <main className={clsx(styles.body, styles.bodyFlush)}>
      <div className={styles.scoreBand}>
        <div className={styles.scoreCell}>
          <span className={styles.scoreLabel}>Leader</span>
          <span className={styles.scoreSmall}>{strengthText(result.leader)}</span>
        </div>
        <span className={styles.scoreOp}>+</span>
        <div className={styles.scoreCell}>
          <span className={styles.scoreLabel}>Dial</span>
          <span className={styles.scoreSmall}>{strengthText(result.dial)}</span>
        </div>
        <span className={styles.scoreOp}>=</span>
        <div className={styles.scoreCell}>
          <span className={styles.scoreLabel}>Total</span>
          <span className={styles.scoreBig}>{strengthText(result.total)}</span>
        </div>
      </div>
      {result.spice ? <p className={styles.payLine}>Pays {result.spice} spice</p> : null}
      <div className={styles.padded}>
        <LeaderPicker wheel={wheel} />
        <TroopSteppers wheel={wheel} />
        <SpiceControl wheel={wheel} />
      </div>
    </main>
  );
}
