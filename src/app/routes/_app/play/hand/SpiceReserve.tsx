import { Button, Group, NumberInput, Text } from '@mantine/core';
import { Section } from '@ui/block/Section';
import { IconAction } from '@ui/control/IconAction';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import type { WheelEvent } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { SPICE_RESERVE_HELP } from '../multiplayer/panelGuidance';
import styles from './Hand.module.css';

/**
 * The faction's private spice reserve: its balance, and the amount to withdraw onto the table, stepped with − and +, the wheel, or typed.
 * The balance bumps as it changes, and a withdrawn amount floats up off it toward the table.
 */
export function SpiceReserve({ client, table }: Readonly<{ client: TableSession; table: TableProjection }>) {
  const reserve = table.snapshot.bank;
  const committed = table.snapshot.battlePlan?.spice ?? 0;
  const [amount, setAmount] = useState<string | number>(1);
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
  const current = typeof amount === 'number' ? amount : 0;
  const valid = Number.isSafeInteger(current) && current > 0 && current <= balance;
  const step = (by: number) => setAmount(Math.max(1, Math.min(Math.max(balance, 1), current + by)));
  const wheel = (event: WheelEvent) => {
    if (enabled) {
      step(event.deltaY < 0 ? 1 : -1);
    }
  };
  const withdraw = () => {
    if (!enabled || !valid) {
      return;
    }
    client.command({ kind: 'bank-withdraw', amount: current });
    setWithdrawn({ amount: current, key: (withdrawn?.key ?? 0) + 1 });
  };
  return (
    <Section hiddenHeading={Boolean(table.snapshot.stage)} title="Spice reserve" description={SPICE_RESERVE_HELP}>
      <div className={styles.spice}>
        <div className={styles.balance}>
          <output
            key={seen.bump}
            aria-label="Spice reserve balance"
            className={styles.balanceNumber}
            data-bump={seen.bump > 0 || undefined}
          >
            {balance}
          </output>
          {withdrawn && (
            <span key={withdrawn.key} className={styles.floatAway} aria-hidden>
              −{withdrawn.amount}
            </span>
          )}
          <Text component="span" size="xs" className={styles.balanceLabel}>
            spice{committed ? `, ${committed} in plan` : ''}
          </Text>
        </div>
        <Group gap={6} wrap="nowrap" onWheel={wheel}>
          <IconAction
            label="One spice less"
            emphasis="standard"
            icon={<Minus size={14} aria-hidden />}
            disabled={!enabled || current <= 1}
            onClick={() => step(-1)}
          />
          <NumberInput
            aria-label="Spice to withdraw"
            className={styles.amount}
            hideControls
            value={amount}
            onChange={setAmount}
            min={1}
            allowDecimal={false}
            allowNegative={false}
            disabled={!enabled}
            onKeyDown={(event) => event.key === 'Enter' && withdraw()}
          />
          <IconAction
            label="One spice more"
            emphasis="standard"
            icon={<Plus size={14} aria-hidden />}
            disabled={!enabled || current >= balance}
            onClick={() => step(1)}
          />
          <Button size="compact-sm" aria-label="Withdraw spice" disabled={!enabled || !valid} onClick={withdraw}>
            Withdraw
          </Button>
        </Group>
      </div>
    </Section>
  );
}
