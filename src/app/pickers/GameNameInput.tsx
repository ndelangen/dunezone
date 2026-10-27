import { Stack, Text, TextInput } from '@mantine/core';
import { playGameNameSchema } from '@shared/play/gameNames';
import { useEffect, useState } from 'react';

import { useGameNameAvailability } from '@db/play';

/** The creator owns the name; this Picker reads only the settled name's address hint. */
export function GameNameInput({
  value,
  onChange,
  error,
  disabled,
  useAvailability = useGameNameAvailability,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  /** Where the address hint comes from: Convex, unless the page answers it itself, as the tutorial does. */
  useAvailability?: typeof useGameNameAvailability;
}>) {
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), 400);
    return () => clearTimeout(timer);
  }, [value]);
  const probe = value === settled && playGameNameSchema.safeParse(value).success;
  return (
    <Stack gap="xs">
      <TextInput
        label="Custom name"
        description="Keep names family-friendly. Turn the switch off to go back to the generated name."
        placeholder="Name your game"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        error={error}
        disabled={disabled}
      />
      {probe ? <NameAdvice key={value} name={value} useAvailability={useAvailability} /> : null}
    </Stack>
  );
}

function NameAdvice({
  name,
  useAvailability,
}: Readonly<{ name: string; useAvailability: typeof useGameNameAvailability }>) {
  const advice = useAvailability(name);
  return advice ? (
    <Text size="sm" c="dimmed" role="status">
      {advice.duplicate
        ? 'This address is already used. You can keep the name; your game link will gain a number.'
        : 'Your game link is assigned when you create the game. This check does not reserve it.'}
    </Text>
  ) : null;
}
