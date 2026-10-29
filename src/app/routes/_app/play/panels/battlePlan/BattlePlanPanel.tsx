import { Text } from '@mantine/core';
import { Section } from '@ui/block/Section';

import { LedgerPlan } from './LedgerPlan';
import type { BattlePlanViewProps } from './planView';

export type BattlePlanPanelProps = Readonly<{
  /** The viewer's own plan for the battle on the table, or null while there is none to make. */
  plan: BattlePlanViewProps | null;
  /** Why there is no plan: no battle, the plans are out, or the viewer cannot claim a side. */
  notice: string;
  /** Where the battle is, or how to begin one. */
  help: string;
}>;

/** The viewer's own plan for the battle on the table, or why there is none. */
export function BattlePlanPanel({ plan, notice, help }: BattlePlanPanelProps) {
  if (plan) {
    return <LedgerPlan {...plan} />;
  }
  return (
    <Section hiddenHeading title="Battle" description={help}>
      <Text size="sm">{notice}</Text>
    </Section>
  );
}
