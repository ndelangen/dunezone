/**
 * Joins each saved command the coordinator sent with when the room began handling it, by the room's own clock.
 * The two clocks' offset is unknown, so the legs carry it with opposite signs and read against the run's own median.
 */
export function roomTiming(sends, replies) {
  /* A replayed command is handled again, so the first handling is the one its send is answered by. */
  const handled = new Map();
  for (const { commandId, handledAt } of replies.flat()) {
    if (!handled.has(commandId)) {
      handled.set(commandId, handledAt);
    }
  }
  const commands = sends.map(({ peer, commandId, operation, phase, sentAt, answeredAt }) => {
    const handledAt = handled.get(commandId) ?? null;
    return {
      peer,
      commandId,
      operation,
      phase,
      sentAt,
      handledAt,
      answeredAt: answeredAt ?? null,
      toRoomMs: handledAt === null ? null : handledAt - sentAt,
      fromRoomMs: handledAt === null || answeredAt === undefined ? null : answeredAt - handledAt,
    };
  });
  /* A leg can be negative when the room's clock is behind, so its spread is read from the sorted values. */
  const legs = (key) => {
    const values = commands
      .map((command) => command[key])
      .filter((value) => value !== null)
      .sort((a, b) => a - b);
    return values.length
      ? { samples: values.length, min: values[0], p50: values[Math.ceil(values.length / 2) - 1], max: values.at(-1) }
      : { samples: 0 };
  };
  return {
    clock:
      'sentAt and answeredAt are the coordinator epoch clock and handledAt is the room clock, which stands still while the room runs code. Each leg includes their unknown offset, so read a command against the median of its leg rather than as a one-way latency.',
    toRoomMs: legs('toRoomMs'),
    fromRoomMs: legs('fromRoomMs'),
    unmatched: commands.filter((command) => command.handledAt === null).length,
    commands,
  };
}
