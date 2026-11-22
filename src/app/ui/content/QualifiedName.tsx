import { Text } from '@mantine/core';

export interface QualifiedNameProps {
  /** The thing's name. */
  name: string;
  /** What tells it from others of the same name, such as a faction's variant; left out, the name stands alone. */
  qualifier?: string;
}

/**
 * A name with a dimmed qualifier after it: "House Atreides · Classic".
 * It draws inline, in the size and weight of the text that holds it, with the qualifier a regular weight.
 */
export function QualifiedName({ name, qualifier }: QualifiedNameProps) {
  if (qualifier === undefined) {
    return name;
  }
  return (
    <>
      {name}
      {/* The dot holds to the qualifier, so a name too long for its line breaks before the dot and never leaves it behind. */}
      <Text span inherit fw={400} c="dimmed">
        {' ·\u00A0'}
        {qualifier}
      </Text>
    </>
  );
}
