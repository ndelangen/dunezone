import { Button, Group, Text } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { Stepper } from '@ui/control/Stepper';
import { useState } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { SPICE_RESERVE_HELP } from '../multiplayer/panelGuidance';
import styles from './SpiceReserve.module.css';

/**
 * The faction's private spice reserve: its balance, and the amount to withdraw onto the table, on the kit stepper: − and +, the wheel, or typed.
 * The balance bumps as it changes, and a withdrawn amount floats up off it toward the table.
 */
export function SpiceReserve({ client, table }: Readonly<{ client: TableSession; table: TableProjection }>) {
  const reserve = table.snapshot.bank;
  const [amount, setAmount] = useState(1);
  /* What is being typed, judged before it commits, so an amount past the balance cannot be withdrawn. */
  const [draft, setDraft] = useState<string | null>(null);
  const [withdrawn, setWithdrawn] = useState<{ amount: number; key: number } | null>(null);
  const balance = reserve?.balance ?? 0;
  /* Each change of the balance counts, so its number remounts and bumps; the first render does not. */
  const [seen, setSeen] = useState({ balance, bump: 0 });
  if (seen.balance !== balance) {
    setSeen({ balance, bump: seen.bump + 1 });
  }
  if (!reserve) {
    return null;
  }
  const enabled = table.canHandleTable;
  const current = draft === null ? Math.min(amount, balance) : Number(draft);
  const valid = Number.isSafeInteger(current) && current > 0 && current <= balance;
  const withdraw = () => {
    if (!enabled || !valid) {
      return;
    }
    /* The amount floats away only when the command goes; a closed connection or a full queue sends nothing. */
    if (!client.command({ kind: 'bank-withdraw', amount: current })) {
      return;
    }
    setWithdrawn({ amount: current, key: (withdrawn?.key ?? 0) + 1 });
  };
  return (
    <Section hiddenHeading={Boolean(table.snapshot.stage)} title="Spice reserve" description={SPICE_RESERVE_HELP}>
      <div className={styles.spice}>
        <div className={styles.balance}>
          {/* The two keys share one parent, so each names what it counts: the first withdrawal and the first bump are both 1. */}
          <output
            key={`balance-${seen.bump}`}
            aria-label="Spice reserve balance"
            className={styles.balanceNumber}
            data-bump={seen.bump > 0 || undefined}
          >
            {balance}
          </output>
          {withdrawn && (
            <span key={`withdrawn-${withdrawn.key}`} className={styles.floatAway} aria-hidden>
              −{withdrawn.amount}
            </span>
          )}
          <Text component="span" size="xs" className={styles.balanceLabel}>
            spice
          </Text>
        </div>
        <Group gap={6} wrap="nowrap">
          <Stepper
            label="Spice to withdraw"
            value={Math.min(amount, Math.max(balance, 1))}
            min={1}
            max={Math.max(balance, 1)}
            disabled={!enabled || balance < 1}
            onChange={setAmount}
            onDraftChange={setDraft}
          />
          <Button size="compact-sm" aria-label="Withdraw spice" disabled={!enabled || !valid} onClick={withdraw}>
            Withdraw
          </Button>
        </Group>
      </div>
    </Section>
  );
}
