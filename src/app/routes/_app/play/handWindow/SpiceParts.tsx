import { Button, Group, Slider, Text } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import type { WheelEvent } from 'react';

import styles from './HandWindow.module.css';
import type { HandWindowModel } from './useHandWindow';

/* The amounts a player withdraws most, as one-click chips; each shows only while the reserve holds it. */
const QUICK = [1, 2, 3, 5, 10];

/** The reserve's number, which bumps when it changes and lets a withdrawn amount float up from it. */
export function SpiceBalance({ model, size = 'lg' }: Readonly<{ model: HandWindowModel; size?: 'lg' | 'md' }>) {
  const { balance, withdrawn, committed } = model;
  /* Each change of the balance counts, so its number remounts and bumps; the first render does not. */
  const [seen, setSeen] = useState({ balance, bump: 0 });
  if (seen.balance !== balance) {
    setSeen({ balance, bump: seen.bump + 1 });
  }
  const bump = seen.bump;
  return (
    <div className={styles.balance} data-size={size}>
      <output
        key={bump}
        aria-label="Spice reserve balance"
        className={styles.balanceNumber}
        data-bump={bump > 0 || undefined}
      >
        {balance}
      </output>
      {withdrawn && (
        <span key={withdrawn.key} className={styles.floatAway} aria-hidden>
          −{withdrawn.amount}
        </span>
      )}
      <Text component="span" size="xs" className={styles.balanceLabel}>
        spice{committed ? ` · ${committed} in plan` : ''}
      </Text>
    </div>
  );
}

/** Prototype A and D: tap an amount and it lands on the table, one click. */
export function SpiceChips({ model }: Readonly<{ model: HandWindowModel }>) {
  const { balance, enabled } = model;
  const amounts = QUICK.filter((amount) => amount < balance);
  return (
    <div className={styles.spiceRow}>
      <SpiceBalance model={model} />
      <div className={styles.chips} role="group" aria-label="Withdraw spice onto the table">
        {amounts.map((amount) => (
          <Button
            key={amount}
            size="compact-sm"
            variant="default"
            disabled={!enabled}
            aria-label={`Withdraw ${amount} spice`}
            onClick={() => model.withdraw(amount)}
          >
            {amount}
          </Button>
        ))}
        <Button
          size="compact-sm"
          variant="filled"
          disabled={!enabled || balance < 1}
          aria-label={`Withdraw all ${balance} spice`}
          onClick={() => model.withdraw(balance)}
        >
          All {balance}
        </Button>
      </div>
    </div>
  );
}

/** Prototype B: step the amount with − and + or the wheel, then withdraw it. */
export function SpiceStepper({ model }: Readonly<{ model: HandWindowModel }>) {
  const { balance, enabled } = model;
  const [amount, setAmount] = useState(1);
  const clamped = Math.max(1, Math.min(balance, amount));
  const step = (by: number) => setAmount(Math.max(1, Math.min(balance, clamped + by)));
  const wheel = (event: WheelEvent) => step(event.deltaY < 0 ? 1 : -1);
  return (
    <div className={styles.spiceRow}>
      <SpiceBalance model={model} />
      <Group gap={6} wrap="nowrap" onWheel={wheel}>
        <IconAction
          label="One less"
          emphasis="standard"
          icon={<Minus size={14} aria-hidden />}
          disabled={!enabled || clamped <= 1}
          onClick={() => step(-1)}
        />
        <Text component="span" fw={700} className={styles.stepValue} aria-live="polite">
          {balance ? clamped : 0}
        </Text>
        <IconAction
          label="One more"
          emphasis="standard"
          icon={<Plus size={14} aria-hidden />}
          disabled={!enabled || clamped >= balance}
          onClick={() => step(1)}
        />
        <Button size="compact-sm" disabled={!enabled || balance < 1} onClick={() => model.withdraw(clamped)}>
          Withdraw {balance ? clamped : ''}
        </Button>
      </Group>
    </div>
  );
}

/** Prototype C: drag the slider to an amount, then withdraw it. */
export function SpiceSlider({ model }: Readonly<{ model: HandWindowModel }>) {
  const { balance, enabled } = model;
  const [amount, setAmount] = useState(1);
  const clamped = Math.max(1, Math.min(balance, amount));
  return (
    <div className={styles.spiceSlider}>
      <SpiceBalance model={model} size="md" />
      <Slider
        className={styles.slider}
        min={1}
        max={Math.max(1, balance)}
        value={clamped}
        onChange={setAmount}
        disabled={!enabled || balance < 1}
        label={(value) => `${value} spice`}
        aria-label="Spice to withdraw"
      />
      <Button size="compact-sm" disabled={!enabled || balance < 1} onClick={() => model.withdraw(clamped)}>
        Withdraw {balance ? clamped : ''}
      </Button>
    </div>
  );
}
