import { Popover } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import { Copy } from 'lucide-react';
import { useState } from 'react';

import type { Faction } from '@db/factions';
import { FactionPicker } from '@app/pickers/FactionPicker';

export interface FactionLoadPopoverProps {
  disabled: boolean;
  currentPublicSlug?: string;
  onLoaded: (loaded: Faction) => void;
}

/**
 * The toolbar affordance that opens `FactionPicker`.
 * It owns nothing but the open state and the trigger: the picker is mounted only while the popover is open, so its subscription lives only that long.
 * This shell fetches nothing itself — it hands the picker its exclusion slug and a callback, and closes on load or cancel.
 *
 * The editor wants a draft, not a row, so this is where the picked faction's identifiers are dropped: the picker reports *which* faction was chosen, and loading one into a draft only needs its data.
 */
export function FactionLoadPopover({ disabled, currentPublicSlug, onLoaded }: FactionLoadPopoverProps) {
  const [opened, setOpened] = useState(false);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      width={440}
      shadow="md"
      withArrow
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <IconAction
          label="Load existing faction"
          variant="light"
          color="gray"
          size="lg"
          disabled={disabled}
          onClick={() => setOpened((current) => !current)}
          icon={<Copy size={17} aria-hidden />}
        />
      </Popover.Target>
      <Popover.Dropdown>
        {opened ? (
          <FactionPicker
            currentPublicSlug={currentPublicSlug}
            onCancel={() => setOpened(false)}
            onPick={(picked) => {
              onLoaded(picked.data);
              setOpened(false);
            }}
          />
        ) : null}
      </Popover.Dropdown>
    </Popover>
  );
}
