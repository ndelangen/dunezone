import { Group } from '@mantine/core';

import { FactionTokenFace } from './FactionTokenFace';
import type { FactionToken } from './FactionTokenFace';

export type FactionOption = Readonly<{ value: string; label: string; token: FactionToken }>;

/** The token and name beside one faction choice. */
export function factionOption(options: readonly FactionOption[], value: string) {
  const option = options.find((entry) => entry.value === value);
  return option ? (
    <Group gap="xs" wrap="nowrap">
      <FactionTokenFace token={option.token} size={28} />
      {option.label}
    </Group>
  ) : null;
}
