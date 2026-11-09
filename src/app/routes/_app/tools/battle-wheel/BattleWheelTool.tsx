import { Drawer, Slider } from '@mantine/core';
import { BATTLE_DIALING_OPTIONS } from '@shared/rulesets/battleDialing';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import clsx from 'clsx';
import { Check, Eye, Lock, Minus, Plus, RotateCcw, Settings2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { useMotionAllowed } from '@app/styles/motion';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
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
import type { WheelFace, WheelFaction, WheelLeader, WheelPlan, WheelResult, WheelRuleset } from './battleWheel';
import styles from './BattleWheelTool.module.css';
import { useBattleWheel } from './useBattleWheel';
import type { WheelState } from './useBattleWheel';

/*
 * The battle wheel tool (prototype, Norbert 2026-11-09): a phone stands in for the battle wheel at a real table.
 * Pick a leader and dial troops; the tool counts the dial and the total strength the way the table's Ruleset dials.
 * No Treachery cards. The looks below are prototypes of one tool, to choose a direction from.
 */

export type WheelLook = 'wheel' | 'total' | 'tokens' | 'sliders' | 'reveal';

type ToolProps = Readonly<{
  storageKey: string;
  initial: WheelState;
  rulesets: readonly WheelRuleset[];
  factions: readonly WheelFaction[];
  look: WheelLook;
}>;

type Wheel = Readonly<{
  ruleset: WheelRuleset;
  faction: WheelFaction;
  plan: WheelPlan;
  setPlan: (plan: WheelPlan) => void;
  result: WheelResult;
}>;

export function BattleWheelTool({ storageKey, initial, rulesets, factions, look }: ToolProps) {
  const { state, setPlan, choose, clear } = useBattleWheel(storageKey, initial);
  const [setup, setSetup] = useState(false);
  const ruleset = rulesets.find((candidate) => candidate.id === state.rulesetId) ?? rulesets[0]!;
  const faction = factions.find((candidate) => candidate.id === state.factionId) ?? factions[0]!;
  const wheel: Wheel = {
    ruleset,
    faction,
    plan: state.plan,
    setPlan,
    result: wheelResult(ruleset, faction, state.plan),
  };
  return (
    <div className={styles.tool}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.who}
          aria-label={`${faction.name} on ${ruleset.name}: change`}
          onClick={() => setSetup(true)}
        >
          <img className={styles.emblem} src={faction.emblem} alt="" />
          <span className={styles.whoWords}>
            <span className={styles.factionName}>{faction.name}</span>
            <span className={styles.rulesetName}>
              {ruleset.name} · {BATTLE_DIALING_OPTIONS[ruleset.dialing].label} dialing
            </span>
          </span>
        </button>
        <IconAction label="Clear the wheel" emphasis="quiet" icon={<RotateCcw size={20} />} onClick={clear} />
        <IconAction
          label="Ruleset and faction"
          emphasis="quiet"
          icon={<Settings2 size={20} />}
          onClick={() => setSetup(true)}
        />
      </header>
      {look === 'wheel' ? <WheelLookBody wheel={wheel} /> : null}
      {look === 'total' ? <TotalLookBody wheel={wheel} /> : null}
      {look === 'tokens' ? <TokensLookBody wheel={wheel} /> : null}
      {look === 'sliders' ? <SlidersLookBody wheel={wheel} /> : null}
      {look === 'reveal' ? <RevealLookBody wheel={wheel} onDone={clear} /> : null}
      <Drawer
        opened={setup}
        onClose={() => setSetup(false)}
        position="bottom"
        size="auto"
        title="Ruleset and faction"
        classNames={{ body: styles.setup }}
      >
        <p className={styles.setupLabel}>Your table’s Ruleset</p>
        <div className={styles.rulesets}>
          {rulesets.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={styles.choice}
              aria-pressed={candidate.id === ruleset.id}
              onClick={() => choose({ rulesetId: candidate.id })}
            >
              <strong>{candidate.name}</strong>
              <span>{BATTLE_DIALING_OPTIONS[candidate.dialing].description.split('\n')[0]}</span>
            </button>
          ))}
        </div>
        <p className={styles.setupLabel}>Your faction</p>
        <div className={styles.factions}>
          {factions.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              className={styles.factionChoice}
              aria-pressed={candidate.id === faction.id}
              onClick={() => {
                choose({ factionId: candidate.id });
                setSetup(false);
              }}
            >
              <img src={candidate.emblem} alt="" />
              <span>{candidate.name}</span>
            </button>
          ))}
        </div>
      </Drawer>
    </div>
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

function Token({ faction, face }: Readonly<{ faction: WheelFaction; face: WheelFace }>) {
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

/* Leaders as discs in a row the thumb scrolls; a tap picks one, a second tap puts it back. */
function LeaderPicker({ wheel, layout = 'row' }: Readonly<{ wheel: Wheel; layout?: 'row' | 'grid' }>) {
  const { faction, plan, setPlan } = wheel;
  const chosen = leaderOf(faction, plan);
  return (
    <div className={styles.leaderBlock}>
      <div className={layout === 'row' ? styles.leaderRow : styles.leaderGrid} role="group" aria-label="Leader">
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
  return (
    <div className={styles.stepper}>
      {icon ? <span className={styles.stepperIcon}>{icon}</span> : null}
      <span className={styles.stepperWords}>
        <span className={styles.stepperLabel}>{label}</span>
        {detail ? <span className={styles.stepperDetail}>{detail}</span> : null}
      </span>
      <IconAction
        label={`Fewer: ${label}`}
        size="xl"
        emphasis="standard"
        icon={<Minus size={22} />}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      />
      <output className={styles.stepperValue}>{value}</output>
      <IconAction
        label={`More: ${label}`}
        size="xl"
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
          icon={<Token faction={faction} face={face} />}
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

/* The sum in words: leader plus dial, and the spice it costs. */
function Sum({ wheel }: Readonly<{ wheel: Wheel }>) {
  const { result } = wheel;
  return (
    <p className={styles.sum}>
      Leader {strengthText(result.leader)} + dial {strengthText(result.dial)}
      {result.bonus ? ` (with +${result.bonus} spice strength)` : ''}
      {result.spice ? ` · pays ${result.spice} spice` : ''}
    </p>
  );
}

const RIM = Array.from({ length: 21 }, (_, number) => number);

/* A drawn battle wheel: the rim turns to the dial under the window, the chosen leader sits in the middle. */
function WheelLookBody({ wheel }: Readonly<{ wheel: Wheel }>) {
  const motion = useMotionAllowed();
  const { faction, plan, result } = wheel;
  const leader = leaderOf(faction, plan);
  const step = 360 / RIM.length;
  return (
    <main className={styles.body}>
      <div className={styles.wheelStage}>
        <svg
          viewBox="0 0 300 300"
          className={styles.wheelSvg}
          role="img"
          aria-label={`Dial ${strengthText(result.dial)}`}
        >
          <circle cx="150" cy="150" r="146" className={styles.wheelRim} />
          <g
            className={styles.wheelTurn}
            style={{ transform: `rotate(${-result.dial * step}deg)`, transition: motion ? undefined : 'none' }}
          >
            {RIM.map((number) => {
              const angle = (number * step * Math.PI) / 180;
              return (
                <text
                  key={number}
                  x={150 + Math.sin(angle) * 124}
                  y={150 - Math.cos(angle) * 124}
                  className={styles.wheelNumber}
                  transform={`rotate(${number * step} ${150 + Math.sin(angle) * 124} ${150 - Math.cos(angle) * 124})`}
                >
                  {number}
                </text>
              );
            })}
          </g>
          <path d="M 128 4 L 172 4 L 168 44 L 132 44 Z" className={styles.wheelWindow} />
          <circle cx="150" cy="150" r="98" className={styles.wheelHub} />
        </svg>
        <div className={styles.wheelCentre}>
          {leader ? (
            <Disc faction={faction} leader={leader} className={styles.wheelDisc} />
          ) : (
            <span className={styles.wheelEmpty}>No leader</span>
          )}
        </div>
        <div className={styles.wheelHalf} hidden={result.dial % 1 === 0}>
          ½
        </div>
      </div>
      <div className={styles.totalLine}>
        <span className={styles.totalLabel}>Total strength</span>
        <span className={styles.totalValue}>{strengthText(result.total)}</span>
      </div>
      <Sum wheel={wheel} />
      <LeaderPicker wheel={wheel} />
      <TroopSteppers wheel={wheel} />
      <SpiceControl wheel={wheel} />
    </main>
  );
}

/* The answer stays on top while the thumb works below: total, then leader plus dial. */
function TotalLookBody({ wheel }: Readonly<{ wheel: Wheel }>) {
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
        <LeaderPicker wheel={wheel} layout="grid" />
        <TroopSteppers wheel={wheel} />
        <SpiceControl wheel={wheel} />
      </div>
    </main>
  );
}

/* Every troop the faction owns as a token: tap the fifth to dial five, tap the last dialed again to take it back. */
function TokensLookBody({ wheel }: Readonly<{ wheel: Wheel }>) {
  const { faction, plan, setPlan, ruleset, result } = wheel;
  const most = mostUsefulSpice(ruleset, faction, plan);
  const spice = Math.min(plan.spice, most);
  return (
    <>
      <main className={styles.body}>
        <LeaderPicker wheel={wheel} />
        {faction.faces.map((face) => {
          const count = plan.troops[face.id] ?? 0;
          return (
            <section key={face.id} className={styles.tokenSection} aria-label={face.name}>
              <p className={styles.tokenTitle}>
                <strong>{face.name}</strong> · {count} dialed
                <span className={styles.stepperDetail}>{faceDetail(wheel, face)}</span>
              </p>
              <div className={styles.tokenGrid}>
                {Array.from({ length: face.count }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={styles.tokenButton}
                    aria-pressed={index < count}
                    aria-label={`Dial ${index + 1} ${face.name}`}
                    onClick={() => setPlan(withTroops(plan, face, index + 1 === count ? index : index + 1))}
                  >
                    <Token faction={faction} face={face} />
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {ruleset.dialing === 'advanced' && most > 0 ? (
          <section className={styles.tokenSection} aria-label="Spice">
            <p className={styles.tokenTitle}>
              <strong>Spice</strong> · supports {result.supported} troops
            </p>
            <div className={styles.tokenGrid}>
              {Array.from({ length: most }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  className={clsx(styles.tokenButton, styles.spiceToken)}
                  aria-pressed={index < spice}
                  aria-label={`Spend ${index + 1} spice`}
                  onClick={() => setPlan({ ...plan, spice: index + 1 === spice ? index : index + 1 })}
                >
                  1
                </button>
              ))}
            </div>
          </section>
        ) : (
          <SpiceControl wheel={wheel} />
        )}
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerScore}>
          <span>
            Dial <strong>{strengthText(result.dial)}</strong>
          </span>
          <span>
            Leader <strong>{strengthText(result.leader)}</strong>
          </span>
          <span className={styles.footerTotal}>
            Total <strong>{strengthText(result.total)}</strong>
          </span>
        </div>
      </footer>
    </>
  );
}

/* One slide per kind of troop: a thumb drags the dial up, with the big numbers above it. */
function SlidersLookBody({ wheel }: Readonly<{ wheel: Wheel }>) {
  const { faction, plan, setPlan, ruleset, result } = wheel;
  const most = mostUsefulSpice(ruleset, faction, plan);
  const leader = leaderOf(faction, plan);
  return (
    <main className={styles.body}>
      <div className={styles.bigNumbers}>
        <div className={styles.bigCell}>
          <span className={styles.scoreLabel}>Dial</span>
          <span className={styles.bigDial}>{strengthText(result.dial)}</span>
        </div>
        <div className={styles.bigCell}>
          <span className={styles.scoreLabel}>Total</span>
          <span className={styles.bigDial}>{strengthText(result.total)}</span>
          <span className={styles.stepperDetail}>
            {leader ? `with ${leader.name} ${strengthText(result.leader)}` : 'no leader'}
          </span>
        </div>
      </div>
      <LeaderPicker wheel={wheel} />
      {faction.faces.map((face) => (
        <div key={face.id} className={styles.sliderRow}>
          <div className={styles.sliderHead}>
            <span className={styles.sliderToken}>
              <Token faction={faction} face={face} />
            </span>
            <span className={styles.stepperWords}>
              <span className={styles.stepperLabel}>{face.name}</span>
              <span className={styles.stepperDetail}>{faceDetail(wheel, face)}</span>
            </span>
            <output className={styles.stepperValue}>{plan.troops[face.id] ?? 0}</output>
          </div>
          <Slider
            size="xl"
            thumbSize={32}
            min={0}
            max={face.count}
            step={1}
            label={null}
            value={plan.troops[face.id] ?? 0}
            onChange={(count) => setPlan(withTroops(plan, face, count))}
            thumbLabel={face.name}
            marks={[{ value: 0 }, { value: face.count }]}
          />
        </div>
      ))}
      {ruleset.dialing === 'advanced' && most > 0 ? (
        <div className={styles.sliderRow}>
          <div className={styles.sliderHead}>
            <SpiceDot large />
            <span className={styles.stepperWords}>
              <span className={styles.stepperLabel}>Spice</span>
              <span className={styles.stepperDetail}>Supports {result.supported} troops</span>
            </span>
            <output className={styles.stepperValue}>{Math.min(plan.spice, most)}</output>
          </div>
          <Slider
            size="xl"
            thumbSize={32}
            color="orange"
            min={0}
            max={most}
            step={1}
            label={null}
            value={Math.min(plan.spice, most)}
            onChange={(spice) => setPlan({ ...plan, spice })}
            thumbLabel="Spice"
          />
        </div>
      ) : (
        <SpiceControl wheel={wheel} />
      )}
    </main>
  );
}

/*
 * Like the real wheel, the plan stays secret: set it, lock it face down, hold to peek, and reveal it to the table
 * full screen when both plans are in.
 */
function RevealLookBody({ wheel, onDone }: Readonly<{ wheel: Wheel; onDone: () => void }>) {
  const [stage, setStage] = useState<'set' | 'locked' | 'revealed'>('set');
  const [peeking, setPeeking] = useState(false);
  const { faction, plan, result } = wheel;
  const leader = leaderOf(faction, plan);
  if (stage === 'set') {
    return (
      <>
        <main className={styles.body}>
          <LeaderPicker wheel={wheel} layout="grid" />
          <TroopSteppers wheel={wheel} />
          <SpiceControl wheel={wheel} />
        </main>
        <footer className={styles.footer}>
          <div className={styles.footerScore}>
            <span>
              Dial <strong>{strengthText(result.dial)}</strong>
            </span>
            <span className={styles.footerTotal}>
              Total <strong>{strengthText(result.total)}</strong>
            </span>
          </div>
          <LabeledAction icon={<Lock size={18} />} emphasis="strong" onClick={() => setStage('locked')}>
            Lock in the plan
          </LabeledAction>
        </footer>
      </>
    );
  }
  const face = (
    <div className={styles.revealFace}>
      {leader ? (
        <Disc faction={faction} leader={leader} className={styles.revealDisc} />
      ) : (
        <span className={styles.wheelEmpty}>No leader</span>
      )}
      <span className={styles.scoreLabel}>Dial</span>
      <span className={styles.revealDial}>{strengthText(result.dial)}</span>
      <span className={styles.revealTotal}>Total strength {strengthText(result.total)}</span>
    </div>
  );
  if (stage === 'revealed') {
    return (
      <main className={clsx(styles.body, styles.revealBody)}>
        {face}
        <LabeledAction icon={<Check size={18} />} onClick={() => (setStage('set'), onDone())}>
          Battle over: clear the wheel
        </LabeledAction>
      </main>
    );
  }
  return (
    <main className={clsx(styles.body, styles.revealBody)}>
      <div
        className={styles.lockedFace}
        style={{ '--emblem': `url(${faction.emblem})` } as CSSProperties}
        onPointerDown={() => setPeeking(true)}
        onPointerUp={() => setPeeking(false)}
        onPointerLeave={() => setPeeking(false)}
        onPointerCancel={() => setPeeking(false)}
      >
        {peeking ? (
          face
        ) : (
          <span className={styles.lockedWords}>
            <Eye size={22} /> Hold to peek
          </span>
        )}
      </div>
      <div className={styles.revealActions}>
        <LabeledAction icon={<Undo2 size={18} />} onClick={() => setStage('set')}>
          Change it
        </LabeledAction>
        <LabeledAction icon={<Eye size={18} />} emphasis="strong" onClick={() => setStage('revealed')}>
          Reveal to the table
        </LabeledAction>
      </div>
    </main>
  );
}
