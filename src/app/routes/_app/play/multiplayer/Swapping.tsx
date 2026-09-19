import { Avatar, Button, Group, Image, Stack, Text } from '@mantine/core';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import type { SwapAction } from '@shared/play/swapping';
import { Section } from '@ui/block/Section';
import { useEffect, useState } from 'react';

import type { TableProjection, TableSession } from './TableSession';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

export function SwappingPanel({ client, table }: Props) {
  const state = table.snapshot.swapping;
  const roster = table.snapshot.roster;
  const seat = table.viewer.viewerSeat;
  const mine = roster?.seats.find((entry) => entry.id === seat);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!state || !roster) {
    return null;
  }
  const remaining = Math.max(0, Math.ceil((state.deadline - now) / 1000));
  const closed = state.closed || remaining === 0;
  const ready = state.ready.includes(seat);
  const disabled = !table.canInteract || table.seatCommandPending || closed;
  const send = (action: SwapAction) => client.command(action);
  const expected = { round: state.round, seat };
  const players = table.snapshot.controls?.players ?? [];
  const vacancies = roster.seats.length - players.length;
  return (
    <Stack gap="md">
      {mine && (
        <Section title={mine.faction?.name ?? mine.id} eyebrow="Your faction">
          <Group justify="space-between">
            <Text size="sm">Offer a trade below, or ready up to keep your seat.</Text>
            <Group>
              <Text component="output" aria-label="Trading time remaining">
                {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
              </Text>
              <Button
                disabled={disabled}
                aria-pressed={ready}
                variant={ready ? 'default' : 'filled'}
                onClick={() => send({ kind: 'swap-ready', ...expected, ready: !ready })}
              >
                {ready ? 'Withdraw readiness' : 'Ready to start'}
              </Button>
            </Group>
          </Group>
        </Section>
      )}
      <Stack component="ol" aria-label="Seats and players" gap="sm" m={0} p={0} style={{ listStyle: 'none' }}>
        {roster.seats.map((entry) => {
          const player = players.find((candidate) => candidate.seat === entry.id);
          const outgoing = state.offers.find((offer) => offer.origin === seat && offer.target === entry.id);
          const incoming = state.offers.find((offer) => offer.target === seat && offer.origin === entry.id);
          const theirReady = state.ready.includes(entry.id);
          return (
            <Group component="li" key={entry.id} justify="space-between" wrap="wrap">
              <Group>
                <Text size="sm">{entry.position + 1}</Text>
                {entry.faction && <Image src={state.tokens[entry.id]} alt="" w={34} h={34} radius="50%" />}
                <Text>{entry.faction?.name ?? entry.id}</Text>
              </Group>
              <Group>
                {player && <Avatar src={player.avatar} name={player.name} size="sm" />}
                <Text size="sm">
                  {player?.name ?? 'Open seat'}
                  {theirReady ? ' · Ready' : ''}
                </Text>
                {seat === entry.id ? (
                  <Text size="sm" c="dimmed">
                    Your seat
                  </Text>
                ) : (
                  seat !== SPECTATOR_SEAT &&
                  !closed && (
                    <Button
                      size="xs"
                      variant={incoming ? 'filled' : 'default'}
                      disabled={disabled || ready || theirReady}
                      aria-label={`${incoming ? 'Accept trade from' : outgoing ? 'Cancel offer to' : player ? 'Offer trade to' : 'Move to'} ${entry.faction?.name ?? entry.id}`}
                      onClick={() =>
                        send(
                          incoming
                            ? { kind: 'swap-accept', ...expected, offerId: incoming.id }
                            : outgoing
                              ? { kind: 'swap-cancel', ...expected, offerId: outgoing.id }
                              : { kind: 'swap-offer', ...expected, target: entry.id }
                        )
                      }
                    >
                      {incoming ? 'Accept trade' : outgoing ? 'Cancel offer' : player ? 'Offer trade' : 'Move here'}
                    </Button>
                  )
                )}
              </Group>
            </Group>
          );
        })}
      </Stack>
      <Text size="sm" role="status">
        {closed
          ? vacancies
            ? 'Trading ended. Waiting for approved replacements.'
            : 'Trading ended. Your assignments are fixed.'
          : `${state.ready.length} of ${players.length} players ready. Trading ends after four minutes.`}
      </Text>
    </Stack>
  );
}
