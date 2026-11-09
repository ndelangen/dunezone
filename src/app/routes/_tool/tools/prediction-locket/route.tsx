import { ScrollArea, TextInput, UnstyledButton } from '@mantine/core';
import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { PageTitle } from '@ui/block/PageTitle';
import { Pending } from '@ui/content/Pending';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { ChevronRight, Eye, Lock, LockOpen, MapPin, Minus, Plus, RotateCcw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';

import { readLockTime } from '@app/db/predictionLocketTool';
import { useTrackerToolSetup } from '@app/db/rulesets';
import { toolPageHead } from '@app/routes/_app/tools/toolHead';
import { LiveFactionSearch } from '@app/routes/_tool/tools/LiveFactionSearch';
import { FactionTokenFace } from '@app/widgets/faction-token/FactionTokenFace';
import type { FactionToken as SearchedFaction } from '@app/widgets/faction-token/FactionTokenFace';
import { TrackerPopover, TrackerTouch, useActionSize } from '@app/widgets/treachery-tracker/TrackerSurface';
import { Token } from '@game/assets/faction/token/Token';

import styles from './route.module.css';
import { cityOf, knownCities, lockTimeText, phoneTimeZone, TURNS, usePredictionLocket } from './usePredictionLocket';
import type { City, LocketFaction, LockedPrediction } from './usePredictionLocket';

/*
 * The prediction locket at /tools/prediction-locket: a standalone page with no app chrome, public and the same HTML for every visitor.
 * Pick a faction and a turn, and lock it. The phone keeps the prediction; Dune Zone only gives the time it was locked, so the table
 * can trust that time at the reveal (Norbert, 2026-11-09).
 */
export const Route = createFileRoute('/_tool/tools/prediction-locket')({
  ssr: true,
  head: ({ match }) => toolPageHead('prediction-locket', { description: PREDICTION_LOCKET_LEDE, match }),
  component: PredictionLocketPage,
});

/* The Ruleset whose first six factions, in its own order, are offered before any search. */
const BASE_RULESET = 'gf9';
const BASE_FACTIONS = 6;

const PREDICTION_LOCKET_LEDE =
  'Lock a secret Dune prediction on your phone: pick the faction and the turn, and the time it was locked comes from Dune Zone, so the table can trust it at the reveal.';

function PredictionLocketPage() {
  return (
    <PageLayout height="fullscreen">
      <PageLayout.Header>
        <PageTitle title="Prediction locket" lede={PREDICTION_LOCKET_LEDE} />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">
        <ClientOnly fallback={<div className={styles.tool} />}>
          <PredictionLocketTool starting={StartingFactions} search={FactionSearchLive} lockTime={readLockTime} />
        </ClientOnly>
      </PageLayout.Content>
    </PageLayout>
  );
}

/* The base six: the first factions of the base Ruleset, in its own order; undefined while they load. */
function useStartingFactions(): readonly LocketFaction[] | undefined {
  const setup = useTrackerToolSetup({ preferredSlug: BASE_RULESET, baseSlug: BASE_RULESET, seats: BASE_FACTIONS });
  return setup?.seats.map((faction) => ({
    id: faction._id,
    name: faction.name,
    emblem: faction.emblem,
    background: faction.background,
  }));
}

function StartingFactions({
  children,
}: Readonly<{ children: (factions: readonly LocketFaction[] | undefined) => ReactNode }>) {
  return children(useStartingFactions());
}

/* Every faction on Dune Zone, searched by name; the one picked is ticked. */
const FactionSearchLive: FactionSearch = ({ picked, onPick }) => (
  <LiveFactionSearch seated={picked ? [picked] : []} onPick={onPick} />
);

type StartingFactionsReader = ComponentType<
  Readonly<{ children: (factions: readonly LocketFaction[] | undefined) => ReactNode }>
>;
type FactionSearch = ComponentType<Readonly<{ picked: string | null; onPick: (faction: SearchedFaction) => void }>>;

type ToolProps = Readonly<{
  starting: StartingFactionsReader;
  search: FactionSearch;
  /** Asks Dune Zone for the time now; the lock waits for it, and never uses the phone's own clock. */
  lockTime: () => Promise<number>;
}>;

/*
 * How long Lock waits for Dune Zone's time. A phone without signal would otherwise wait for good, as the client keeps the request
 * and sends it on reconnecting, and a time stamped minutes later is not the moment the player tapped Lock.
 */
const LOCK_TIMEOUT_MS = 10_000;

function withinTime<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

function PredictionLocketTool({ starting, search, lockTime }: ToolProps) {
  const { state, pickFaction, pickTurn, pickTimeZone, lock, reveal, clear } = usePredictionLocket();
  const timeZone = state.timeZone ?? phoneTimeZone();
  const [locking, setLocking] = useState(false);
  const [failed, setFailed] = useState(false);
  const size = useActionSize();
  const locked = state.locked;

  const onLock = async () => {
    const { faction, turn } = state;
    if (!faction || !turn || locking) {
      return;
    }
    setLocking(true);
    setFailed(false);
    try {
      /* The prediction as it stood when Lock was tapped: the picks are held still until the time comes back. */
      lock({ faction, turn, timeZone, lockedAt: await withinTime(lockTime(), LOCK_TIMEOUT_MS) });
    } catch {
      setFailed(true);
    } finally {
      setLocking(false);
    }
  };

  return (
    <TrackerTouch>
      <div className={styles.tool}>
        <header className={styles.header}>
          <span className={styles.title}>Prediction locket</span>
          {locked ? (
            <IconAction
              label={locked.revealed ? 'New prediction' : 'Throw this prediction away'}
              emphasis="quiet"
              icon={<RotateCcw size={20} />}
              onClick={() => {
                if (locked.revealed || globalThis.confirm('Throw this locked prediction away?')) {
                  clear();
                }
              }}
            />
          ) : null}
        </header>
        {locked ? (
          <LockedView locked={locked} onReveal={reveal} onNew={clear} />
        ) : (
          <>
            <main className={styles.body} inert={locking}>
              <PickFaction starting={starting} search={search} picked={state.faction} onPick={pickFaction} />
              <PickTurn turn={state.turn} onPick={pickTurn} />
              <PickCity timeZone={timeZone} onPick={pickTimeZone} />
            </main>
            <footer className={styles.dock}>
              {failed ? (
                <FormError title="Not locked">
                  Dune Zone could not be reached for the time, so nothing was locked. Try again.
                </FormError>
              ) : null}
              <LabeledAction
                icon={<Lock size={18} />}
                emphasis="strong"
                size={size}
                busy={locking}
                disabledReason={
                  !state.faction ? 'Pick a faction first.' : !state.turn ? 'Pick a turn first.' : undefined
                }
                onClick={() => void onLock()}
              >
                Lock prediction
              </LabeledAction>
            </footer>
          </>
        )}
      </div>
    </TrackerTouch>
  );
}

function FactionFace({ faction }: Readonly<{ faction: LocketFaction }>) {
  return faction.emblem ? (
    <span className={styles.token}>
      <Token background={faction.background as never} emblem={faction.emblem as never} />
    </span>
  ) : (
    <FactionTokenFace token={{ id: faction.id, name: faction.name, src: faction.src }} size={56} aria-hidden />
  );
}

/* The base six, the faction found by search if it is not one of them, and a search for any other. */
function PickFaction({
  starting: Starting,
  search: Search_,
  picked,
  onPick,
}: Readonly<{
  starting: StartingFactionsReader;
  search: FactionSearch;
  picked: LocketFaction | null;
  onPick: (faction: LocketFaction) => void;
}>) {
  const [searching, setSearching] = useState(false);
  return (
    <section className={styles.section} aria-labelledby="locket-faction">
      <h2 id="locket-faction" className={styles.label}>
        Who wins
      </h2>
      <Starting>
        {(factions) => {
          const choices = [
            ...(factions ?? []),
            ...(picked && !factions?.some((faction) => faction.id === picked.id) ? [picked] : []),
          ];
          return (
            <>
              {factions ? null : <Pending>Loading the factions…</Pending>}
              <div className={styles.factions}>
                {choices.map((faction) => (
                  <button
                    key={faction.id}
                    type="button"
                    className={styles.choice}
                    aria-pressed={faction.id === picked?.id}
                    onClick={() => onPick(faction)}
                  >
                    <FactionFace faction={faction} />
                    <span className={styles.choiceName}>{faction.name}</span>
                  </button>
                ))}
                <TrackerPopover opened={searching} onChange={setSearching}>
                  <TrackerPopover.Target>
                    <button type="button" className={styles.choice} onClick={() => setSearching(true)}>
                      <span className={styles.searchMark}>
                        <Search size={24} />
                      </span>
                      <span className={styles.choiceName}>Another faction</span>
                    </button>
                  </TrackerPopover.Target>
                  <TrackerPopover.Dropdown>
                    {searching ? (
                      <Search_
                        picked={picked?.id ?? null}
                        onPick={(faction) => {
                          onPick({ id: faction.id, name: faction.name, src: faction.src ?? null });
                          setSearching(false);
                        }}
                      />
                    ) : null}
                  </TrackerPopover.Dropdown>
                </TrackerPopover>
              </div>
            </>
          );
        }}
      </Starting>
    </section>
  );
}

function PickTurn({ turn, onPick }: Readonly<{ turn: number | null; onPick: (turn: number) => void }>) {
  return (
    <section className={styles.section} aria-labelledby="locket-turn">
      <h2 id="locket-turn" className={styles.label}>
        On turn
      </h2>
      <div className={styles.turns}>
        {Array.from({ length: TURNS }, (_, index) => index + 1).map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={styles.turn}
            aria-pressed={candidate === turn}
            aria-label={`Turn ${candidate}`}
            onClick={() => onPick(candidate)}
          >
            {candidate}
          </button>
        ))}
      </div>
      <div className={styles.stepper}>
        <IconAction
          label="Earlier turn"
          size="xl"
          icon={<Minus size={22} />}
          disabledReason={!turn || turn <= 1 ? 'Turn 1 is the first.' : undefined}
          onClick={() => turn && onPick(turn - 1)}
        />
        <span className={styles.stepperTurn} aria-live="polite">
          {turn ? `Turn ${turn}` : 'No turn yet'}
        </span>
        <IconAction label="Later turn" size="xl" icon={<Plus size={22} />} onClick={() => onPick((turn ?? 0) + 1)} />
      </div>
    </section>
  );
}

/* The prediction locked: hidden, with when it was locked, until the reveal; a hold peeks at it for its owner alone. */
function LockedView({
  locked,
  onReveal,
  onNew,
}: Readonly<{ locked: LockedPrediction; onReveal: () => void; onNew: () => void }>) {
  const [peeking, setPeeking] = useState(false);
  const size = useActionSize();
  const shown = locked.revealed || peeking;
  return (
    <>
      <main className={styles.lockedBody}>
        <div className={styles.locket} data-open={shown ? 'true' : 'false'} aria-live="polite">
          {shown ? (
            <>
              <span className={styles.bigToken}>
                <FactionFace faction={locked.faction} />
              </span>
              <span className={styles.prediction}>{locked.faction.name}</span>
              <span className={styles.predictionTurn}>Turn {locked.turn}</span>
            </>
          ) : (
            <>
              <span className={styles.lockMark}>
                <Lock size={64} strokeWidth={1.5} />
              </span>
              <span className={styles.prediction}>Prediction locked</span>
            </>
          )}
        </div>
        <div className={styles.stamp}>
          <span className={styles.stampLabel}>Locked</span>
          <span className={styles.stampTime}>{lockTimeText(locked.lockedAt, locked.timeZone)}</span>
          <span className={styles.stampCity}>{cityOf(locked.timeZone).name} time, by Dune Zone’s clock</span>
        </div>
      </main>
      <footer className={styles.dock}>
        {locked.revealed ? (
          <LabeledAction icon={<RotateCcw size={18} />} size={size} onClick={onNew}>
            New prediction
          </LabeledAction>
        ) : (
          <div className={styles.dockRow}>
            <button
              type="button"
              className={styles.peek}
              aria-pressed={peeking}
              onPointerDown={() => setPeeking(true)}
              onPointerUp={() => setPeeking(false)}
              onPointerLeave={() => setPeeking(false)}
              onPointerCancel={() => setPeeking(false)}
              onContextMenu={(event) => event.preventDefault()}
              onKeyDown={(event) => (event.key === ' ' || event.key === 'Enter' ? setPeeking(true) : undefined)}
              onKeyUp={() => setPeeking(false)}
              onBlur={() => setPeeking(false)}
            >
              <Eye size={18} />
              Hold to peek
            </button>
            <LabeledAction icon={<LockOpen size={18} />} emphasis="strong" size={size} onClick={onReveal}>
              Reveal
            </LabeledAction>
          </div>
        )}
      </footer>
    </>
  );
}

/*
 * The player's city, whose time the lock is shown in (Norbert, 2026-11-09): the table reads "20:14, Amsterdam time" and knows
 * whether that was before the game began. The phone's own zone is offered until a city is named.
 */
function PickCity({ timeZone, onPick }: Readonly<{ timeZone: string; onPick: (timeZone: string) => void }>) {
  const [open, setOpen] = useState(false);
  const city = cityOf(timeZone);
  return (
    <section className={styles.section} aria-labelledby="locket-city">
      <h2 id="locket-city" className={styles.label}>
        Your city
      </h2>
      <TrackerPopover opened={open} onChange={setOpen}>
        <TrackerPopover.Target>
          <button
            type="button"
            className={styles.city}
            onClick={() => setOpen(true)}
            aria-label={`Your city: ${city.name}`}
            aria-describedby="locket-city-why"
          >
            <MapPin size={20} />
            <span className={styles.cityWords}>
              <span className={styles.cityName}>{city.name}</span>
              <span className={styles.cityRegion}>{city.region}</span>
            </span>
            <ChevronRight size={20} />
          </button>
        </TrackerPopover.Target>
        <TrackerPopover.Dropdown>
          {open ? (
            <CitySearch
              timeZone={timeZone}
              onPick={(picked) => {
                onPick(picked);
                setOpen(false);
              }}
            />
          ) : null}
        </TrackerPopover.Dropdown>
      </TrackerPopover>
      <p id="locket-city-why" className={styles.why}>
        {CITY_WHY}
      </p>
    </section>
  );
}

const CITY_RESULTS = 40;

/* Why the city matters, and that it goes nowhere (Norbert, 2026-11-09). */
const CITY_WHY =
  'Pick any city in your own time zone. The lock time is shown in that city’s time, so it has to be right for the table to trust it. Your city never leaves this phone, and nothing is logged.';

function CitySearch({ timeZone, onPick }: Readonly<{ timeZone: string; onPick: (timeZone: string) => void }>) {
  const [query, setQuery] = useState('');
  const cities = useMemo(() => knownCities(), []);
  const needle = query.trim().toLowerCase();
  const found: readonly City[] = needle
    ? cities.filter((city) => city.name.toLowerCase().includes(needle) || city.region.toLowerCase().includes(needle))
    : cities;
  return (
    <div className={styles.citySearch}>
      <TextInput
        type="search"
        aria-label="Search cities"
        placeholder="Search cities"
        size="lg"
        leftSection={<Search size={16} />}
        value={query}
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <ScrollArea.Autosize mah="55dvh" type="auto" overscrollBehavior="contain">
        <ul className={styles.cityList} aria-label="Cities">
          {found.slice(0, CITY_RESULTS).map((city) => (
            <li key={city.timeZone}>
              <UnstyledButton
                className={styles.cityRow}
                aria-pressed={city.timeZone === timeZone}
                onClick={() => onPick(city.timeZone)}
              >
                <span className={styles.cityName}>{city.name}</span>
                <span className={styles.cityRegion}>{city.region}</span>
              </UnstyledButton>
            </li>
          ))}
        </ul>
        {found.length === 0 ? <p className={styles.cityNone}>No city by that name. Try a bigger city nearby.</p> : null}
      </ScrollArea.Autosize>
    </div>
  );
}
