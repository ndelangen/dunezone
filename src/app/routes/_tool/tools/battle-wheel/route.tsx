import { SPICE_STRENGTH_TIERS } from '@shared/play/battleDialing';
import { BATTLE_DIALING_OPTIONS } from '@shared/rulesets/battleDialing';
import { TOOL_HIDDEN_RULESETS } from '@shared/rulesets/hidden';
import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Pending } from '@ui/content/Pending';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import clsx from 'clsx';
import { Minus, Plus, RotateCcw, Settings2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';

import { readWheelFaction, useBattleWheelRulesets } from '@app/db/battleWheelTool';
import { useOrderedRulesetFactions } from '@app/db/rulesets';
import { LiveFactionSearch } from '@app/pickers/LiveFactionSearch';
import { toolPageHead } from '@app/routes/_app/tools/toolHead';
import type { FactionToken as SearchedFaction } from '@app/widgets/faction-token/FactionTokenFace';
import { TrackerPopover, TrackerTouch, useActionSize } from '@app/widgets/treachery-tracker/TrackerSurface';
import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token } from '@game/assets/faction/token/Token';
import { TroopToken } from '@game/assets/faction/troop/Troop';

import {
  leaderOf,
  mostOf,
  mostUsefulSpice,
  settled,
  spiceChoices,
  strengthText,
  supportable,
  tierPrice,
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
import styles from './route.module.css';
import { useBattleWheel } from './useBattleWheel';
import { wheelFactionFrom } from './wheelFaction';

/*
 * The battle wheel tool at /tools/battle-wheel: a standalone page with no app chrome, public, indexed and the same HTML for every visitor.
 * The wheel, kept in this browser's storage, starts in the browser.
 */
export const Route = createFileRoute('/_tool/tools/battle-wheel')({
  ssr: true,
  head: ({ match }) => toolPageHead('battle-wheel', { description: BATTLE_WHEEL_LEDE, match }),
  component: BattleWheelPage,
});

/* The Ruleset a first visit counts with, and whose first six factions, in its own order, are offered before any search. */
const BASE_RULESET = 'gf9';
const BASE_FACTIONS = 6;

const BATTLE_WHEEL_LEDE =
  'The Dune board game’s battle wheel on a phone: pick your leader and dial your troops, and see the dial and your total strength, counted the way your Ruleset dials.';

/* The whole screen is the tool; the title is there for screen readers and crawlers. */
function BattleWheelPage() {
  return (
    <PageLayout height="fullscreen">
      <PageLayout.Header>
        <PageTitle title="Battle wheel" lede={BATTLE_WHEEL_LEDE} />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">
        <ClientOnly fallback={<div className={styles.tool} />}>
          <LiveBattleWheel />
        </ClientOnly>
      </PageLayout.Content>
    </PageLayout>
  );
}

function LiveBattleWheel() {
  const { data } = useBattleWheelRulesets();
  const shown = useMemo(() => data?.filter((entry) => !TOOL_HIDDEN_RULESETS.has(entry.slug)), [data]);
  const rulesets = useMemo(
    () => shown?.map((entry): WheelRuleset => ({ id: entry.rulesetId, name: entry.name, dialing: entry.dialing })),
    [shown]
  );
  /* The base Ruleset's factions come first; without it, the first Ruleset's do, so the picker never waits on a Ruleset that is gone. */
  const base = (shown?.find((entry) => entry.slug === BASE_RULESET) ?? shown?.[0])?.rulesetId;
  return (
    <BattleWheelTool
      rulesets={rulesets}
      defaultRulesetId={base}
      starting={StartingFactions}
      search={FactionSearchLive}
      loadFaction={loadFaction}
    />
  );
}

/*
 * The base six: the first factions of the base Ruleset, in its own order.
 * Rendered inside the setup sheet only, so the list is read while the sheet is open and not during the battle.
 */
function StartingFactions({ rulesetId, children }: StartingProps) {
  /* The id comes from the Rulesets query, so it names a Ruleset. */
  const data = useOrderedRulesetFactions(rulesetId as Parameters<typeof useOrderedRulesetFactions>[0], BASE_FACTIONS);
  const factions = useMemo(
    () =>
      data?.factions.map((faction): FactionChoice => ({
        id: faction._id,
        name: faction.name,
        emblem: faction.emblem,
        background: faction.background,
      })),
    [data]
  );
  return children(factions);
}

async function loadFaction(faction: Readonly<{ id: string; name: string }>) {
  const loaded = wheelFactionFrom(await readWheelFaction(faction.id));
  if (!loaded) {
    throw new Error(`${faction.name} could not be read.`);
  }
  return loaded;
}

const FactionSearchLive: FactionSearch = LiveFactionSearch;

/*
 * The battle wheel tool: a phone stands in for the battle wheel at a real table (Norbert, 2026-11-09).
 * Pick a leader and dial troops; the tool counts the dial and the total strength the way the table's Ruleset dials.
 * No Treachery cards: the wheel only adds up.
 */

/** A search over every faction on Dune Zone. */
type StartingProps = Readonly<{
  rulesetId: string;
  children: (factions: readonly FactionChoice[] | undefined) => ReactNode;
}>;
type StartingFactionsReader = ComponentType<StartingProps>;

type FactionSearch = ComponentType<Readonly<{ seated: readonly string[]; onPick: (faction: SearchedFaction) => void }>>;

type ToolProps = Readonly<{
  /** Every Ruleset and how it dials; undefined while they load. */
  rulesets: readonly WheelRuleset[] | undefined;
  /** The Ruleset a first visit counts with. */
  defaultRulesetId?: string;
  /** Reads the factions offered first, before any search: the base game's six, handing undefined while they load. */
  starting: StartingFactionsReader;
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

function BattleWheelTool({ rulesets, defaultRulesetId, starting, search, loadFaction }: ToolProps) {
  const { state, setPlan, chooseRuleset, chooseFaction, clear } = useBattleWheel();
  const [setup, setSetup] = useState(false);
  const reading = useFactionReading(loadFaction, (loaded) => {
    chooseFaction(loaded);
    setSetup(false);
  });
  if (!rulesets || rulesets.length === 0) {
    return <NoRulesets loading={!rulesets} />;
  }
  const ruleset =
    rulesets.find((candidate) => candidate.id === state.rulesetId) ??
    rulesets.find((candidate) => candidate.id === defaultRulesetId) ??
    rulesets[0]!;
  const faction = state.faction;
  const opened = setup || !faction;
  return (
    <TrackerTouch>
      <div className={styles.tool}>
        <header className={styles.header}>
          <WhoButton faction={faction} ruleset={ruleset} onClick={() => setSetup(true)} />
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
              {/* Mounted only while open, so the starting factions and the search read nothing during the battle. */}
              {opened ? (
                <SetupSheet
                  rulesets={rulesets}
                  ruleset={ruleset}
                  onRuleset={(id) => {
                    const next = rulesets.find((candidate) => candidate.id === id)!;
                    chooseRuleset(id, faction ? settled(next, faction, state.plan) : state.plan);
                  }}
                  faction={faction}
                  startingFrom={defaultRulesetId ?? ruleset.id}
                  starting={starting}
                  recent={state.recent}
                  reading={reading}
                  search={search}
                />
              ) : null}
            </TrackerPopover.Dropdown>
          </TrackerPopover>
        </header>
        {faction ? (
          <WheelBody
            wheel={{
              ruleset,
              faction,
              plan: state.plan,
              setPlan: (plan) => setPlan(settled(ruleset, faction, plan)),
              result: wheelResult(ruleset, faction, state.plan),
            }}
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

/* While the Rulesets load, or when there are none to count with. */
function NoRulesets({ loading }: Readonly<{ loading: boolean }>) {
  return (
    <div className={styles.tool}>
      <main className={styles.body}>
        {loading ? (
          <Pending>Loading the Rulesets…</Pending>
        ) : (
          <p className={styles.failed}>There is no Ruleset to count with yet.</p>
        )}
      </main>
    </div>
  );
}

/* The starting factions, then the ones picked lately that are not among them. */
function choicesOf(starting: readonly FactionChoice[] | undefined, recent: readonly FactionChoice[] | undefined) {
  const known = new Set(starting?.map((choice) => choice.id));
  return [...(starting ?? []), ...(recent ?? []).filter((choice) => !known.has(choice.id))];
}

type FactionReading = Readonly<{
  /** The faction being read, by name. */
  loading: string | null;
  /** The faction that could not be read last, by name. */
  failed: string | null;
  pick: (choice: Readonly<{ id: string; name: string }>) => void;
}>;

/*
 * Reads a picked faction's leaders and troops, one faction at a time.
 * Picking the faction already chosen reads it again, so an edit on Dune Zone reaches the wheel.
 */
function useFactionReading(
  loadFaction: ToolProps['loadFaction'],
  onRead: (faction: WheelFaction) => void
): FactionReading {
  const [loading, setLoading] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const pick = (choice: Readonly<{ id: string; name: string }>) => {
    if (loading !== null) {
      return;
    }
    setLoading(choice.name);
    setFailed(null);
    void loadFaction(choice)
      .then(onRead)
      .catch(() => setFailed(choice.name))
      .finally(() => setLoading(null));
  };
  return { loading, failed, pick };
}

/* The header's faction and Ruleset, which opens the setup sheet. */
function WhoButton({
  faction,
  ruleset,
  onClick,
}: Readonly<{ faction: WheelFaction | null; ruleset: WheelRuleset; onClick: () => void }>) {
  return (
    <button
      type="button"
      className={styles.who}
      aria-label={faction ? `${faction.name} on ${ruleset.name}: change` : 'Pick your faction'}
      onClick={onClick}
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
  );
}

/* The setup sheet: the table's Ruleset, the faction from the starting ones, and a search over every other. */
function SetupSheet({
  rulesets,
  ruleset,
  onRuleset,
  faction,
  startingFrom,
  starting: Starting,
  recent,
  reading,
  search: Search,
}: Readonly<{
  rulesets: readonly WheelRuleset[];
  ruleset: WheelRuleset;
  onRuleset: (id: string) => void;
  faction: WheelFaction | null;
  /** The Ruleset whose first factions are offered before any search. */
  startingFrom: string;
  starting: StartingFactionsReader;
  recent: readonly FactionChoice[] | undefined;
  reading: FactionReading;
  search: FactionSearch;
}>) {
  return (
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
            onClick={() => onRuleset(candidate.id)}
          >
            <strong>{candidate.name}</strong>
            <span>{BATTLE_DIALING_OPTIONS[candidate.dialing].description.split('\n')[0]}</span>
          </button>
        ))}
      </div>
      <p className={styles.setupLabel}>Your faction</p>
      <Starting rulesetId={startingFrom}>
        {(factions) => (
          <FactionChoices
            loaded={factions !== undefined}
            choices={choicesOf(factions, recent)}
            faction={faction}
            reading={reading}
          />
        )}
      </Starting>
      {reading.loading ? <Pending>{`Reading ${reading.loading}’s leaders and troops…`}</Pending> : null}
      {reading.failed ? (
        <p className={styles.failed}>{`${reading.failed} could not be read. Try again, or pick another faction.`}</p>
      ) : null}
      <p className={styles.setupLabel}>Any faction on Dune Zone</p>
      <Search seated={faction ? [faction.id] : []} onPick={reading.pick} />
    </div>
  );
}

/* The starting factions and the ones picked lately, one tap each. */
function FactionChoices({
  loaded,
  choices,
  faction,
  reading,
}: Readonly<{
  loaded: boolean;
  choices: readonly FactionChoice[];
  faction: WheelFaction | null;
  reading: FactionReading;
}>) {
  return (
    <>
      {loaded ? null : <Pending>Loading the factions…</Pending>}
      <div className={styles.factions}>
        {choices.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            className={styles.factionChoice}
            aria-pressed={candidate.id === faction?.id}
            disabled={reading.loading !== null}
            onClick={() => reading.pick(candidate)}
          >
            <span className={styles.factionToken}>
              <FactionToken faction={candidate} />
            </span>
            <span>{candidate.name}</span>
          </button>
        ))}
      </div>
    </>
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
          max={mostOf(faction, plan, face)}
          onChange={(count) => setPlan(withTroops(faction, plan, face, count))}
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
          {[{ spice: 0, bonus: 0 }, ...SPICE_STRENGTH_TIERS].map(({ spice, bonus }) => (
            <button
              key={spice}
              type="button"
              className={styles.tier}
              disabled={!choices.includes(spice)}
              aria-pressed={result.tier === spice}
              onClick={() => setPlan({ ...plan, spice })}
            >
              {spice === 0 ? 'None' : `${tierPrice(spice, plan)} spice +${bonus}`}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.tier}
          aria-pressed={Boolean(plan.emperorAlly)}
          onClick={() => setPlan({ ...plan, emperorAlly: !plan.emperorAlly })}
        >
          Emperor's ally: half price
        </button>
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
