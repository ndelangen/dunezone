import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { Bullets } from '@ui/list/Bullets';
import { CircleAlert, CircleCheck } from 'lucide-react';

import type { PlayReadinessCheck } from '@db/play';

export interface PlayReadinessProps {
  /** The game's verdict on the ruleset and its factions, or that it is still being read. */
  check: PlayReadinessCheck;
  /** Reads the catalogue again, for a fix made on another page. */
  onRecheck: () => void;
}

/* One problem as a line: what it is about, then what is wrong with it. */
function problemLine({ subject, reason }: { subject: string; reason: string }) {
  return `${subject[0]?.toUpperCase() ?? ''}${subject.slice(1)}: ${reason}`;
}

/**
 * Whether a real game can start with a ruleset, by the game's own captures: what stops the ruleset, and what sets each faction aside in the draft.
 *
 * Callers hand it the check;
 * it owns saying what blocks a game, and naming the ready factions in one line rather than a row each.
 */
export function PlayReadiness({ check, onRecheck }: PlayReadinessProps) {
  const entries = check.status === 'checked' ? check.entries : [];
  const blocked = entries.filter((entry) => entry.problems.length > 0);
  const ready = entries.filter((entry) => entry.kind === 'faction' && entry.problems.length === 0);
  const rulesetBlocked = blocked.some((entry) => entry.kind === 'ruleset');

  return (
    <Stack gap="md" aria-busy={check.status === 'checking'}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2}>
          <Title order={2} size="h4">
            Ready for Play
          </Title>
          <Text size="sm" c="dimmed" role="status">
            {summary(check, rulesetBlocked, blocked.length)}
          </Text>
        </Stack>
        <Button variant="light" size="compact-sm" onClick={onRecheck} loading={check.status === 'checking'}>
          Check again
        </Button>
      </Group>
      {blocked.length ? (
        <Bullets>
          {blocked.map((entry) => (
            <Bullets.Item
              key={`${entry.kind}:${entry.id}`}
              icon={<CircleAlert size={18} />}
              title={entry.kind === 'ruleset' ? `Ruleset ${entry.name}` : entry.name}
              detail={
                <Stack component="span" gap={2}>
                  {entry.problems.map((problem, index) => (
                    <span key={index}>{problemLine(problem)}</span>
                  ))}
                </Stack>
              }
            />
          ))}
        </Bullets>
      ) : null}
      {ready.length ? (
        <Bullets>
          <Bullets.Item
            icon={<CircleCheck size={18} />}
            title={ready.length === 1 ? '1 faction ready' : `${ready.length} factions ready`}
            detail={ready.map((entry) => entry.name).join(', ')}
          />
        </Bullets>
      ) : null}
    </Stack>
  );
}

function summary(check: PlayReadinessCheck, rulesetBlocked: boolean, blocked: number) {
  switch (check.status) {
    case 'checking':
      return 'Checking the ruleset and its factions the way a new game does…';
    case 'failed':
      return `The check could not finish: ${check.reason}`;
    case 'checked':
      if (rulesetBlocked) {
        return 'A game cannot start with this ruleset yet. Fix the ruleset problems below.';
      }
      if (blocked) {
        return `A game can start. The draft sets aside ${blocked === 1 ? 'the faction' : `the ${blocked} factions`} below until they are fixed.`;
      }
      return 'A game can start with this ruleset and deal every faction.';
  }
}
