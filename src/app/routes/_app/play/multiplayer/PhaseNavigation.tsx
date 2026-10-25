import { Button, Group, Menu, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { phaseGate } from '@shared/play/setup';
import { Check, ChevronDown } from 'lucide-react';
import { useId } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { publicControlsOf } from './publicControls';

/* What the phase asks of the table before it moves on: the public readiness and seats, through the shared gate. */
function gateOf(table: TableProjection) {
  const controls = publicControlsOf(table);
  return { controls, ...phaseGate({ ...table.snapshot, ready: controls.ready, seats: controls.seats }) };
}

/** Whether Next phase is enabled: the viewer may act, the last step has cooled, and the phase's gate is open. */
export function canStepPhase(table: TableProjection) {
  return table.canInteract && !table.phaseCooling && gateOf(table).refusal === null;
}

/* The header's phase controls: the Ready toggle when the phase asks for readiness, then the Next phase split button. */
export function PhaseNavigation({ client, table }: Readonly<{ client: TableSession; table: TableProjection }>) {
  const cooling = table.phaseCooling;
  const { controls, needsReady, refusal } = gateOf(table);
  const ready = controls.ready.includes(table.viewer.viewerSeat);
  /* Readiness is a phase control, so it sits beside Next phase in the header rather than on a tab. */
  return (
    <Group gap="xs" justify="flex-end" wrap="wrap" role="group" aria-label="Phase navigation">
      {needsReady && (
        <ReadyToggle
          ready={ready}
          count={controls.ready.filter((seat) => controls.seats.includes(seat)).length}
          of={controls.seats.length}
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

/* One toggle for readiness that carries the count: a filled Ready until pressed, then a quiet ticked Ready that withdraws. */
export function ReadyToggle({
  ready,
  count,
  of,
  disabled,
  onToggle,
}: Readonly<{ ready: boolean; count: number; of: number; disabled: boolean; onToggle: () => void }>) {
  const countId = useId();
  return (
    <>
      <Tooltip label={ready ? 'Withdraw readiness' : 'Tell the table you are ready'} withinPortal>
        <Button
          disabled={disabled}
          color={ready ? 'green' : 'yellow'}
          variant={ready ? 'light' : 'filled'}
          aria-pressed={ready}
          aria-describedby={countId}
          leftSection={ready ? <Check size={16} aria-hidden /> : undefined}
          rightSection={
            <Text span size="xs" fw={700} style={{ opacity: 0.8 }} aria-hidden>
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
      <Button disabled={nextDisabled} onClick={onNext} style={{ borderStartEndRadius: 0, borderEndEndRadius: 0 }}>
        Next phase
      </Button>
      <Menu position="bottom-end" shadow="md" withinPortal>
        <Menu.Target>
          <Button aria-label="More phase actions" px={8} style={{ borderStartStartRadius: 0, borderEndStartRadius: 0 }}>
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
