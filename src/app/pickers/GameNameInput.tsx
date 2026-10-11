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
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
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
        label="Game name"
        description="Leave blank for a Dune name. Keep names family-friendly."
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        error={error}
        disabled={disabled}
      />
      {probe ? <NameAdvice key={value} name={value} /> : null}
    </Stack>
  );
}

function NameAdvice({ name }: Readonly<{ name: string }>) {
  const advice = useGameNameAvailability(name);
  return advice ? (
    <Text size="sm" c="dimmed" role="status">
      {advice.duplicate
        ? 'This address is already used. You can keep the name; your game link will gain a number.'
        : 'Your game link is assigned when you create the game. This check does not reserve it.'}
    </Text>
  ) : null;
}
