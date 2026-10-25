/* The manager bundles addons with the classic JSX transform, which reads `React` in scope. */
import React from 'react';
import { AddonPanel, Button, Form, TabButton, ToggleButton } from 'storybook/internal/components';
import { addons, useArgs, useChannel, useStorybookState } from 'storybook/manager-api';
import { styled } from 'storybook/theming';

import { changes } from './diff';
import { PLAY_DEBUGGER_EVENTS } from './events';
import type { DebuggerState, DebuggerTimeline, TrafficEntry } from './events';
import { JsonTree, Preview } from './JsonTree';
import { clearTraffic, usePlayDebugger } from './store';

/*
 * The Play debugger panel. The top bar moves the story through its game, as a recorded step and the seat it is viewed as;
 * the tabs show the page's state now, every message its socket carried, and the steps the story can move to.
 */

const Layout = styled.div({ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 });

const Bar = styled.div(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderBottom: `1px solid ${theme.appBorderColor}`,
}));

const Code = styled.strong(({ theme }) => ({
  color: theme.color.gold,
  fontFamily: theme.typography.fonts.mono,
  fontVariantNumeric: 'tabular-nums',
}));

const Title = styled.span(({ theme }) => ({ fontWeight: theme.typography.weight.bold }));
const Muted = styled.span(({ theme }) => ({ color: theme.textMutedColor }));
const Detail = styled.p(({ theme }) => ({ margin: 0, flexBasis: '100%', color: theme.textMutedColor }));
const Spacer = styled.span({ flex: 1 });
const Scrub = styled.input({ flex: '1 1 160px', minWidth: 120 });
const Label = styled.label({ display: 'flex', alignItems: 'center', gap: 6 });

const NativeSelect = styled.select(({ theme }) => ({
  background: theme.input.background,
  color: theme.input.color,
  border: `1px solid ${theme.input.border}`,
  borderRadius: theme.input.borderRadius,
  padding: '3px 6px',
  font: 'inherit',
}));

const Tabs = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '0 10px',
  borderBottom: `1px solid ${theme.appBorderColor}`,
}));

const Body = styled.div({ flex: 1, minHeight: 0, display: 'flex' });
const Scroll = styled.div({ flex: 1, minWidth: 0, overflow: 'auto', padding: '8px 10px' });
/* A table's sticky header sits flush with the top, so rows never show above it. */
const TableScroll = styled(Scroll)({ paddingTop: 0 });

const Split = styled.div(({ theme }) => ({
  flex: '0 0 min(46%, 520px)',
  overflow: 'auto',
  borderRight: `1px solid ${theme.appBorderColor}`,
}));

const Section = styled.section({ marginBottom: 12 });
const Heading = styled.h3(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  margin: '0 0 4px',
  fontSize: theme.typography.size.s2,
}));

const Table = styled.table(({ theme }) => ({
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: theme.typography.size.s1,
  'th, td': { textAlign: 'left', padding: '3px 8px', whiteSpace: 'nowrap' },
  th: {
    position: 'sticky',
    top: 0,
    background: theme.background.app,
    color: theme.textMutedColor,
    fontWeight: theme.typography.weight.regular,
  },
  'tbody tr': { cursor: 'pointer' },
  'tbody tr:hover': { background: theme.background.hoverable },
  'tr[aria-selected="true"]': {
    background: theme.background.hoverable,
    boxShadow: `inset 3px 0 ${theme.color.secondary}`,
  },
  'tr[data-unreachable]': { opacity: 0.45, cursor: 'default' },
  'td.summary': { whiteSpace: 'normal', width: '100%' },
}));

const Direction = styled.span<{ direction: TrafficEntry['direction'] }>(({ theme, direction }) => ({
  fontFamily: theme.typography.fonts.mono,
  color:
    direction === 'sent' ? theme.color.secondary : direction === 'received' ? theme.color.positive : theme.color.gold,
}));

const ARROWS = { sent: 'page → table', received: 'table → page', story: 'story' } as const;

/* Messages a moving pointer or a drag sends many times a second, hidden from the history unless asked for. */
const CHATTY = new Set(['pointer', 'pointers', 'pose']);

/** Parses JSON text once per text. */
function useParsed(json: string | undefined) {
  return React.useMemo(() => (json === undefined ? undefined : (JSON.parse(json) as unknown)), [json]);
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text);
}

/** Moves the story to a step through its arguments, viewed as the seat that acted to reach it when following. */
function useMoveTo(timeline: DebuggerTimeline, follow: boolean) {
  const [, updateArgs] = useArgs();
  return (index: number) => {
    const actor = timeline.steps[index]?.actor;
    const followed = follow && timeline.viewers.some((viewer) => viewer.id === actor);
    updateArgs({ [timeline.stepArg]: index + 1, ...(followed ? { [timeline.viewerArg]: actor } : {}) });
  };
}

/** The step shown, the arrows and scrubber through the steps the story can reach, and the viewer. */
function StepNavigator({
  timeline,
  follow,
  onFollow,
}: Readonly<{ timeline: DebuggerTimeline; follow: boolean; onFollow: (on: boolean) => void }>) {
  const [, updateArgs] = useArgs();
  const go = useMoveTo(timeline, follow);
  const { reachable } = timeline;
  const at = reachable.indexOf(timeline.current);
  const step = timeline.steps[timeline.current]!;
  const atStart = at <= 0;
  const atEnd = at < 0 || at >= reachable.length - 1;
  return (
    <>
      <Code>{step.code}</Code>
      <Title>{step.title}</Title>
      <Muted>
        {timeline.current + 1} of {timeline.steps.length}
      </Muted>
      <Button size="small" variant="ghost" disabled={atStart} onClick={() => go(reachable[0]!)}>
        First
      </Button>
      <Button size="small" variant="ghost" disabled={atStart} onClick={() => go(reachable[at - 1]!)}>
        Previous
      </Button>
      <Button size="small" variant="ghost" disabled={atEnd} onClick={() => go(reachable[at + 1]!)}>
        Next
      </Button>
      <Button size="small" variant="ghost" disabled={atEnd} onClick={() => go(reachable.at(-1)!)}>
        Last
      </Button>
      <Scrub
        type="range"
        min={0}
        max={Math.max(reachable.length - 1, 0)}
        value={Math.max(at, 0)}
        aria-label={timeline.label}
        aria-valuetext={`${step.code} ${step.title}`}
        onChange={(event) => go(reachable[Number(event.currentTarget.value)]!)}
      />
      <Label>
        <Muted>Viewing as</Muted>
        <NativeSelect
          value={timeline.viewer}
          aria-label="Viewing as"
          onChange={(event) => updateArgs({ [timeline.viewerArg]: event.currentTarget.value })}
        >
          {timeline.viewers.map((viewer) => (
            <option key={viewer.id} value={viewer.id}>
              {viewer.label}
            </option>
          ))}
        </NativeSelect>
      </Label>
      <ToggleButton
        size="small"
        variant="ghost"
        pressed={follow}
        tooltip="Each step is viewed as the seat that acted to reach it"
        onClick={() => onFollow(!follow)}
      >
        Follow the acting seat
      </ToggleButton>
    </>
  );
}

/** The bar that moves the story: its steps and viewer when it has them, and the story's actions. */
function Controls({
  state,
  follow,
  onFollow,
}: Readonly<{ state: DebuggerState; follow: boolean; onFollow: (on: boolean) => void }>) {
  const emit = useChannel({});
  const { timeline } = state;
  return (
    <Bar>
      {timeline ? (
        <StepNavigator timeline={timeline} follow={follow} onFollow={onFollow} />
      ) : (
        <Title>{state.title}</Title>
      )}
      <Spacer />
      {state.actions.map((action) => (
        <Button
          key={action.id}
          size="small"
          variant="outline"
          tooltip={action.description}
          onClick={() => emit(PLAY_DEBUGGER_EVENTS.act, action.id)}
        >
          {action.label}
        </Button>
      ))}
      <Detail>{timeline ? timeline.steps[timeline.current]?.detail : state.description}</Detail>
    </Bar>
  );
}

function RootSection({ name, json, filter }: Readonly<{ name: string; json: string; filter: string }>) {
  const value = useParsed(json);
  return (
    <Section>
      <Heading>
        {name}
        <Button size="small" variant="ghost" ariaLabel={`Copy ${name} as JSON`} onClick={() => copy(json)}>
          Copy
        </Button>
      </Heading>
      <JsonTree value={value} filter={filter} />
    </Section>
  );
}

/** The state tab: each root the story names, the page's newest view first. */
function StateTab({ state }: Readonly<{ state: DebuggerState }>) {
  const [filter, setFilter] = React.useState('');
  const roots = Object.entries(state.inspect);
  return (
    <Scroll>
      <Section>
        <Form.Input
          size="flex"
          placeholder="Filter by path or value, as pieces or HMS"
          aria-label="Filter the state"
          value={filter}
          onChange={(event) => setFilter(event.currentTarget.value)}
        />
      </Section>
      {roots.length === 0 && <Muted>The page has not received a view yet.</Muted>}
      {roots.map(([name, json]) => (
        <RootSection key={name} name={name} json={json} filter={filter} />
      ))}
    </Scroll>
  );
}

/** What changed in the page's view since the view before this one. */
function ViewChanges({ entry, traffic }: Readonly<{ entry: TrafficEntry; traffic: TrafficEntry[] }>) {
  const previous = React.useMemo(() => {
    const index = traffic.indexOf(entry);
    return traffic
      .slice(0, Math.max(index, 0))
      .reverse()
      .find((candidate) => candidate.direction === 'received' && candidate.type === 'view');
  }, [entry, traffic]);
  const found = React.useMemo(() => {
    if (!previous) {
      return null;
    }
    const strip = (json: string) => {
      const { serverNow: _now, epoch: _epoch, ...rest } = JSON.parse(json) as Record<string, unknown>;
      return rest;
    };
    return changes(strip(previous.json), strip(entry.json));
  }, [previous, entry]);
  if (!found) {
    return <Muted>The first view this socket received.</Muted>;
  }
  if (found.length === 0) {
    return <Muted>The same as the view before.</Muted>;
  }
  return (
    <Table>
      <thead>
        <tr>
          <th>Path</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {found.map((change) => (
          <tr key={change.path} style={{ cursor: 'default' }}>
            <td>{change.path}</td>
            <td>
              <Preview value={change.before} />
            </td>
            <td>
              <Preview value={change.after} />
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function EntryDetail({ entry, traffic }: Readonly<{ entry: TrafficEntry; traffic: TrafficEntry[] }>) {
  const value = useParsed(entry.json);
  return (
    <Scroll>
      {entry.direction === 'received' && entry.type === 'view' && (
        <Section>
          <Heading>Changes from the view before</Heading>
          <ViewChanges entry={entry} traffic={traffic} />
        </Section>
      )}
      <Section>
        <Heading>
          #{entry.sequence} {entry.type}
          <Muted>{ARROWS[entry.direction]}</Muted>
          <Button size="small" variant="ghost" ariaLabel="Copy the message as JSON" onClick={() => copy(entry.json)}>
            Copy
          </Button>
        </Heading>
        <JsonTree value={value} open={entry.type === 'view' ? 1 : 3} />
      </Section>
    </Scroll>
  );
}

/** The history tab: every message the socket carried, newest last, and the one picked opened beside the list. */
function HistoryTab({ traffic }: Readonly<{ traffic: TrafficEntry[] }>) {
  const [chatty, setChatty] = React.useState(false);
  const [picked, setPicked] = React.useState<number | null>(null);
  const list = React.useRef<HTMLDivElement>(null);
  const shown = React.useMemo(
    () => (chatty ? traffic : traffic.filter((entry) => !CHATTY.has(entry.type))),
    [traffic, chatty]
  );
  const selected = shown.find((entry) => entry.sequence === picked) ?? shown.at(-1);
  /* Following the newest message keeps the list scrolled to the bottom as messages arrive. */
  React.useEffect(() => {
    if (picked === null && list.current) {
      list.current.scrollTop = list.current.scrollHeight;
    }
  }, [shown, picked]);
  return (
    <Layout>
      <Bar>
        <Muted>
          {shown.length} of {traffic.length} messages
        </Muted>
        <ToggleButton size="small" variant="ghost" pressed={chatty} onClick={() => setChatty(!chatty)}>
          Show pointers and poses
        </ToggleButton>
        <ToggleButton
          size="small"
          variant="ghost"
          pressed={picked === null}
          tooltip="Open each message as it arrives"
          onClick={() => setPicked(picked === null ? (selected?.sequence ?? null) : null)}
        >
          Follow newest
        </ToggleButton>
        <Spacer />
        <Button size="small" variant="ghost" onClick={clearTraffic}>
          Clear
        </Button>
      </Bar>
      <Body>
        <Split ref={list}>
          <Table aria-label="Socket history">
            <thead>
              <tr>
                <th>#</th>
                <th>ms</th>
                <th>Way</th>
                <th>Type</th>
                <th>What</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((entry) => (
                <tr key={entry.sequence} aria-selected={entry === selected} onClick={() => setPicked(entry.sequence)}>
                  <td>
                    <Muted>{entry.sequence}</Muted>
                  </td>
                  <td>
                    <Muted>{entry.at}</Muted>
                  </td>
                  <td>
                    <Direction direction={entry.direction}>{ARROWS[entry.direction]}</Direction>
                  </td>
                  <td>{entry.type}</td>
                  <td className="summary">{entry.summary}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Split>
        {selected ? (
          <EntryDetail key={selected.sequence} entry={selected} traffic={traffic} />
        ) : (
          <Scroll>
            <Muted>No messages yet.</Muted>
          </Scroll>
        )}
      </Body>
    </Layout>
  );
}

/** The steps tab: every step of the game, the one shown marked; a step the story can reach moves it there. */
function StepsTab({ timeline, follow }: Readonly<{ timeline: DebuggerTimeline; follow: boolean }>) {
  const go = useMoveTo(timeline, follow);
  const reachable = new Set(timeline.reachable);
  const current = React.useRef<HTMLTableRowElement>(null);
  React.useEffect(() => current.current?.scrollIntoView({ block: 'nearest' }), [timeline.current]);
  return (
    <TableScroll>
      <Table aria-label={`${timeline.label} steps`}>
        <thead>
          <tr>
            <th>Step</th>
            <th>Title</th>
            <th>Acting seat</th>
            <th>Action</th>
            <th>What happened</th>
          </tr>
        </thead>
        <tbody>
          {timeline.steps.map((step) => {
            const canReach = reachable.has(step.index);
            return (
              <tr
                key={step.index}
                ref={step.index === timeline.current ? current : undefined}
                aria-selected={step.index === timeline.current}
                data-unreachable={canReach ? undefined : ''}
                onClick={() => canReach && go(step.index)}
              >
                <td>
                  <Code>{step.code}</Code>
                </td>
                <td>{step.title}</td>
                <td>{step.actor ?? <Muted>none</Muted>}</td>
                <td>{step.action ?? <Muted>none</Muted>}</td>
                <td className="summary">
                  <Muted>{step.detail}</Muted>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </TableScroll>
  );
}

type Tab = 'state' | 'history' | 'steps';

/** The tabs under the bar: the state now, the socket's history, and the steps when the story has them. */
function DebuggerTabs({
  state,
  traffic,
  follow,
}: Readonly<{ state: DebuggerState; traffic: TrafficEntry[]; follow: boolean }>) {
  const [tab, setTab] = React.useState<Tab>('state');
  const { timeline } = state;
  const tabs: [Tab, string][] = [
    ['state', 'State'],
    ['history', `History (${traffic.length})`],
    ...(timeline ? [['steps', `Steps (${timeline.steps.length})`] as [Tab, string]] : []),
  ];
  const shown = tab === 'steps' && !timeline ? 'state' : tab;
  return (
    <>
      <Tabs role="tablist" aria-label="Play debugger">
        {tabs.map(([id, label]) => (
          <TabButton key={id} role="tab" active={shown === id} aria-selected={shown === id} onClick={() => setTab(id)}>
            {label}
          </TabButton>
        ))}
      </Tabs>
      <Body>
        {shown === 'state' && <StateTab state={state} />}
        {shown === 'history' && <HistoryTab traffic={traffic} />}
        {shown === 'steps' && timeline && <StepsTab timeline={timeline} follow={follow} />}
      </Body>
    </>
  );
}

/** The Play debugger panel, for a story whose parameters ask for it. */
export function PlayDebuggerPanel({ active }: Readonly<{ active: boolean }>) {
  const { state, traffic } = usePlayDebugger();
  const { storyId } = useStorybookState();
  const [follow, setFollow] = React.useState(false);
  /* A panel opened after the story connected asks for what it missed. */
  React.useEffect(() => {
    if (active) {
      addons.getChannel().emit(PLAY_DEBUGGER_EVENTS.request);
    }
  }, [active, storyId]);
  return (
    <AddonPanel active={active} hasScrollbar={false}>
      {state ? (
        <Layout>
          <Controls state={state} follow={follow} onFollow={setFollow} />
          <DebuggerTabs state={state} traffic={traffic} follow={follow} />
        </Layout>
      ) : (
        <Scroll>
          <Muted>Waiting for the story to open its game socket.</Muted>
        </Scroll>
      )}
    </AddonPanel>
  );
}
