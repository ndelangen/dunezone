import { Group, Menu, Stack, Text, Tooltip, VisuallyHidden } from '@mantine/core';
/* oxlint-disable-next-line no-restricted-imports -- Ready and Next phase are a split button with a live count, a shape no kit action has. */
import { Button } from '@mantine/core';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { rosterSeat } from '@shared/play/schema';
import { phaseGate } from '@shared/play/setup';
import { Check, ChevronDown, Hourglass } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useMotionAllowed } from '@app/styles/motion';
import { playTableSound } from '@app/widgets/tabletop/tableSounds';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import styles from './PhaseNavigation.module.css';
import { publicControlsOf } from './publicControls';

/* What the phase asks of the table before it moves on: the public readiness and seats, through the shared gate. */
function gateOf(table: TableProjection) {
  const controls = publicControlsOf(table);
  return { controls, ...phaseGate({ ...table.snapshot, ready: controls.ready, seats: controls.seats }) };
}

/* How many of the seated players are ready, of how many. */
function readyCount(controls: ReturnType<typeof publicControlsOf>) {
  return { count: controls.ready.filter((seat) => controls.seats.includes(seat)).length, of: controls.seats.length };
}

/** Whether Next phase is enabled: the viewer may act, the last step has cooled, and the phase's gate is open. */
export function canStepPhase(table: TableProjection) {
  return table.canInteract && !table.phaseCooling && gateOf(table).refusal === null;
}

/** Each seated player and whether they are ready, by name and faction, in seat order (Norbert, 2026-11-17, #2980). */
function readinessList(table: TableProjection) {
  const controls = publicControlsOf(table);
  const names = snapshotFactionLabels(table.snapshot);
  return controls.seats.map((seat) => {
    const player = controls.players.find((entry) => entry.seat === seat)?.name ?? seat;
    const faction = rosterSeat(table.snapshot.roster, seat)?.faction?.id;
    return {
      seat,
      label: faction ? `${player} (${names[faction] ?? faction})` : player,
      ready: controls.ready.includes(seat),
    };
  });
}

/* Who is ready and who the table still waits on, as the Ready tooltips list them. */
function ReadinessLines({ table }: Readonly<{ table: TableProjection }>) {
  return (
    <Stack gap={2} aria-label="Who is ready">
      {readinessList(table).map(({ seat, label, ready }) => (
        <Group key={seat} gap={6} wrap="nowrap">
          {ready ? <Check size={14} aria-label="Ready" /> : <Hourglass size={14} aria-label="Not ready yet" />}
          <Text size="xs" span>
            {label}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

/** What an observer sees of the phase controls: how many are ready when the phase asks for it, as words rather than a button. */
export function PhaseReadiness({ table }: Readonly<{ table: TableProjection }>) {
  const { controls, needsReady } = gateOf(table);
  if (!needsReady) {
    return null;
  }
  const { count, of } = readyCount(controls);
  return (
    <Tooltip
      withinPortal
      multiline
      events={{ hover: true, focus: true, touch: false }}
      label={<ReadinessLines table={table} />}
    >
      <Text size="xs" fw={700} c="dimmed" role="status" tabIndex={0}>
        {count} of {of} ready
      </Text>
    </Tooltip>
  );
}

/* The gate the table is at: a new phase, setup step or stage asks for readiness afresh. */
function gateKey(table: TableProjection) {
  const { stage, phase, setup } = table.snapshot;
  return `${stage}:${phase}:${setup?.index ?? ''}:${setup?.visit ?? ''}`;
}

type Reminders = Readonly<{ gate: string; fired: readonly string[]; count: number }>;

/*
 * The reminders fired at each table's latest gate, kept beyond the controls: a Mentat recall swaps them out of the header, and closing it must not remind again.
 * Kept per table session, so another game starts afresh.
 */
const firedAtGate = new WeakMap<TableSession, Readonly<{ gate: string; fired: readonly string[] }>>();

/**
 * Reminds the viewer to ready up (#2980): when a gate starts waiting on them, and again once everyone else is ready, the Ready button flashes and a soft chime plays, each once per gate.
 * Withdrawing readiness, a reconnect, or another player withdrawing and readying again never reminds twice.
 * Returns how many reminders have fired, for the button to flash on each new one.
 */
function useReadyReminder(client: TableSession, table: TableProjection, waiting: boolean, lastOne: boolean) {
  const gate = gateKey(table);
  const stage = waiting ? (lastOne ? 'last' : 'waiting') : null;
  const [reminders, setReminders] = useState<Reminders>(() => ({
    gate,
    fired: firedAtGate.get(client)?.gate === gate ? firedAtGate.get(client)!.fired : [],
    count: 0,
  }));
  /* A new gate asks afresh; the reminders already fired at this one are not fired again. */
  const current = reminders.gate === gate ? reminders : { gate, fired: [], count: reminders.count };
  if (stage && !current.fired.includes(stage)) {
    /* The last-one reminder also stands for the first: a seat withdrawing afterwards does not remind again. */
    const fired = stage === 'last' ? [...current.fired, 'waiting', 'last'] : [...current.fired, stage];
    setReminders({ gate, fired, count: current.count + 1 });
  } else if (current !== reminders) {
    setReminders(current);
  }
  useEffect(() => {
    firedAtGate.set(client, { gate: reminders.gate, fired: reminders.fired });
  }, [client, reminders.gate, reminders.fired]);
  useEffect(() => {
    if (reminders.count > 0) {
      playTableSound('ready');
    }
  }, [reminders.count]);
  return reminders.count;
}

/* The header's phase controls: the Ready toggle when the phase asks for readiness, then the Next phase split button. */
export function PhaseNavigation({ client, table }: Readonly<{ client: TableSession; table: TableProjection }>) {
  const cooling = table.phaseCooling;
  const { controls, needsReady, refusal } = gateOf(table);
  const ready = controls.ready.includes(table.viewer.viewerSeat);
  const { count, of } = readyCount(controls);
  const waiting = needsReady && !ready && table.canInteract;
  const reminder = useReadyReminder(client, table, waiting, waiting && count === of - 1);
  /* Readiness is a phase control, so it sits beside Next phase in the header rather than on a tab. */
  return (
    <Group gap="xs" justify="flex-end" wrap="wrap" role="group" aria-label="Phase navigation">
      {needsReady && (
        <ReadyToggle
          ready={ready}
          count={count}
          of={of}
          flash={reminder}
          readiness={<ReadinessLines table={table} />}
          disabled={!table.canInteract}
          onToggle={() => client.command({ kind: 'ready', ready: !ready })}
        />
      )}
      <PhaseStepButton
        nextDisabled={!table.canInteract || cooling || refusal !== null}
        previousDisabled={!table.canInteract || cooling || atFirstStepOrHeld(table.snapshot)}
        onNext={() => client.command({ kind: 'phase' })}
        onPrevious={() => client.command({ kind: 'phase', direction: -1 })}
      />
    </Group>
  );
}

/* Going back waits while a game is ending or a battle is open, and has nowhere to go from the first setup step or phase. */
function atFirstStepOrHeld(snapshot: TableProjection['snapshot']) {
  if (snapshot.ending || snapshot.battle) {
    return true;
  }
  const setup = snapshot.stage === 'setup' ? snapshot.setup : undefined;
  return setup ? setup.index === 0 : snapshot.phase === 0;
}

/* Readiness carries its count and changes to a green tick when confirmed; pressing again withdraws it. */
export function ReadyToggle({
  ready,
  count,
  of,
  disabled,
  flash = 0,
  readiness,
  onToggle,
}: Readonly<{
  ready: boolean;
  count: number;
  of: number;
  disabled: boolean;
  /** How many reminders have fired: each rise flashes the button, to remind the viewer the table waits on them. */
  flash?: number;
  /** Who is ready and who is not, under the tooltip's hint. */
  readiness?: ReactNode;
  onToggle: () => void;
}>) {
  const countId = useId();
  const motion = useMotionAllowed();
  const button = useRef<HTMLButtonElement>(null);
  /* Restarts the flash in place: a new button would take the focus and the open tooltip with it. */
  useEffect(() => {
    const element = button.current;
    if (!flash || !element || !motion) {
      return;
    }
    element.classList.remove(styles.flash!);
    void element.offsetWidth;
    element.classList.add(styles.flash!);
  }, [flash, motion]);
  return (
    <>
      <Tooltip
        withinPortal
        multiline
        events={{ hover: true, focus: true, touch: false }}
        label={
          <Stack gap={4}>
            <Text size="xs">{ready ? 'Withdraw readiness' : 'Tell the table you are ready'}</Text>
            {readiness}
          </Stack>
        }
      >
        <Button
          ref={button}
          className={flash && !ready && !motion ? styles.waiting : undefined}
          disabled={disabled}
          color={ready ? 'confirm' : 'cta'}
          variant="filled"
          aria-pressed={ready}
          aria-describedby={countId}
          leftSection={ready ? <Check className={styles.check} size={16} aria-hidden /> : undefined}
          rightSection={
            <Text
              key={`${count}/${of}`}
              span
              size="xs"
              fw={700}
              className={styles.count}
              style={{ opacity: 0.8 }}
              aria-hidden
            >
              {count}/{of}
            </Text>
          }
          onClick={onToggle}
        >
          Ready
        </Button>
      </Tooltip>
      {/* A status, so a change in another player's readiness is announced wherever the focus is. */}
      <VisuallyHidden id={countId} role="status">
        {count} of {of} ready
      </VisuallyHidden>
    </>
  );
}

/* Next phase is the one button; going back is rare, so Previous phase waits in its menu. */
function PhaseStepButton({
  nextDisabled,
  previousDisabled,
  onNext,
  onPrevious,
}: Readonly<{ nextDisabled: boolean; previousDisabled: boolean; onNext: () => void; onPrevious: () => void }>) {
  return (
    <Group gap={1} wrap="nowrap">
      <Button
        color="cta"
        disabled={nextDisabled}
        onClick={onNext}
        style={{ borderStartEndRadius: 0, borderEndEndRadius: 0 }}
      >
        Next phase
      </Button>
      <Menu position="bottom-end" shadow="md" withinPortal>
        <Menu.Target>
          <Button
            aria-label="More phase actions"
            color={nextDisabled ? 'gray' : 'cta'}
            variant={nextDisabled ? 'default' : 'filled'}
            px={8}
            style={{ borderStartStartRadius: 0, borderEndStartRadius: 0 }}
          >
            <ChevronDown size={16} aria-hidden />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item disabled={previousDisabled} onClick={onPrevious}>
            Previous phase
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
