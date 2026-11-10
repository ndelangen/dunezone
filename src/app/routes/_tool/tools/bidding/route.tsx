import {
  Group,
  Stack,
  Switch,
  Text,
  Select,
  NumberInput,
  UnstyledButton,
  Menu,
  Drawer,
  TextInput,
  SimpleGrid,
} from '@mantine/core';
import type { AuctionState, BiddingContext, BiddingAction, BiddingFaction } from '@shared/tools/biddingSession';
import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { FormError } from '@ui/block/FormError';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { EmptyNote } from '@ui/content/EmptyNote';
import { StatusBadge } from '@ui/content/StatusBadge';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { SheetPopover, TouchSurface } from '@ui/surface/TouchSheet';
import {
  Plus,
  Minus,
  Settings2,
  Users,
  X,
  Play,
  History,
  Layers,
  ArrowRight,
  ArrowLeft,
  Gavel,
  Hand,
  Mic,
  MicOff,
  MoreHorizontal,
  QrCode,
  RotateCcw,
  Volume2,
  VolumeX,
  LogOut,
} from 'lucide-react';
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { CSSProperties } from 'react';
import { renderSVG } from 'uqr';

import { readBiddingRulesets, readBiddingSetup, readBiddingFaction } from '@db/biddingTool';
import { LiveFactionSearch } from '@app/pickers/LiveFactionSearch';
import { toolPageHead } from '@app/routes/_app/tools/toolHead';
import { useMotionAllowed } from '@app/styles/motion';
import { FactionSeating } from '@app/widgets/faction-seating/FactionSeating';
import { FactionTokenFace } from '@app/widgets/faction-token/FactionTokenFace';

import { BiddingClient } from './client';
import type { BiddingClientState } from './client';
import styles from './route.module.css';
import { auctionSetupFrom, BiddingSetupRequests } from './setupRequests';

const DESCRIPTION =
  'Run Treachery bidding at a physical Dune table. Track hands, point to the next bidder and use phone remotes, voice or the central display.';
export const Route = createFileRoute('/_tool/tools/bidding')({
  ssr: true,
  validateSearch: (search: Record<string, unknown>) => ({
    join: typeof search.join === 'string' ? search.join : undefined,
    table: typeof search.table === 'string' ? search.table : undefined,
  }),
  head: ({ match }) => toolPageHead('bidding', { description: DESCRIPTION, match }),
  component: BiddingPage,
});
function BiddingPage() {
  const search = Route.useSearch();
  return (
    <PageLayout height="fullscreen">
      <PageLayout.Header>
        <PageTitle title="Bidding" lede={DESCRIPTION} />
      </PageLayout.Header>
      <PageLayout.Content width="viewport">
        <ClientOnly fallback={<Text>Opening the bidding table…</Text>}>
          <BiddingApplication initial={search} />
        </ClientOnly>
      </PageLayout.Content>
    </PageLayout>
  );
}
type WelcomeState = {
  code: string;
  rulesetId: string | null;
  rulesets: RulesetChoice[];
  loading: boolean;
  leaving: boolean;
  error: string | null;
};
type WelcomeEvent =
  | { type: 'rulesets-loaded'; rulesets: RulesetChoice[] }
  | { type: 'choose-ruleset'; id: string | null }
  | { type: 'edit-code'; code: string }
  | { type: 'loading' }
  | { type: 'leaving' }
  | { type: 'left-table' }
  | { type: 'settled'; error: string | null }
  | { type: 'failed'; error: string };
function welcomeReducer(state: WelcomeState, event: WelcomeEvent): WelcomeState {
  switch (event.type) {
    case 'rulesets-loaded':
      return { ...state, rulesets: event.rulesets };
    case 'choose-ruleset':
      return { ...state, rulesetId: event.id };
    case 'edit-code':
      return { ...state, code: event.code };
    case 'loading':
      return { ...state, loading: true, error: null };
    case 'leaving':
      return { ...state, loading: true, leaving: true, error: null };
    case 'left-table':
      return { ...state, code: '', loading: false, leaving: false, error: null };
    case 'settled':
      return { ...state, loading: false, leaving: false, error: event.error };
    case 'failed':
      return { ...state, loading: false, leaving: false, error: event.error };
  }
}
type RulesetChoice = Awaited<ReturnType<typeof readBiddingRulesets>>[number];
async function loadNewTableSetup(rulesets: RulesetChoice[], selectedId: string | null) {
  const choice =
    rulesets.find((ruleset) => ruleset.id === selectedId) ??
    rulesets.find((ruleset) => ruleset.slug === 'gf9') ??
    rulesets[0];
  if (!choice) {
    throw new Error('No rulesets are available. Try again when the catalogue is reachable.');
  }
  const setup = await readBiddingSetup(choice.id);
  if (!setup || setup.seats.length < 2) {
    throw new Error('This ruleset needs at least two factions. Choose another ruleset.');
  }
  return auctionSetupFrom(setup);
}
function BiddingApplication({ initial }: Readonly<{ initial: { join?: string; table?: string } }>) {
  /* Consuming a join link changes the URL, not the client that owns this table. */
  const [bootSearch] = useState(initial);
  const [owner, setOwner] = useState<{ client: BiddingClient; key: string } | null>(null);
  useEffect(() => {
    const client = new BiddingClient();
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- Each effect owns a fresh client because cleanup disposes it, including during StrictMode replay.
    setOwner({ client, key: crypto.randomUUID() });
    void client.initialize(bootSearch);
    return () => client.dispose();
  }, [bootSearch]);
  return owner ? (
    <ConnectedBiddingApplication key={owner.key} client={owner.client} initial={initial} />
  ) : (
    <Text>Opening the bidding table…</Text>
  );
}
function selectedNewCentral(view: BiddingClientState, previousTable: string | undefined): boolean {
  return view.role === 'central' && view.snapshot !== null && view.snapshot.tableId !== previousTable;
}
function ConnectedBiddingApplication({
  client,
  initial,
}: Readonly<{ client: BiddingClient; initial: { join?: string; table?: string } }>) {
  const navigate = Route.useNavigate();
  const view = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const [local, change] = useReducer(welcomeReducer, {
    code: initial.join ?? '',
    rulesetId: null,
    rulesets: [],
    loading: false,
    leaving: false,
    error: null,
  });
  const selectionRequest = useRef(0);
  useEffect(
    () => () => {
      selectionRequest.current += 1;
    },
    []
  );
  const handledJoin = useRef(initial);
  const searchCleanup = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const followJoin = useEffectEvent(() => {
    const previous = handledJoin.current;
    handledJoin.current = initial;
    if (initial.join !== previous.join || initial.table !== previous.table) {
      searchCleanup.current = null;
    }
    if (initial.join && (initial.join !== previous.join || initial.table !== previous.table)) {
      selectionRequest.current += 1;
      change({ type: 'settled', error: null });
      client.join(initial.join, initial.table);
    }
  });
  useEffect(() => {
    followJoin();
  }, [initial.join, initial.table]);
  const searchKey = JSON.stringify(initial);
  const clearJoinSearch = () => {
    if (searchCleanup.current?.key !== searchKey) {
      const promise: Promise<void> = navigate({
        to: '/tools/bidding',
        search: (current) =>
          current.join === initial.join && current.table === initial.table
            ? { join: undefined, table: undefined }
            : current,
        replace: true,
      }).finally(() => {
        if (searchCleanup.current?.promise === promise) {
          searchCleanup.current = null;
        }
      });
      searchCleanup.current = { key: searchKey, promise };
    }
    return searchCleanup.current.promise;
  };
  const consumeJoin = useEffectEvent(() => {
    const request = selectionRequest.current;
    void clearJoinSearch().catch(() => {
      if (request === selectionRequest.current) {
        change({ type: 'failed', error: 'The table link could not be cleared.' });
      }
    });
  });
  const joinedRequestedTable = Boolean(
    initial.join &&
    view.snapshot?.code === initial.join.trim().toUpperCase() &&
    (!initial.table || view.snapshot.tableId === initial.table)
  );
  useEffect(() => {
    if (joinedRequestedTable && view.connected && view.joinPersisted) {
      consumeJoin();
    }
  }, [joinedRequestedTable, view.connected, view.joinPersisted]);
  const rulesetRequest = useRef<Promise<RulesetChoice[]> | null>(null);
  const loadRulesets = () => {
    if (!rulesetRequest.current) {
      rulesetRequest.current = readBiddingRulesets()
        .then((rulesets) => {
          change({ type: 'rulesets-loaded', rulesets });
          return rulesets;
        })
        .catch((error) => {
          rulesetRequest.current = null;
          throw error;
        });
    }
    return rulesetRequest.current;
  };
  const loadWelcome = useEffectEvent(() => {
    void loadRulesets().catch(() =>
      change({ type: 'failed', error: 'The catalogue could not be loaded. You can still join an existing table.' })
    );
  });
  useEffect(() => {
    if (view.role === 'welcome') {
      loadWelcome();
    }
  }, [view.role]);
  const newTable = async () => {
    const request = ++selectionRequest.current;
    const previousTable = client.getSnapshot().snapshot?.tableId;
    change({ type: 'loading' });
    try {
      const setup = await loadNewTableSetup(await loadRulesets(), local.rulesetId);
      if (request !== selectionRequest.current) {
        return;
      }
      await client.newTable(setup);
      if (request !== selectionRequest.current) {
        return;
      }
      if (selectedNewCentral(client.getSnapshot(), previousTable)) {
        await clearJoinSearch();
      }
      if (request === selectionRequest.current) {
        change({ type: 'settled', error: null });
      }
    } catch (error) {
      if (request === selectionRequest.current) {
        change({ type: 'failed', error: error instanceof Error ? error.message : 'The table could not open.' });
      }
    }
  };
  const setupRequests = useMemo(
    () =>
      new BiddingSetupRequests({
        current: () => client.getSnapshot().snapshot,
        apply: (action, context) => {
          client.act(action, context);
        },
        status: ({ loading, error }) => change(loading ? { type: 'loading' } : { type: 'settled', error }),
      }),
    [client]
  );
  const chooseRuleset = (id: string) => setupRequests.ruleset(() => readBiddingSetup(id));
  const addFaction = (id: string) => setupRequests.faction(() => readBiddingFaction(id));
  const joinTable = () => {
    selectionRequest.current += 1;
    client.join(local.code);
  };
  const promoteTable = async () => {
    const request = ++selectionRequest.current;
    const previousTable = client.getSnapshot().snapshot?.tableId;
    await client.promote();
    if (request === selectionRequest.current && selectedNewCentral(client.getSnapshot(), previousTable)) {
      await clearJoinSearch().catch(() => {
        if (request === selectionRequest.current) {
          change({ type: 'failed', error: 'The table link could not be cleared.' });
        }
      });
    }
  };
  const leaveTable = async () => {
    const request = ++selectionRequest.current;
    change({ type: 'leaving' });
    try {
      await client.leaveTable();
      if (request !== selectionRequest.current) {
        return;
      }
      await clearJoinSearch();
      if (request === selectionRequest.current) {
        change({ type: 'left-table' });
      }
    } catch (error) {
      if (request !== selectionRequest.current) {
        return;
      }
      await clearJoinSearch().catch(() => undefined);
      if (request === selectionRequest.current) {
        change({
          type: 'failed',
          error: error instanceof Error ? error.message : 'This device could not leave the table.',
        });
      }
    }
  };
  if (!view.snapshot) {
    return (
      <div className={styles.welcome}>
        <Stack gap="lg">
          <Section title="Bidding at your table">
            <Text>Keep cards and spice on the board. Use this device in the centre, or join as a phone remote.</Text>
          </Section>
          {local.rulesets.length > 0 && (
            <ControlBlock
              title="Ruleset"
              input={
                <Select
                  aria-label="Ruleset"
                  size="lg"
                  data={local.rulesets.map((r) => ({ value: r.id, label: r.name }))}
                  value={local.rulesetId ?? (local.rulesets.find((r) => r.slug === 'gf9') ?? local.rulesets[0]).id}
                  onChange={(value) => change({ type: 'choose-ruleset', id: value })}
                />
              }
            />
          )}
          <LabeledAction
            icon={<Users size={20} />}
            size="lg"
            intent="positive"
            emphasis="strong"
            onClick={() => void newTable()}
            disabledReason={local.loading || view.busy ? 'Opening the table…' : undefined}
          >
            New table
          </LabeledAction>
          <ControlBlock
            title="Join a table"
            input={
              <TextInput
                aria-label="Table code"
                size="lg"
                autoCapitalize="characters"
                value={local.code}
                maxLength={6}
                onChange={(e) => change({ type: 'edit-code', code: e.currentTarget.value.toUpperCase() })}
                placeholder="Six-character code"
              />
            }
          />
          <LabeledAction
            icon={<QrCode size={20} />}
            size="lg"
            onClick={joinTable}
            disabledReason={
              local.loading
                ? 'Wait for setup to finish.'
                : view.busy
                  ? 'Connecting…'
                  : local.code.length !== 6
                    ? 'Enter the six-character table code.'
                    : undefined
            }
          >
            Join table
          </LabeledAction>
          {(local.error || view.error) && (
            <FormError title="Table unavailable">{local.error || view.error || 'Try again.'}</FormError>
          )}
          <Text role="status" aria-label="Table connection" size="sm" c="dimmed">
            {view.connection}
          </Text>
        </Stack>
      </div>
    );
  }
  return (
    <BiddingScreen
      client={client}
      view={view}
      rulesets={local.rulesets}
      onLoadRulesets={() =>
        void loadRulesets().catch(() => change({ type: 'failed', error: 'The rulesets could not be loaded.' }))
      }
      onRuleset={chooseRuleset}
      onAddFaction={addFaction}
      onLeave={leaveTable}
      onPromote={promoteTable}
      leaving={local.leaving}
      error={local.error}
      loading={local.loading}
    />
  );
}
type Seat = BiddingFaction & { linked: boolean; connected: boolean };
type Local = {
  amount: number;
  draftOpportunity: number;
  selected: string;
  panel: 'bid' | 'hand' | 'limit' | 'join' | 'history' | 'add' | 'leave' | 'phase' | null;
  panelSide: 'near' | 'far';
  panelOpen: boolean;
  showNames: boolean;
  showLimits: boolean;
};
type LocalEvent =
  | { type: 'edit-bid'; amount: number; opportunity: number }
  | { type: 'select-hand'; id: string }
  | { type: 'show-names'; value: boolean }
  | { type: 'show-limits'; value: boolean }
  | { type: 'open-panel'; panel: Local['panel']; side: Local['panelSide'] };
function localReducer(state: Local, event: LocalEvent): Local {
  switch (event.type) {
    case 'edit-bid':
      return { ...state, amount: event.amount, draftOpportunity: event.opportunity };
    case 'select-hand':
      return { ...state, selected: event.id };
    case 'show-names':
      return { ...state, showNames: event.value };
    case 'show-limits':
      return { ...state, showLimits: event.value };
    case 'open-panel':
      return event.panel === null
        ? { ...state, panelOpen: false }
        : { ...state, panel: event.panel, panelSide: event.side, panelOpen: true };
  }
}
type State = Omit<AuctionState, 'seats'> &
  Local & {
    seats: Seat[];
    phoneAmount: number;
    remote: string | null;
    code: string;
    listen: boolean;
    speaking: boolean;
    log: readonly string[];
    lost: boolean;
    received: string;
    recovery: boolean;
  };
const nameOf = (state: AuctionState, id: string | null) => state.seats.find((s) => s.id === id)?.name ?? 'Player';
function phoneTurnLabel(state: AuctionState, factionId: string): string {
  switch (state.stage) {
    case 'active':
      return state.turn === factionId ? 'Your turn' : `${nameOf(state, state.turn)} to bid`;
    case 'ready':
      return 'Start new bid';
    case 'paused':
      return 'Table paused';
    case 'over':
      return 'Bidding is over';
    default:
      return 'Waiting for the table';
  }
}
function BiddingScreen({
  client,
  view,
  rulesets,
  onLoadRulesets,
  onRuleset,
  onAddFaction,
  onLeave,
  onPromote,
  leaving,
  error,
  loading,
}: Readonly<{
  client: BiddingClient;
  view: BiddingClientState;
  rulesets: RulesetChoice[];
  onLoadRulesets: () => void;
  onRuleset: (id: string, context: BiddingContext) => Promise<void>;
  onAddFaction: (id: string, context: BiddingContext) => Promise<void>;
  onLeave: () => Promise<void>;
  onPromote: () => Promise<void>;
  leaving: boolean;
  error: string | null;
  loading: boolean;
}>) {
  const snapshot = view.snapshot!;
  const game = snapshot.auction;
  const manual = game.controlMode === 'manual';
  const moderator = manual && snapshot.moderatorDeviceId === view.deviceId;
  const moderatorConnected = snapshot.moderatorDeviceId && view.connectedDeviceIds.includes(snapshot.moderatorDeviceId);
  const supportsModerator = game.controlMode !== undefined;
  const timed = !manual && game.seconds > 0;
  const [local, setLocal] = useReducer(localReducer, {
    amount: 1,
    draftOpportunity: -1,
    selected: game.seats[0].id,
    panel: null,
    panelSide: 'near',
    panelOpen: false,
    showNames: false,
    showLimits: false,
  });
  const amount =
    local.draftOpportunity === game.opportunity
      ? Math.max(local.amount, (game.high?.amount ?? 0) + 1)
      : (game.high?.amount ?? 0) + 1;
  const state: State = {
    ...game,
    ...local,
    selected: game.seats.some((seat) => seat.id === local.selected) ? local.selected : game.seats[0].id,
    amount,
    phoneAmount: amount,
    seats: game.seats.map((seat) => ({
      ...seat,
      linked: Object.values(snapshot.assignments).includes(seat.id),
      connected: view.connectedDeviceIds.some((deviceId) => snapshot.assignments[deviceId] === seat.id),
    })),
    remote: snapshot.assignments[view.deviceId] ?? null,
    code: snapshot.code,
    listen: view.listening,
    speaking: view.announcing,
    log: view.feedback,
    lost: !view.connected,
    received: view.receivedAt ? new Date(view.receivedAt).toLocaleTimeString() : 'not saved yet',
    recovery: view.recovering,
  };
  const context: BiddingContext = {
    tableId: snapshot.tableId,
    centralInstanceId: snapshot.centralInstanceId,
    generation: snapshot.generation,
    revision: snapshot.revision,
    opportunity: game.opportunity,
  };
  const act = (action: BiddingAction) => client.act(action, context);
  const configureCount = (field: 'cards' | 'seconds', value: number) => {
    if (Number.isSafeInteger(value)) {
      act({ type: 'configure', [field]: value });
    }
  };
  const setPanel = (panel: Local['panel'], panelSide: Local['panelSide'] = 'near') =>
    setLocal({ type: 'open-panel', panel, side: panelSide });
  const motion = useMotionAllowed();
  const reviewRef = useRef<HTMLDivElement>(null);
  useTableMotion(reviewRef, state, motion);
  const loadSetupRulesets = useEffectEvent(onLoadRulesets);
  useEffect(() => {
    if (game.stage === 'setup' && view.role === 'central') {
      loadSetupRulesets();
    }
  }, [game.stage, view.role]);
  const currentTurn = state.turn;
  const bidAction = (_source: string, kind: 'bid' | 'pass', value = amount, _id = currentTurn) =>
    act(kind === 'bid' ? { type: 'bid', amount: value } : { type: 'pass' });
  const handControls = (id: string) => {
    const seat = state.seats.find((s) => s.id === id) ?? state.seats[0];
    return (
      <Stack gap="md">
        <CountControl
          label={`${seat.name} hand count`}
          title="Cards in hand"
          value={seat.hand}
          onChange={(value) => act({ type: 'edit-hand', id: seat.id, field: 'hand', value })}
        />
        <CountControl
          label={`${seat.name} hand limit`}
          title="Hand limit"
          value={seat.limit}
          onChange={(value) => act({ type: 'edit-hand', id: seat.id, field: 'limit', value })}
        />
        <Group grow>
          <Switch
            size="md"
            label="Full"
            aria-label={`${seat.name} Full`}
            checked={seat.full}
            onChange={(e) => act({ type: 'edit-status', id: seat.id, field: 'full', value: e.currentTarget.checked })}
          />
          <Switch
            size="md"
            label="Always pass"
            aria-label={`${seat.name} Always pass`}
            checked={seat.pass}
            onChange={(e) => act({ type: 'edit-status', id: seat.id, field: 'pass', value: e.currentTarget.checked })}
          />
        </Group>
        <Text size="sm" c="dimmed">
          Count or limit edits recalculate Full. Always pass stays on until you switch it off.
        </Text>
      </Stack>
    );
  };
  const pad = (source: string, id = currentTurn) => (
    <Stack gap="sm">
      <CountControl
        label={`${source} bid amount`}
        title="Your bid"
        value={source === 'Phone' ? state.phoneAmount : state.amount}
        min={(state.high?.amount ?? 0) + 1}
        onChange={(value) => setLocal({ type: 'edit-bid', amount: value, opportunity: game.opportunity })}
      />
      <Group grow wrap="nowrap">
        <LabeledAction
          size="lg"
          icon={<Hand size={21} />}
          onClick={() => bidAction(source, 'pass', source === 'Phone' ? state.phoneAmount : state.amount, id)}
        >
          Pass
        </LabeledAction>
        <LabeledAction
          size="lg"
          intent="positive"
          emphasis="strong"
          icon={<Gavel size={21} />}
          onClick={() => bidAction(source, 'bid', source === 'Phone' ? state.phoneAmount : state.amount, id)}
        >
          {`Bid ${source === 'Phone' ? state.phoneAmount : state.amount}`}
        </LabeledAction>
      </Group>
      <LabeledAction
        size="lg"
        icon={<Plus size={18} />}
        accessibleName="+1"
        intent="positive"
        emphasis="strong"
        onClick={() => bidAction(source, 'bid', (state.high?.amount ?? 0) + 1, id)}
      >
        1
      </LabeledAction>
    </Stack>
  );
  const starterControl = (
    <Stack gap="sm">
      <div role="group" aria-label="Start new bid at">
        <Text size="sm" fw={700}>
          Start new bid at
        </Text>
        <div
          className={styles.starterTokens}
          style={{ gridTemplateColumns: `repeat(${Math.min(6, state.seats.length)}, minmax(0, 1fr))` }}
        >
          {state.seats.map((seat) => (
            <IconAction
              key={seat.id}
              label={`Choose ${seat.name} as first bidder`}
              tooltip={`${seat.name}${!manual && seat.full ? ' · Full' : ''}`}
              icon={<SeatToken seat={seat} size={38} ignoreFull={manual} />}
              size="3rem"
              emphasis="quiet"
              pressed={state.starter === seat.id}
              onClick={() => act({ type: 'select-starter', id: seat.id })}
            />
          ))}
        </div>
        <Text size="sm" c="dimmed">
          {nameOf(state, state.starter)}
        </Text>
      </div>
      <LabeledAction
        size="lg"
        intent="positive"
        emphasis="strong"
        icon={<Play size={20} />}
        onClick={() => act({ type: 'start' })}
      >
        Start new bid
      </LabeledAction>
    </Stack>
  );
  const manualSteps = [
    <LabeledAction
      key="back"
      size="md"
      className={styles.moderatorStep}
      icon={<ArrowLeft size={16} />}
      onClick={() => act({ type: 'back' })}
    >
      Back
    </LabeledAction>,
    <IconAction
      key="raise"
      size="3.125rem"
      icon={
        <Text size="lg" fw={600}>
          +1
        </Text>
      }
      label="+1"
      intent="positive"
      emphasis="strong"
      onClick={() => act({ type: 'raise-one' })}
    />,
    <LabeledAction
      key="pass"
      size="md"
      className={styles.moderatorStep}
      icon={<Hand size={16} />}
      onClick={() => act({ type: 'advance' })}
    >
      Pass
    </LabeledAction>,
  ];
  const confirmWinner = state.stage === 'active' && state.high && (
    <LabeledAction size="lg" icon={<Gavel size={20} />} onClick={() => act({ type: 'confirm-winner' })}>
      Confirm winner
    </LabeledAction>
  );
  const results = (
    <Stack gap="xs">
      {state.results.map((r, i) => (
        <Text size="sm" key={`${r.card}-${i}`}>
          Card {r.card} · {r.name} · {r.amount} spice
        </Text>
      ))}
      {state.results.length === 0 && <EmptyNote>No completed wins yet.</EmptyNote>}
    </Stack>
  );
  const joinUrl = new URL('/tools/bidding', location.origin);
  joinUrl.searchParams.set('join', snapshot.code);
  joinUrl.searchParams.set('table', snapshot.tableId);
  const qrMarkup = useMemo(() => renderSVG(joinUrl.href, { border: 2 }), [joinUrl.href]);
  const qr = (
    <Stack gap="md" align="center">
      <div
        className={styles.qr}
        role="img"
        aria-label="Scan to join this table"
        dangerouslySetInnerHTML={{ __html: qrMarkup }}
      />
      <Stack gap="xs" align="center">
        <Group justify="center" gap="sm">
          <Text fw={700} size="xl" aria-label="Table code">
            {state.code}
          </Text>
          {manual && view.role === 'central' && (
            <StatusBadge tone={moderatorConnected ? 'positive' : 'neutral'} live>
              {moderatorConnected ? 'Moderator connected' : 'Moderator not connected'}
            </StatusBadge>
          )}
        </Group>
        <Text size="sm" ta="center">
          Scan, then choose your faction or moderator mode.
        </Text>
        <Text size="xs" c="dimmed" ta="center">
          Or enter this code at dune.zone/tools/bidding.
        </Text>
      </Stack>
    </Stack>
  );
  function circle() {
    const current = state.stage === 'ready' || state.stage === 'setup' || !state.turn ? state.starter : state.turn;
    const angle = (state.seats.findIndex((seat) => seat.id === current) * 360) / state.seats.length;
    return (
      <div className={styles.arena} data-arena data-many={state.seats.length > 6 || undefined}>
        {state.stage !== 'over' && <BidderPointer angle={angle - 90} name={nameOf(state, current)} />}
        {state.deck?.back && (
          <img className={styles.flyingCard} data-winning-card src={state.deck.back} alt="" aria-hidden />
        )}
        <div className={styles.cardMiddle}>
          {state.stage === 'over' ? (
            <Text fw={700}>Bidding is over</Text>
          ) : state.stage === 'active' || state.stage === 'paused' ? (
            <>
              <div
                key={`${state.high?.id}-${state.high?.amount}`}
                className={styles.bidDisc}
                role="img"
                aria-label={
                  state.high ? `${nameOf(state, state.high.id)} has ${state.high.amount} spice` : 'No bid yet'
                }
              >
                {state.high && (
                  <FactionTokenFace
                    token={state.seats.find((seat) => seat.id === state.high!.id)!}
                    size="fill"
                    aria-hidden
                  />
                )}
                <span className={styles.highAmount}>{state.high?.amount ?? '0'}</span>
              </div>
              <Text className={styles.bidCountdown}>
                {state.stage === 'paused' ? (
                  'Paused'
                ) : timed ? (
                  <Countdown key={view.deadline} deadline={view.deadline} />
                ) : (
                  ''
                )}
              </Text>
            </>
          ) : (
            <>
              <Text size="sm" c="dimmed">
                Starts at
              </Text>
              {state.showNames ? (
                <Text className={styles.currentBidder} fw={700}>
                  {nameOf(state, current)}
                </Text>
              ) : (
                <div className={styles.bidDisc}>
                  <FactionTokenFace token={state.seats.find((seat) => seat.id === current)!} size="fill" aria-hidden />
                </div>
              )}
              <Text size="sm" c="dimmed">
                Tap a faction to change
              </Text>
            </>
          )}
        </div>
        {state.seats.map((seat, i) => {
          const active = state.stage !== 'over' && seat.id === current;
          const seatAngle = (i * Math.PI * 2) / state.seats.length - Math.PI / 2;
          return (
            <UnstyledButton
              key={seat.id}
              className={styles.seat}
              data-active={active || undefined}
              data-seat-id={seat.id}
              style={{
                left: `${50 + Math.cos(seatAngle) * 40}%`,
                top: `${50 + Math.sin(seatAngle) * 40}%`,
                transform: `translate(-50%, -50%) rotate(${(i * 360) / state.seats.length - 180}deg)`,
              }}
              aria-label={`${seat.name}, ${seat.hand} cards${!manual && seat.full ? ', Full' : ''}`}
              onClick={() => {
                if (state.stage === 'setup' || state.stage === 'ready') {
                  act({ type: 'select-starter', id: seat.id });
                } else {
                  setLocal({ type: 'select-hand', id: seat.id });
                  setPanel('hand', Math.sin(seatAngle) < -0.05 ? 'far' : 'near');
                }
              }}
            >
              <div className={styles.factionFace} data-faction-face data-active={active || undefined}>
                <SeatToken seat={seat} size="var(--seat-token-size)" ignoreFull={manual} />
              </div>
              <div className={styles.handInfo}>
                <div className={styles.handTotal}>
                  <strong data-animated-count={seat.hand}>{seat.hand}</strong>
                  {!manual && state.showLimits && <span>/ {seat.limit}</span>}
                </div>
                {state.showNames && (
                  <Text className={styles.seatName} fw={700}>
                    {seat.name}
                  </Text>
                )}
                {!manual && seat.pass && (
                  <Text className={styles.seatStatus} size="sm">
                    Always pass
                  </Text>
                )}
              </div>
            </UnstyledButton>
          );
        })}
      </div>
    );
  }
  const canChangePhase = state.stage === 'ready' && state.card === 1 && state.opener === null;
  const phaseSettings = (
    <ControlBlock
      title="Bid timer"
      input={
        <Select
          aria-label="Bid timer"
          size="lg"
          value={String(state.seconds)}
          data={[
            { value: '0', label: 'Off' },
            ...Array.from({ length: 14 }, (_, i) => ({
              value: String((i + 1) * 5),
              label: `${(i + 1) * 5} seconds`,
            })),
          ]}
          onChange={(value) => configureCount('seconds', Number(value))}
        />
      }
    />
  );
  const tableSetup = (
    <Stack gap="md">
      <ControlBlock
        title="Ruleset"
        input={
          <Select
            aria-label="Ruleset"
            size="lg"
            value={state.ruleset.id}
            data={rulesets.map((r) => ({ value: r.id, label: r.name }))}
            onChange={(value) => value && void onRuleset(value, context)}
          />
        }
      />
      <FactionSeating
        seats={state.seats}
        renderStatus={(seat) => {
          const connected = state.seats.find((candidate) => candidate.id === seat.id)?.connected;
          return (
            <StatusBadge tone={connected ? 'positive' : 'neutral'} live>
              {connected ? 'Connected' : 'No phone'}
            </StatusBadge>
          );
        }}
        onReorder={(ids) =>
          act({ type: 'configure', seats: ids.map((id) => game.seats.find((seat) => seat.id === id)!) })
        }
        onRemove={(id) => act({ type: 'configure', seats: game.seats.filter((seat) => seat.id !== id) })}
        onAdd={() => setPanel('add')}
        removeDisabledReason={state.seats.length <= 2 ? 'Keep at least two factions.' : undefined}
        addDisabledReason={state.seats.length >= 24 ? 'This table already has 24 factions.' : undefined}
      />
      {!manual && phaseSettings}
      <Group gap="lg">
        {!manual && (
          <Switch
            size="md"
            label="Show hand limits"
            checked={state.showLimits}
            onChange={(event) => setLocal({ type: 'show-limits', value: event.currentTarget.checked })}
          />
        )}
        <Switch
          size="md"
          label="Show faction names"
          checked={state.showNames}
          onChange={(event) => setLocal({ type: 'show-names', value: event.currentTarget.checked })}
        />
      </Group>
    </Stack>
  );
  const setup = (
    <TouchSurface>
      <div className={styles.setup} data-testid="setup-screen">
        <div className={styles.setupContent}>
          <Stack gap="md">
            <Group justify="space-between" wrap="nowrap">
              <Section title="Set up the table">{null}</Section>
              <Group gap="xs" wrap="nowrap">
                <IconAction
                  label="Leave table"
                  size="xl"
                  emphasis="quiet"
                  icon={<LogOut size={21} />}
                  onClick={() => setPanel('leave')}
                />
              </Group>
            </Group>
            <Text size="sm" c="dimmed">
              Arrange the factions to match storm order around the board. Choose the first bidder after setup, on the
              table or a remote.
            </Text>
            <SimpleGrid cols={{ base: 1, '48rem': 2 }} type="container" spacing="lg">
              {tableSetup}
              <div className={styles.setupJoin}>
                <Section title="Join the table">{qr}</Section>
              </div>
            </SimpleGrid>
          </Stack>
        </div>
        <div className={styles.setupFooter}>
          <LabeledAction
            size="lg"
            intent="positive"
            emphasis="strong"
            icon={<ArrowRight size={20} />}
            disabledReason={loading ? 'Wait for the catalogue to load.' : undefined}
            onClick={() => act({ type: 'finish-setup' })}
          >
            Finish setup
          </LabeledAction>
        </div>
      </div>
    </TouchSurface>
  );
  const tableBar = (side: State['panelSide']) => (
    <div className={styles.tableBarContents} data-side={side}>
      <div className={styles.grow}>
        <Text fw={700}>
          Turn {state.phase} · {state.stage === 'over' ? 'Phase complete' : `Card ${state.card} of ${state.cards}`}
        </Text>
        <Group gap="xs" wrap="nowrap">
          {state.high && (
            <FactionTokenFace token={state.seats.find((seat) => seat.id === state.high!.id)!} size={24} aria-hidden />
          )}
          <Text size="sm" c="dimmed">
            {state.stage === 'ready' ? (
              state.opener === null ? (
                'Choose the first bidder'
              ) : (
                'Ready for the next card'
              )
            ) : state.stage === 'paused' ? (
              timed ? (
                `Fresh ${state.seconds}s timer on Resume`
              ) : manual ? (
                'Moderator mode · check before Resume'
              ) : (
                'Timer off · check before Resume'
              )
            ) : state.stage === 'over' ? (
              'Bidding is over'
            ) : state.high ? (
              <>
                {state.high.amount} spice
                {timed ? (
                  <>
                    {' '}
                    · <Countdown key={view.deadline} deadline={view.deadline} />
                  </>
                ) : (
                  ''
                )}
              </>
            ) : manual ? (
              'Moderator mode'
            ) : (
              state.ruleset.name
            )}
          </Text>
        </Group>
      </div>
      {canChangePhase && (
        <Stack gap="xs">
          <CountControl
            label="Cards this phase"
            title="Cards"
            value={state.cards}
            onChange={(value) => configureCount('cards', value)}
          />
          <Text size="xs" c="dimmed">
            {manual
              ? `Suggested: ${state.seats.length}, one per faction.`
              : `Suggested: ${state.seats.filter((seat) => !seat.full).length}, one per non-full faction.`}
          </Text>
        </Stack>
      )}
      <div className={styles.tableBarActions}>
        {!manual && (
          <IconAction
            size="xl"
            emphasis="quiet"
            label="Toggle listening"
            pressed={state.listen}
            icon={state.listen ? <Mic size={21} /> : <MicOff size={21} />}
            onClick={() => client.setListening(!state.listen)}
          />
        )}
        <IconAction
          size="xl"
          emphasis="quiet"
          label="Toggle announcements"
          pressed={state.speaking}
          icon={state.speaking ? <Volume2 size={21} /> : <VolumeX size={21} />}
          onClick={() => client.setAnnouncements(!state.speaking)}
        />
        <Menu
          position={side === 'far' ? 'bottom-start' : 'top-end'}
          withinPortal
          styles={side === 'far' ? { dropdown: { rotate: '180deg' } } : undefined}
        >
          <Menu.Target>
            <IconAction size="xl" emphasis="quiet" label="Table controls" icon={<Settings2 size={21} />} />
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<QrCode size={18} />} onClick={() => setPanel('join', side)}>
              Join code · {state.code}
            </Menu.Item>
            <Menu.Item leftSection={<Layers size={18} />} onClick={() => setPanel('hand', side)}>
              Hand controls
            </Menu.Item>
            {canChangePhase && !manual && (
              <Menu.Item leftSection={<Settings2 size={18} />} onClick={() => setPanel('phase', side)}>
                Phase settings
              </Menu.Item>
            )}
            <Menu.Item leftSection={<History size={18} />} onClick={() => setPanel('history', side)}>
              Completed wins
            </Menu.Item>
            <Menu.CheckboxItem
              checked={state.showNames}
              closeMenuOnClick
              onChange={(value) => setLocal({ type: 'show-names', value })}
            >
              Show faction names
            </Menu.CheckboxItem>
            {!manual && (
              <Menu.CheckboxItem
                checked={state.showLimits}
                closeMenuOnClick
                onChange={(value) => setLocal({ type: 'show-limits', value })}
              >
                Show hand limits
              </Menu.CheckboxItem>
            )}
            {manual && ['setup', 'ready', 'over'].includes(state.stage) && (
              <Menu.Item
                leftSection={<Users size={18} />}
                onClick={() => act({ type: 'set-control-mode', mode: 'automatic' })}
              >
                Use player remotes
              </Menu.Item>
            )}
            {manual && !state.high && ['ready', 'active'].includes(state.stage) && (
              <Menu.Item onClick={() => act({ type: 'end-phase' })}>End phase</Menu.Item>
            )}
            <Menu.Item
              leftSection={<RotateCcw size={18} />}
              disabled={!['active', 'paused'].includes(state.stage)}
              onClick={() => act({ type: 'reset' })}
            >
              Reset this card
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item leftSection={<LogOut size={18} />} onClick={() => setPanel('leave', side)}>
              Leave table
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
        {state.stage === 'active' && manual ? (
          <>
            {confirmWinner}
            {manualSteps}
          </>
        ) : state.stage === 'active' ? (
          <>
            <LabeledAction size="md" icon={<Gavel size={18} />} onClick={() => setPanel('bid', side)}>
              Bid
            </LabeledAction>
            <LabeledAction size="md" icon={<Hand size={18} />} onClick={() => bidAction('Tablet', 'pass')}>
              Pass
            </LabeledAction>
            <LabeledAction
              size="lg"
              icon={<Plus size={18} />}
              accessibleName="+1"
              intent="positive"
              emphasis="strong"
              onClick={() => bidAction('Tablet', 'bid', (state.high?.amount ?? 0) + 1)}
            >
              1
            </LabeledAction>
          </>
        ) : state.stage === 'ready' ? (
          <LabeledAction
            size="md"
            intent="positive"
            emphasis="strong"
            icon={<Play size={20} />}
            onClick={() => act({ type: 'start' })}
          >
            Start new bid
          </LabeledAction>
        ) : state.stage === 'paused' ? (
          <LabeledAction
            size="md"
            intent="positive"
            emphasis="strong"
            icon={<Play size={20} />}
            onClick={() => act({ type: 'resume' })}
          >
            Resume
          </LabeledAction>
        ) : state.stage === 'over' ? (
          <LabeledAction size="md" icon={<ArrowRight size={20} />} onClick={() => act({ type: 'next-phase' })}>
            Next phase
          </LabeledAction>
        ) : (
          <LabeledAction size="md" icon={<QrCode size={20} />} onClick={() => setPanel('join', side)}>
            Join
          </LabeledAction>
        )}
      </div>
    </div>
  );
  const tablet = (
    <TouchSurface>
      <div className={styles.tablet} data-testid="tablet-screen">
        <header className={styles.tableBar} data-far-bar aria-label="Far-side table controls">
          {tableBar('far')}
        </header>
        <div className={styles.tabletBody} data-recovery={state.stage === 'paused' || undefined}>
          <div className={styles.circleColumn}>{circle()}</div>
          {state.stage === 'paused' && (
            <div className={styles.controlColumn}>
              <Stack gap="md">
                <Section title="Check the recovered table">
                  <Text size="sm">
                    {manual
                      ? 'Check this copy against the physical table, then Resume. Moderator mode stays manual.'
                      : 'Check this copy against the physical table, then Resume. The current bidder gets a fresh timer.'}
                  </Text>
                </Section>
                {view.receivedAt && <Text size="sm">Copy received at {state.received}.</Text>}
                <Text size="sm">
                  {state.ruleset.name} · Turn {state.phase} · Card {state.card} of {state.cards}
                </Text>
                <Text size="sm">
                  {nameOf(state, state.turn)} to bid.{' '}
                  {state.high ? `${nameOf(state, state.high.id)} has ${state.high.amount} spice.` : 'No bid yet.'}
                </Text>
                <div className={styles.compactHands}>
                  {state.seats.map((seat) => (
                    <Text size="sm" key={seat.id}>
                      {seat.name} · {seat.hand}/{seat.limit}
                      {seat.full ? ' · Full' : ''}
                      {seat.pass ? ' · Always pass' : ''}
                    </Text>
                  ))}
                </div>
                {qr}
                <Text size="sm">Phones joining this table use the code above and choose their faction.</Text>
                <Section title="Completed wins">{results}</Section>
              </Stack>
            </div>
          )}
        </div>
        <div className={styles.tableNotice} aria-live="polite">
          {state.stage === 'over' ? (
            <>
              <Text size="sm">{state.note}</Text>
              {results}
            </>
          ) : (
            <Text size="sm" c="dimmed">
              {state.stage === 'ready' || state.stage === 'paused' ? state.note : state.log[0]}
            </Text>
          )}
        </div>
        <footer className={styles.tableBar} aria-label="Near-side table controls">
          {tableBar('near')}
        </footer>
      </div>
    </TouchSurface>
  );
  const remoteSeat = state.seats.find((s) => s.id === state.remote);
  const moderatorEntryLabel = snapshot.moderatorDeviceId ? 'Take moderator control' : 'Moderator mode';
  const remoteSettings = (
    <Menu position="top-end" withinPortal>
      <Menu.Target>
        <IconAction label="Remote settings" size="xl" emphasis="quiet" icon={<MoreHorizontal size={21} />} />
      </Menu.Target>
      <Menu.Dropdown>
        {moderator ? (
          <>
            <Menu.Item leftSection={<Users size={18} />} onClick={() => act({ type: 'release-moderator' })}>
              Leave moderator controls
            </Menu.Item>
            {['setup', 'ready', 'over'].includes(state.stage) && (
              <Menu.Item onClick={() => act({ type: 'set-control-mode', mode: 'automatic' })}>
                Use player remotes
              </Menu.Item>
            )}
            {!state.high && ['ready', 'active'].includes(state.stage) && (
              <Menu.Item onClick={() => act({ type: 'end-phase' })}>End phase</Menu.Item>
            )}
          </>
        ) : (
          <>
            <Menu.Item leftSection={<Users size={18} />} onClick={() => act({ type: 'assign', factionId: null })}>
              Change faction
            </Menu.Item>
            {supportsModerator && (
              <Menu.Item leftSection={<Gavel size={18} />} onClick={() => act({ type: 'claim-moderator' })}>
                {moderatorEntryLabel}
              </Menu.Item>
            )}
          </>
        )}
        <Menu.Item leftSection={<History size={18} />} onClick={() => client.showRecovery()}>
          Recovery copy
        </Menu.Item>
        {!manual && (
          <Menu.Item
            leftSection={<RotateCcw size={18} />}
            disabled={!['active', 'paused'].includes(state.stage)}
            onClick={() => act({ type: 'reset' })}
          >
            Reset this card
          </Menu.Item>
        )}
        <Menu.Divider />
        <Menu.Item leftSection={<LogOut size={18} />} onClick={() => setPanel('leave')}>
          Leave table
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
  const remote = (
    <TouchSurface>
      <div className={styles.phone} data-testid="phone-screen">
        <header className={styles.deviceHeader}>
          {remoteSeat && <FactionTokenFace token={remoteSeat} size={40} aria-hidden />}
          <div className={styles.grow}>
            <Text fw={700}>{moderator ? 'Moderator' : (remoteSeat?.name ?? 'Join the table')}</Text>
            <Text size="xs" c="dimmed">
              {state.lost ? 'Tablet unavailable' : `Table ${state.code}`}
            </Text>
          </div>
        </header>
        {state.recovery ? (
          <div className={styles.phoneScroll}>
            <Stack gap="md">
              <Section title="Recovery copy">
                <Text size="sm">This phone keeps its latest received table copy.</Text>
              </Section>
              <Text size="sm">
                Copy received at {state.received} · Turn {state.phase} · {state.ruleset.name}
              </Text>
              <Text size="sm">
                {manual
                  ? 'Moderator mode. No automatic passes or wins.'
                  : timed
                    ? `${state.seconds}s per bidder. Resume gives a fresh full timer.`
                    : 'Timer off.'}
              </Text>
              <Text size="sm" c="dimmed">
                This is the latest copy this phone received. Check it against the physical table.
              </Text>
              <Text fw={700}>
                Card {state.card} of {state.cards} · {nameOf(state, state.turn)} to bid
              </Text>
              <Text>{state.high ? `${nameOf(state, state.high.id)} has ${state.high.amount}` : 'No bid yet'}</Text>
              <div className={styles.compactHands}>
                {state.seats.map((s) => (
                  <Text size="sm" key={s.id}>
                    {s.name} · {s.hand}/{s.limit}
                    {s.full ? ' · Full' : ''}
                    {s.pass ? ' · Always pass' : ''}
                  </Text>
                ))}
              </div>
              <Section title="Completed wins">{results}</Section>
              <LabeledAction
                size="lg"
                icon={<Play size={20} />}
                intent="positive"
                emphasis="strong"
                onClick={() => void onPromote()}
                disabledReason={view.busy ? 'Opening the new table…' : undefined}
              >
                Use this phone as central
              </LabeledAction>
              {view.connected && (
                <LabeledAction icon={<ArrowRight size={18} />} onClick={() => client.hideRecovery()}>
                  Return to remote
                </LabeledAction>
              )}
              <LabeledAction size="lg" icon={<LogOut size={20} />} onClick={() => setPanel('leave')}>
                Leave table
              </LabeledAction>
            </Stack>
          </div>
        ) : moderator ? (
          <>
            <div className={styles.phoneScroll}>
              <Stack gap="md" align="center" className={styles.phoneBid} aria-live="polite">
                <Text size="sm" c="dimmed">
                  {state.stage === 'over' ? 'Phase complete' : `Card ${state.card} of ${state.cards}`}
                </Text>
                <FactionTokenFace
                  token={state.seats.find((seat) => seat.id === (state.turn ?? state.starter))!}
                  size={80}
                  aria-hidden
                />
                <Text className={styles.phoneTurn} fw={700}>
                  {state.stage === 'setup'
                    ? 'The table is being set up.'
                    : state.stage === 'paused'
                      ? 'Table paused'
                      : state.stage === 'ready'
                        ? 'Start new bid'
                        : state.stage === 'over'
                          ? 'Bidding is over'
                          : nameOf(state, state.turn)}
                </Text>
                {state.high ? (
                  <>
                    <Text className={styles.phoneHigh} fw={700}>
                      {state.high.amount}
                    </Text>
                    <Text size="sm">{nameOf(state, state.high.id)} · spice</Text>
                  </>
                ) : (
                  <Text size="sm" c="dimmed">
                    {state.note || 'You control bidding for every faction.'}
                  </Text>
                )}
                <Text size="sm" c="dimmed">
                  Full, Always pass and the timer do not skip anyone.
                </Text>
                {state.log[0] && (
                  <Text size="xs" c="dimmed">
                    {state.log[0]}
                  </Text>
                )}
              </Stack>
            </div>
            <footer className={styles.phoneDock}>
              <Stack gap="sm">
                <Group justify="space-between">
                  <LabeledAction
                    size="lg"
                    icon={<RotateCcw size={20} />}
                    disabledReason={
                      state.stage === 'active' || (state.stage === 'paused' && state.resumeStage === 'active')
                        ? undefined
                        : 'Start a card before resetting it.'
                    }
                    onClick={() => act({ type: 'reset' })}
                  >
                    Reset
                  </LabeledAction>
                  {remoteSettings}
                </Group>
                {state.stage === 'active' ? (
                  <>
                    {confirmWinner}
                    <Group grow gap="xs" wrap="nowrap">
                      {manualSteps}
                    </Group>
                  </>
                ) : state.stage === 'ready' ? (
                  starterControl
                ) : state.stage === 'paused' ? (
                  <LabeledAction
                    size="lg"
                    icon={<Play size={20} />}
                    intent="positive"
                    emphasis="strong"
                    onClick={() => act({ type: 'resume' })}
                  >
                    Resume
                  </LabeledAction>
                ) : state.stage === 'over' ? (
                  <LabeledAction
                    size="lg"
                    icon={<ArrowRight size={20} />}
                    intent="positive"
                    emphasis="strong"
                    onClick={() => act({ type: 'next-phase' })}
                  >
                    Next phase
                  </LabeledAction>
                ) : (
                  <Text size="sm" ta="center" c="dimmed">
                    Waiting for setup to finish.
                  </Text>
                )}
              </Stack>
            </footer>
          </>
        ) : !remoteSeat ? (
          <div className={styles.phoneScroll}>
            <Stack gap="sm">
              <Section title="Choose your faction">
                <Text size="sm">Table {state.code}</Text>
              </Section>
              {supportsModerator && (
                <>
                  <LabeledAction size="lg" icon={<Gavel size={20} />} onClick={() => act({ type: 'claim-moderator' })}>
                    {moderatorEntryLabel}
                  </LabeledAction>
                  <Text size="sm" c="dimmed">
                    Use one phone to control every bidder and confirm each winner.
                  </Text>
                </>
              )}
              {state.seats.map((s) => (
                <LabeledAction
                  key={s.id}
                  size="lg"
                  justify="start"
                  icon={<FactionTokenFace token={s} size={30} aria-hidden />}
                  onClick={() => act({ type: 'assign', factionId: s.id })}
                >{`${s.name}${s.linked ? ' · phone linked' : ''}`}</LabeledAction>
              ))}
              <LabeledAction size="lg" icon={<LogOut size={20} />} onClick={() => setPanel('leave')}>
                Leave table
              </LabeledAction>
            </Stack>
          </div>
        ) : (
          <>
            <div className={styles.phoneScroll}>
              <div className={styles.phoneBid} aria-live="polite">
                <Text size="sm" c="dimmed">
                  {state.stage === 'over' ? 'Phase complete' : `Card ${state.card} of ${state.cards}`}
                </Text>
                <Text className={styles.phoneTurn} fw={700}>
                  {phoneTurnLabel(state, remoteSeat.id)}
                </Text>
                {state.stage === 'active' ? (
                  <>
                    <Text className={styles.phoneHigh} fw={700}>
                      {state.high?.amount ?? '0'}
                    </Text>
                    <Text size="sm">{state.high ? `${nameOf(state, state.high.id)} · spice` : 'No bid yet'}</Text>
                    <Text size="sm" c="dimmed">
                      {manual ? (
                        'Moderator mode'
                      ) : timed ? (
                        <Countdown key={view.deadline} deadline={view.deadline} />
                      ) : (
                        'Timer off'
                      )}
                    </Text>
                  </>
                ) : (
                  <Text size="sm" c="dimmed">
                    {state.stage === 'setup'
                      ? 'Choose a faction and wait for setup to finish.'
                      : state.note || 'Your hand controls are available.'}
                  </Text>
                )}
                {state.log[0] && (
                  <Text size="xs" c="dimmed">
                    {state.log[0]}
                  </Text>
                )}
              </div>
            </div>
            <footer className={styles.phoneDock}>
              <div className={styles.handSection}>
                {state.stage !== 'setup' && (
                  <>
                    <CountControl
                      label={`${remoteSeat.name} hand count`}
                      title="Your cards"
                      value={remoteSeat.hand}
                      onChange={(value) => act({ type: 'edit-hand', id: remoteSeat.id, field: 'hand', value })}
                    />
                    <Group justify="space-between" wrap="nowrap" className={styles.statusControls}>
                      <Switch
                        classNames={{ body: styles.touchToggle }}
                        size="md"
                        label="Full"
                        aria-label={`${remoteSeat.name} Full`}
                        checked={remoteSeat.full}
                        onChange={(e) =>
                          act({ type: 'edit-status', id: remoteSeat.id, field: 'full', value: e.currentTarget.checked })
                        }
                      />
                      <Switch
                        classNames={{ body: styles.touchToggle }}
                        size="md"
                        label="Always pass"
                        aria-label={`${remoteSeat.name} Always pass`}
                        checked={remoteSeat.pass}
                        onChange={(e) =>
                          act({ type: 'edit-status', id: remoteSeat.id, field: 'pass', value: e.currentTarget.checked })
                        }
                      />
                    </Group>
                  </>
                )}
                <Group justify="space-between">
                  {remoteSettings}
                  {state.stage !== 'setup' && (
                    <>
                      <Text size="sm" c="dimmed">
                        Hand limit {remoteSeat.limit}
                      </Text>
                      <IconAction
                        label="Adjust hand limit"
                        icon={<Settings2 size={18} />}
                        size="xl"
                        emphasis="quiet"
                        onClick={() => setPanel('limit')}
                      />
                    </>
                  )}
                </Group>
              </div>
              {manual ? (
                <Text size="sm" ta="center" c="dimmed">
                  The moderator controls bidding.
                </Text>
              ) : state.stage === 'active' && state.remote === state.turn ? (
                pad('Phone', remoteSeat.id)
              ) : state.stage === 'ready' ? (
                starterControl
              ) : state.stage === 'over' ? (
                <Stack gap="sm">
                  <LabeledAction
                    size="lg"
                    intent="positive"
                    emphasis="strong"
                    icon={<ArrowRight size={20} />}
                    onClick={() => act({ type: 'next-phase' })}
                  >
                    Next phase
                  </LabeledAction>
                </Stack>
              ) : (
                <Text size="sm" ta="center" c="dimmed">
                  {state.stage === 'active'
                    ? 'Your controls appear when it is your turn.'
                    : state.stage === 'paused'
                      ? 'Check the central display, then Resume.'
                      : state.stage === 'setup'
                        ? 'The table is being set up.'
                        : 'Waiting for the next phase.'}
                </Text>
              )}
            </footer>
          </>
        )}
      </div>
    </TouchSurface>
  );
  const panelLabels: Record<NonNullable<Local['panel']>, string> = {
    add: 'Add a faction',
    bid: `${nameOf(state, state.turn)} to bid`,
    hand: 'Hand controls',
    limit: 'Hand limit',
    history: 'Completed wins',
    join: 'Join the table',
    leave: 'Leave table',
    phase: 'Phase settings',
  };
  const panelLabel = state.panel ? panelLabels[state.panel] : '';
  function renderPanelBody() {
    switch (state.panel) {
      case 'leave':
        return (
          <Stack gap="md">
            <Section title="Leave table">
              <Text>
                This device will leave the table and remove its local copy. Other phones keep their saved copies.
              </Text>
            </Section>
            <Group grow>
              <LabeledAction
                size="lg"
                icon={<X size={20} />}
                onClick={() => setPanel(null)}
                disabledReason={leaving ? 'Leaving the table…' : undefined}
              >
                Cancel
              </LabeledAction>
              <LabeledAction
                size="lg"
                icon={<LogOut size={20} />}
                intent="negative"
                emphasis="strong"
                onClick={() => void onLeave()}
                disabledReason={leaving ? 'Leaving the table…' : undefined}
              >
                Leave table
              </LabeledAction>
            </Group>
          </Stack>
        );
      case 'add':
        return (
          <LiveFactionSearch
            seated={state.seats.map((seat) => seat.id)}
            onPick={(faction) => {
              void onAddFaction(faction.id, context);
              setPanel(null);
            }}
          />
        );
      case 'bid':
        if (manual || state.stage !== 'active') {
          return <Text>{state.note || 'The auction changed. Close this panel to continue.'}</Text>;
        }
        return (
          <Stack gap="md">
            <Section title={`${nameOf(state, state.turn)} to bid`}>
              <Text size="sm">
                {state.high ? `${nameOf(state, state.high.id)} has ${state.high.amount}` : 'Open the bidding'}
                {state.seconds ? (
                  <>
                    {' '}
                    · <Countdown key={view.deadline} deadline={view.deadline} />
                  </>
                ) : (
                  ' · Timer off'
                )}
              </Text>
            </Section>
            {pad('Tablet')}
            <LabeledAction
              icon={<RotateCcw size={18} />}
              onClick={() => {
                act({ type: 'reset' });
                setPanel(null);
              }}
            >
              Reset this card
            </LabeledAction>
          </Stack>
        );
      case 'hand':
        return (
          <Stack gap="md">
            <div
              className={styles.starterTokens}
              role="group"
              aria-label="Faction to edit"
              style={{ gridTemplateColumns: `repeat(${Math.min(6, state.seats.length)}, minmax(0, 1fr))` }}
            >
              {state.seats.map((seat) => (
                <IconAction
                  key={seat.id}
                  label={`Edit ${seat.name} hand`}
                  icon={<SeatToken seat={seat} size={38} />}
                  size="3rem"
                  emphasis="quiet"
                  pressed={state.selected === seat.id}
                  onClick={() => setLocal({ type: 'select-hand', id: seat.id })}
                />
              ))}
            </div>
            <Text fw={700}>{nameOf(state, state.selected)}</Text>
            {handControls(state.selected)}
          </Stack>
        );
      case 'limit':
        return remoteSeat ? (
          <CountControl
            title="Hand limit"
            label={`${remoteSeat.name} hand limit`}
            value={remoteSeat.limit}
            onChange={(value) => act({ type: 'edit-hand', id: remoteSeat.id, field: 'limit', value })}
          />
        ) : (
          <Text>Choose a faction to adjust its hand limit.</Text>
        );
      case 'phase':
        return canChangePhase ? phaseSettings : <Text>The phase has started. Close this panel to continue.</Text>;
      case 'history':
        return results;
      case 'join':
        return qr;
      default:
        return null;
    }
  }
  const panelContent = (
    <div className={styles.sheetContent}>
      {renderPanelBody()}
      {state.panel === 'bid' && (
        <div className={styles.actionRecord} aria-live="polite">
          {state.log.slice(0, 3).map((line, i) => (
            <Text key={i} size="sm" c="dimmed">
              {line}
            </Text>
          ))}
        </div>
      )}
    </div>
  );
  const panel = (
    <>
      <TouchSurface>
        <SheetPopover
          opened={state.panelOpen && state.panelSide === 'near'}
          onChange={(open) => !open && setPanel(null)}
        >
          <SheetPopover.Dropdown label={panelLabel}>{panelContent}</SheetPopover.Dropdown>
        </SheetPopover>
      </TouchSurface>
      <Drawer
        opened={state.panelOpen && state.panelSide === 'far'}
        onClose={() => setPanel(null)}
        position="top"
        size="auto"
        withCloseButton={false}
        title={panelLabel}
        padding="md"
        classNames={{
          inner: styles.farSheetInner,
          content: styles.farSheet,
          header: styles.farSheetHeader,
          body: styles.farDrawerBody,
        }}
      >
        <TouchSurface>
          <div className={styles.farSheetBody}>
            <Group justify="end">
              <IconAction
                label="Close"
                size="xl"
                emphasis="quiet"
                icon={<X size={20} />}
                onClick={() => setPanel(null)}
              />
            </Group>
            {panelContent}
          </div>
        </TouchSurface>
      </Drawer>
    </>
  );

  return (
    <div ref={reviewRef} className={styles.tool} data-motion={motion ? 'ok' : 'reduce'}>
      <div className={styles.devices} data-view={view.role === 'central' ? 'tablet' : 'phone'}>
        <section
          aria-label={view.role === 'central' ? 'Central tablet' : 'Player phone'}
          className={view.role === 'central' ? styles.tabletFrame : styles.phoneFrame}
        >
          {view.role === 'central' ? (state.stage === 'setup' ? setup : tablet) : remote}
        </section>
      </div>
      <div className={styles.connectionBar}>
        <Text role="status" aria-label="Table connection" size="xs" c="dimmed">
          {view.connection}
          {view.pending ? ' · Sending…' : ''}
        </Text>
        {view.voiceMessage && (
          <Text size="xs" c="dimmed">
            {view.voiceMessage}
          </Text>
        )}
        {(view.storageError || view.error || error) && (
          <FormError title="Table status">{view.storageError || view.error || error || 'Try again.'}</FormError>
        )}
        {loading && <Text size="xs">Loading the catalogue…</Text>}
        {view.role === 'remote' && !view.connected && !state.recovery && (
          <LabeledAction icon={<History size={18} />} onClick={() => client.showRecovery()}>
            Recovery copy
          </LabeledAction>
        )}
      </div>
      {panel}
    </div>
  );
}
function Countdown({ deadline }: Readonly<{ deadline: number | null }>) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [deadline]);
  return <>{deadline === null ? 'Paused' : `${Math.max(0, Math.ceil((deadline - now) / 1000))}s`}</>;
}
/* The battle wheel's thumb-sized minus/value/plus row, with a typed value for corrections. */
function CountControl({
  label,
  title,
  value,
  min = 0,
  onChange,
}: Readonly<{ label: string; title: string; value: number; min?: number; onChange: (value: number) => void }>) {
  return (
    <div className={styles.countControl} role="group" aria-label={label}>
      <Text className={styles.grow} size="sm">
        {title}
      </Text>
      <IconAction
        label={`Fewer: ${label}`}
        size="xl"
        emphasis="standard"
        icon={<Minus size={21} />}
        disabledReason={value <= min ? `Minimum ${min}.` : undefined}
        onClick={() => onChange(Math.max(min, value - 1))}
      />
      <NumberInput
        data-animated-count={value}
        aria-label={label}
        size="md"
        className={styles.countInput}
        value={value}
        min={min}
        hideControls
        allowDecimal={false}
        allowNegative={false}
        onChange={(next) => {
          if (typeof next === 'number' && Number.isSafeInteger(next) && next >= min) {
            onChange(next);
          }
        }}
      />
      <IconAction
        label={`More: ${label}`}
        size="xl"
        emphasis="standard"
        icon={<Plus size={21} />}
        onClick={() => onChange(value + 1)}
      />
    </div>
  );
}

/* Dune Play's bluntOutline in SVG coordinates: a hollow round end with a rounded nose. */
function bluntBidderOutline(radius: number, nose: number, reach: number) {
  const angle = Math.acos((radius - nose) / reach);
  const x = radius * Math.cos(angle);
  const y = radius * Math.sin(angle);
  const nx = reach + nose * Math.cos(angle);
  const ny = nose * Math.sin(angle);
  return `M ${x} ${y} A ${radius} ${radius} 0 1 1 ${x} ${-y} L ${nx} ${-ny} A ${nose} ${nose} 0 0 1 ${nx} ${ny} Z`;
}

/* As in Play's bidderRotation, each turn takes the shorter way around the table. */
function BidderPointer({ angle, name }: Readonly<{ angle: number; name: string }>) {
  const [rotation, setRotation] = useState({ target: angle, shown: angle });
  if (rotation.target !== angle) {
    const delta = ((((angle - rotation.shown + 540) % 360) + 360) % 360) - 180;
    setRotation({ target: angle, shown: rotation.shown + delta });
  }
  return (
    <svg className={styles.arrow} viewBox="0 0 100 100" aria-label={`Bidder pointer: ${name}`}>
      <g className={styles.bidderTurn} style={{ transform: `rotate(${rotation.shown}deg)` }}>
        <path d={bluntBidderOutline(12, 1.6, 26)} transform="translate(50 50)" />
      </g>
    </svg>
  );
}

/* The spice deck's lift, travel, landing jolt and ring, applied to a physical-card win. */
function useTableMotion(root: { current: HTMLDivElement | null }, state: State, motion: boolean) {
  const seen = useRef(new WeakMap<Element, string>());
  const wins = useRef(state.results.length);
  useLayoutEffect(() => {
    const page = root.current;
    if (!page) {
      return;
    }
    for (const element of page.querySelectorAll<HTMLElement>('[data-animated-count]')) {
      const value = element.dataset.animatedCount!;
      const before = seen.current.get(element);
      seen.current.set(element, value);
      if (motion && before !== undefined && before !== value) {
        element.animate(
          [{ scale: '1' }, { scale: '1.24', offset: 0.35 }, { scale: '0.95', offset: 0.7 }, { scale: '1' }],
          { duration: 420, easing: 'ease-out' }
        );
      }
    }
    const added = state.results.length > wins.current;
    wins.current = state.results.length;
    if (!motion) {
      for (const animation of page.getAnimations({ subtree: true })) {
        animation.cancel();
      }
      return;
    }
    if (!added) {
      return;
    }
    const winner = state.seats.find((seat) => seat.id === state.results.at(-1)?.factionId);
    if (!winner) {
      return;
    }
    for (const arena of page.querySelectorAll<HTMLElement>('[data-arena]')) {
      const target = arena.querySelector<HTMLElement>(`[data-seat-id="${winner.id}"] [data-faction-face]`);
      const card = arena.querySelector<HTMLElement>('[data-winning-card]');
      if (!target || !card) {
        continue;
      }
      const frame = arena.getBoundingClientRect();
      const end = target.getBoundingClientRect();
      const dx = end.x + end.width / 2 - frame.x - frame.width / 2;
      const dy = end.y + end.height / 2 - frame.y - frame.height / 2;
      const at = (x: number, y: number, scale: number, turn: number) =>
        `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${turn}deg) scale(${scale})`;
      card.animate(
        [
          { opacity: 0, transform: at(0, 0, 0.7, -15) },
          { opacity: 1, transform: at(0, -16, 1.2, 8), offset: 0.25 },
          { opacity: 1, transform: at(dx, dy, 0.7, 0), offset: 0.8 },
          { opacity: 0, transform: at(dx, dy, 0.45, 0) },
        ],
        { duration: 1100, easing: 'cubic-bezier(.2,.8,.3,1)' }
      );
      target.animate([{ scale: '1' }, { scale: '1.18', offset: 0.4 }, { scale: '0.96', offset: 0.7 }, { scale: '1' }], {
        duration: 480,
        delay: 800,
      });
      target.animate(
        [
          { outlineOffset: '0px', outlineColor: 'transparent' },
          { outlineOffset: '4px', outlineColor: 'var(--color-brand)', offset: 0.1 },
          { outlineOffset: '24px', outlineColor: 'transparent' },
        ],
        { duration: 650, delay: 750, easing: 'ease-out' }
      );
    }
  });
}

/* Dune Play's SittingOutSign: a black ring from radius 33 to 43, crossed by a slash of equal weight. */
function SeatToken({
  seat,
  size,
  ignoreFull = false,
}: Readonly<{ seat: Seat; size: number | string; ignoreFull?: boolean }>) {
  return (
    <span
      className={styles.seatToken}
      data-full={(!ignoreFull && seat.full) || undefined}
      style={{ '--token-size': typeof size === 'number' ? `${size}px` : size } as CSSProperties}
    >
      <span className={styles.tokenArt}>
        <FactionTokenFace token={seat} size="fill" aria-hidden />
      </span>
      {!ignoreFull && seat.full && (
        <svg className={styles.fullMark} viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="38" fill="none" stroke="black" strokeWidth="10" />
          <path d="M26.67 73.33 L73.33 26.67" stroke="black" strokeWidth="10" />
        </svg>
      )}
    </span>
  );
}
