import { Combobox, Group, Input, InputBase, Loader, Stack } from '@mantine/core';
import { X } from 'lucide-react';
import { Suspense, useState } from 'react';
import type { ReactNode } from 'react';

import { ControlBlock } from './ControlBlock';
import { IconAction } from './IconAction';

export interface PickerFieldProps {
  /** The field's visible name, "Faction". */
  title: string;
  /** A constraint or consequence behind the (?) mark: what follows the choice and what stays put. */
  description?: ReactNode;
  /** The words in the field: the chosen thing's name, or "Choose faction" (drawn as a placeholder) while nothing is chosen. */
  chosen: string;
  /**
   * What a screen reader calls the button, when the visible words lean on their surroundings:
   * "Choose left faction" for one of two sides that both read "Choose faction".
   */
  chooseLabel?: string;
  /** Empties the field. Omit it while nothing is chosen: the clear action is not drawn and `chosen` reads as a placeholder. */
  onClear?: () => void;
  /** What a screen reader calls the clear action; "Clear faction" from the title when omitted. */
  clearLabel?: string;
  /** The picker that opens under the button. It may load lazily; this shows a spinner while it does. */
  picker: (close: () => void) => ReactNode;
  /** What the spinner says while the picker loads, "Loading factions". */
  loadingLabel: string;
}

/**
 * Whether the picker is open, for a caller that keeps two pickers from being open together.
 * Both or neither: omit them and the field keeps its own.
 */
type OpenState =
  | { opened: boolean; onOpenChange: (opened: boolean) => void }
  | { opened?: never; onOpenChange?: never };

/**
 * Picks one thing from a picker that opens in place, and clears it again.
 *
 * Callers own the picker, the chosen thing's name and what clearing means;
 * this owns the arrangement: the field that names the choice and opens the picker, the clear action beside it, and the spinner while a lazily loaded picker arrives.
 * The picker comes in as a slot so the field itself never fetches.
 * The field names a value rather than an action, so it wears a select's input look (box, placeholder, chevron) and not a button's.
 * It exists because the rulebook editor wrote this control six times, each with its own text-only Clear button.
 */
export function PickerField({
  title,
  description,
  chosen,
  chooseLabel,
  onClear,
  clearLabel = `Clear ${title.toLowerCase()}`,
  picker,
  loadingLabel,
  opened: controlled,
  onOpenChange,
}: PickerFieldProps & OpenState) {
  const [own, setOwn] = useState(false);
  const opened = controlled ?? own;
  const setOpened = onOpenChange ?? setOwn;
  return (
    <ControlBlock
      title={title}
      description={description}
      input={
        <Stack gap="sm">
          <Group gap="sm" wrap="nowrap">
            <InputBase
              component="button"
              type="button"
              pointer
              flex={1}
              rightSection={<Combobox.Chevron />}
              rightSectionPointerEvents="none"
              aria-label={chooseLabel}
              aria-expanded={opened}
              onClick={() => setOpened(!opened)}
            >
              {onClear ? chosen : <Input.Placeholder>{chosen}</Input.Placeholder>}
            </InputBase>
            {onClear ? (
              <IconAction
                label={clearLabel}
                emphasis="quiet"
                intent="neutral"
                icon={<X size={16} aria-hidden />}
                onClick={onClear}
              />
            ) : null}
          </Group>
          {opened ? (
            <Suspense fallback={<Loader size="sm" aria-label={loadingLabel} />}>
              {picker(() => setOpened(false))}
            </Suspense>
          ) : null}
        </Stack>
      }
    />
  );
}
