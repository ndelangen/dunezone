import { publishedHref } from '@shared/asset-publishing/publicationTargets';
import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Pending } from '@ui/content/Pending';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Eye, Lock, LockOpen, RotateCcw, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';

import { useCataloguePickerGroup } from '@app/db/cataloguePicker';
import { readLockTime } from '@app/db/predictionLocketTool';
import { useTrackerToolSetup } from '@app/db/rulesets';
import { toolPageHead } from '@app/routes/_app/tools/toolHead';
import { FactionTokenFace } from '@app/widgets/faction-token/FactionTokenFace';
import type { FactionToken as SearchedFaction } from '@app/widgets/faction-token/FactionTokenFace';
import { FactionSearchList } from '@app/widgets/treachery-tracker/FactionSearchList';
import type { FactionSearchStatus } from '@app/widgets/treachery-tracker/FactionSearchList';
import { TrackerPopover, TrackerTouch, useActionSize } from '@app/widgets/treachery-tracker/TrackerSurface';
import { Token } from '@game/assets/faction/token/Token';

import styles from './route.module.css';
import { lockedAgoText, TURNS, usePredictionLocket } from './usePredictionLocket';
import type { LocketFaction, LockedPrediction } from './usePredictionLocket';

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

/* Every faction on Dune Zone, searched by name, each with its published token. */
const FactionSearchLive: FactionSearch = ({ picked, onPick }) => {
  const [query, setQuery] = useState('');
  const read = useCataloguePickerGroup('faction', query.trim(), undefined);
  const factions = read.results.flatMap((choice) =>
    choice.kind === 'faction'
      ? [{ id: choice.id, name: choice.faction.data.name, src: publishedHref('faction-token', choice.id) }]
      : []
  );
  const status: FactionSearchStatus =
    read.status === 'LoadingFirstPage'
      ? 'loading'
      : read.status === 'CanLoadMore'
        ? 'more'
        : read.status === 'LoadingMore'
          ? 'loading-more'
          : 'done';
  return (
    <FactionSearchList
      query={query}
      onQuery={setQuery}
      factions={factions}
      seated={picked ? [picked] : []}
      status={status}
      onMore={() => read.loadMore(12)}
      onPick={onPick}
    />
  );
};

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

function PredictionLocketTool({ starting, search, lockTime }: ToolProps) {
  const { state, pickFaction, pickTurn, lock, reveal, clear } = usePredictionLocket();
  const [locking, setLocking] = useState(false);
  const [failed, setFailed] = useState(false);
  const size = useActionSize();
  const locked = state.locked;

  const onLock = async () => {
    setLocking(true);
    setFailed(false);
    try {
      lock(await lockTime());
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
          <LockedView locked={locked} lockTime={lockTime} onReveal={reveal} onNew={clear} />
        ) : (
          <>
            <main className={styles.body}>
              <PickFaction starting={starting} search={search} picked={state.faction} onPick={pickFaction} />
              <PickTurn turn={state.turn} onPick={pickTurn} />
            </main>
            <footer className={styles.dock}>
              {failed ? (
                <p className={styles.problem} role="alert">
                  Dune Zone could not be reached for the time, so nothing was locked. Try again.
                </p>
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
    </section>
  );
}

/* The prediction locked: hidden, with how long ago it was locked, until the reveal; a hold peeks at it for its owner alone. */
function LockedView({
  locked,
  lockTime,
  onReveal,
  onNew,
}: Readonly<{ locked: LockedPrediction; lockTime: () => Promise<number>; onReveal: () => void; onNew: () => void }>) {
  const [peeking, setPeeking] = useState(false);
  const now = useServerNow(lockTime, locked.revealed);
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
          <span className={styles.stampAgo}>
            {typeof now === 'number' ? `Locked ${lockedAgoText(locked.lockedAt, now)}` : 'Locked'}
          </span>
          <span className={styles.stampTime}>
            {now === 'unreachable'
              ? 'Dune Zone could not be reached to tell how long ago.'
              : now === null
                ? 'Asking Dune Zone how long ago…'
                : 'By Dune Zone’s clock, not this phone’s'}
          </span>
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
 * The time now by Dune Zone's clock, ticking every half minute, so "locked 2 hours ago" is true whatever the phone's clock says.
 * Asked again at the reveal; between asks the phone only counts the time passed since, which setting its clock does not change.
 * Null while asking, and 'unreachable' when Dune Zone cannot be reached, so the page shows the lock time alone.
 */
function useServerNow(lockTime: () => Promise<number>, revealed: boolean): number | null | 'unreachable' {
  const [now, setNow] = useState<number | null | 'unreachable'>(null);
  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    lockTime().then(
      (server) => {
        if (!current) {
          return;
        }
        /* The phone's monotonic clock counts the time since: it runs on whatever the wall clock is set to. */
        const offset = server - performance.now();
        setNow(server);
        timer = setInterval(() => setNow(offset + performance.now()), 30_000);
      },
      () => current && setNow('unreachable')
    );
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [lockTime, revealed]);
  return now;
}
