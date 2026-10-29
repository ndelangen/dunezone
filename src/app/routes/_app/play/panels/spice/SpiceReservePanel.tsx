import { Group, Text } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { HelpMark } from '@ui/content/HelpMark';
import { SortableRow } from '@ui/control/SortableRow';
import { Stepper } from '@ui/control/Stepper';
import { useId, useState } from 'react';

import { SPICE_RESERVE_HELP } from '../../multiplayer/panelGuidance';
import { SpiceTokenPreview } from '../../multiplayer/SpiceTokenPreview';
import styles from './SpiceReservePanel.module.css';

export type SpiceReservePanelProps = Readonly<{
  /** The faction's spice in its private reserve. */
  balance: number;
  /** The heading is only for assistive technology inside a game's window. */
  hiddenHeading: boolean;
}> &
  (
    | Readonly<{
        isFrozen?: false;
        enabled: boolean;
        onStartPlacement: (amount: number) => void;
        onWithdraw: (amount: number, point: Readonly<{ x: number; y: number }>) => boolean;
      }>
    | Readonly<{ isFrozen: true }>
  );

/**
 * The faction's private spice reserve: its balance, and the amount to withdraw onto the table, on the kit stepper: − and +, the wheel, or typed.
 * The balance bumps as it changes, and a withdrawn amount floats up off it toward the table.
 */
export function SpiceReservePanel(props: SpiceReservePanelProps) {
  const { balance, hiddenHeading } = props;
  const isFrozen = props.isFrozen === true;
  const helpId = useId();
  const [amount, setAmount] = useState(1);
  /* What is being typed, judged before it commits, so an amount past the balance cannot be withdrawn. */
  const [draft, setDraft] = useState<string | null>(null);
  const [withdrawn, setWithdrawn] = useState<{ amount: number; key: number } | null>(null);
  /* Each change of the balance counts, so its number remounts and bumps; the first render does not. */
  const [seen, setSeen] = useState({ balance, bump: 0 });
  if (seen.balance !== balance) {
    setSeen({ balance, bump: seen.bump + 1 });
  }
  const current = draft === null ? Math.min(amount, balance) : Number(draft);
  const valid = Number.isSafeInteger(current) && current > 0 && current <= balance;
  const withdraw = (selected: number, point: Readonly<{ x: number; y: number }>) => {
    /* The amount floats away only when the command goes; a closed connection or a full queue sends nothing. */
    if (
      !props.isFrozen &&
      props.enabled &&
      Number.isSafeInteger(selected) &&
      selected > 0 &&
      selected <= balance &&
      props.onWithdraw(selected, point)
    ) {
      setWithdrawn({ amount: selected, key: (withdrawn?.key ?? 0) + 1 });
    }
  };
  return (
    <Section hiddenHeading={hiddenHeading} title="Spice reserve">
      <div className={styles.spice} data-frozen-balance={isFrozen || undefined}>
        <div className={styles.balance}>
          {/* The two keys share one parent, so each names what it counts: the first withdrawal and the first bump are both 1. */}
          <output
            key={`balance-${seen.bump}`}
            aria-label="Spice reserve balance"
            className={styles.balanceNumber}
            data-bump={(!isFrozen && seen.bump > 0) || undefined}
          >
            {balance}
          </output>
          {!isFrozen && withdrawn && (
            <span key={`withdrawn-${withdrawn.key}`} className={styles.floatAway} aria-hidden>
              −{withdrawn.amount}
            </span>
          )}
          <Text component="span" size="xs" className={styles.balanceLabel}>
            spice
          </Text>
          {!isFrozen && <HelpMark id={helpId} text={SPICE_RESERVE_HELP} />}
        </div>
        {!props.isFrozen && (
          <Group gap={6} wrap="nowrap">
            <Stepper
              label="Spice to withdraw"
              value={Math.min(amount, Math.max(balance, 1))}
              min={1}
              max={Math.max(balance, 1)}
              disabled={!props.enabled || balance < 1}
              onChange={setAmount}
              onDraftChange={setDraft}
            />
            <SortableRow
              items={[{ id: 'reserve-spice', amount: current }]}
              disabled={!props.enabled || !valid}
              onMove={() => {}}
              onDropOutside={(item, point) => withdraw(item.amount, point)}
            >
              {(item) => (
                <button
                  type="button"
                  className={styles.token}
                  disabled={!props.enabled || !valid}
                  aria-label={`Drag ${valid ? item.amount : 0} spice to the table`}
                  aria-describedby={helpId}
                  aria-keyshortcuts="Enter Space"
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat && valid) {
                      event.preventDefault();
                      event.stopPropagation();
                      props.onStartPlacement(item.amount);
                    }
                  }}
                >
                  <SpiceTokenPreview amount={valid ? item.amount : 0} />
                </button>
              )}
            </SortableRow>
          </Group>
        )}
      </div>
    </Section>
  );
}
