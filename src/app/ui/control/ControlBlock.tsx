import { Box, Group, Stack } from '@mantine/core';
import { FieldWarning } from '@ui/content/FieldWarning';
import { HelpMark } from '@ui/content/HelpMark';
import { TruncatedText } from '@ui/content/TruncatedText';
import { useId } from 'react';
import type { ReactNode } from 'react';

/** What a ControlBlock hands its input, to spread onto the control that takes the value. */
interface ControlField {
  id: string;
  'aria-labelledby': string;
  'aria-describedby': string | undefined;
}

export interface ControlBlockProps {
  title: string;
  /** Reserved for a constraint or consequence the control itself cannot show; surfaces behind the (?) help icon. */
  description?: ReactNode;
  /** A value that is allowed but probably not meant, shown as one caution line under the input. */
  warning?: string;
  tool?: ReactNode;
  /**
   * The control.
   * Given as a function, it receives the field's id and accessible name and description to spread onto the control, so the title names it and nothing repeats the title as an `aria-label`.
   * Given as a node, the control names itself.
   */
  input: ReactNode | ((field: ControlField) => ReactNode);
  /** A fixed id for the input, when something else links to it; otherwise one is generated. */
  inputId?: string;
}

/**
 * Frames a form control with a title, an optional (?) help tooltip, optional tools, an optional warning, and group semantics.
 * The help text stays wired to assistive tech through the group's description even though it only paints on hover, focus, or touch.
 * The group is described by the help and the warning, because Mantine inputs replace an `aria-describedby` handed to them with their own.
 * An input given as a function is named by the title and, if it keeps the attribute, described by the warning;
 * icon-only tools remain responsible for their own accessible names.
 */
export function ControlBlock({ title, description, warning, tool, input, inputId }: ControlBlockProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const warningId = `${id}-warning`;
  const describedBy: string[] = [];
  if (description) {
    describedBy.push(descriptionId);
  }
  if (warning) {
    describedBy.push(warningId);
  }
  const field: ControlField = {
    id: inputId ?? `${id}-input`,
    'aria-labelledby': titleId,
    'aria-describedby': warning ? warningId : undefined,
  };

  return (
    <Stack
      role="group"
      aria-labelledby={titleId}
      aria-describedby={describedBy.length > 0 ? describedBy.join(' ') : undefined}
      gap={6}
    >
      <Group gap="sm" justify="space-between" align="center" wrap="nowrap">
        <Group gap={6} wrap="nowrap" flex="1 1 12rem" miw={0}>
          <TruncatedText id={titleId} fw={700} size="sm">
            {title}
          </TruncatedText>
          {description ? <HelpMark id={descriptionId} text={description} /> : null}
        </Group>
        {tool ? <Box>{tool}</Box> : null}
      </Group>
      <Box w="100%">{typeof input === 'function' ? input(field) : input}</Box>
      {warning ? <FieldWarning id={warningId}>{warning}</FieldWarning> : null}
    </Stack>
  );
}
