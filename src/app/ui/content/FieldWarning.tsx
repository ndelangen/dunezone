import { Text } from '@mantine/core';

export interface FieldWarningProps {
  /** The id a field names in its `aria-describedby`; a warning about no one field needs none. */
  id?: string;
  /** What is off about the value, in one or two sentences. */
  children: string;
}

/**
 * One caution-toned line under a field: the value is allowed, but probably not what the author meant.
 * It is a `status` live region, so the warning is heard when it appears while typing, not only when the field is next focused.
 * `ControlBlock` renders it for its `warning`;
 * a field outside a ControlBlock renders it directly.
 */
export function FieldWarning({ id, children }: FieldWarningProps) {
  return (
    <Text id={id} c="var(--color-caution)" size="xs" role="status">
      {children}
    </Text>
  );
}
