import { Popover } from '@mantine/core';
import { ActionMenu } from '@ui/control/ActionMenu';
import { IconAction } from '@ui/control/IconAction';
import { EllipsisVertical, Link2, Link2Off } from 'lucide-react';
import { useState } from 'react';

import { FactionPicker } from '@app/pickers/FactionPicker';

/**
 * The toolbar affordance that adds a faction to this ruleset.
 * It owns the open state and nothing else: the picker is mounted only while the popover is open, so its subscription lives exactly that long, which is the contract `AGENTS.md` sets for a Picker's container.
 * The commit is the caller's — this reports the chosen faction's id and closes.
 */
export function AddFactionPopover({
  disabled,
  linkedSlugs,
  rulesetName,
  onAdd,
}: {
  disabled: boolean;
  /** Every faction already in this ruleset, so the picker cannot offer a duplicate. */
  linkedSlugs: string[];
  rulesetName: string;
  onAdd: (factionId: string) => void;
}) {
  const [opened, setOpened] = useState(false);

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      width={440}
      shadow="md"
      withArrow
      trapFocus
      returnFocus
    >
      <Popover.Target>
        <IconAction
          label="Add a faction"
          variant="filled"
          color="dune"
          size="lg"
          disabled={disabled}
          onClick={() => setOpened((current) => !current)}
          icon={<Link2 size={17} aria-hidden />}
        />
      </Popover.Target>
      <Popover.Dropdown>
        {opened ? (
          <FactionPicker
            excludeSlugs={linkedSlugs}
            copy={{
              title: 'Add a faction',
              intro: `Choose a faction to add to ${rulesetName}. Factions already in it are not listed.`,
              errorTitle: 'Faction could not be added',
              emptyMessage: 'Every faction is already in this ruleset.',
              confirmTitle: `Add this faction to ${rulesetName}?`,
              /* No warning: nothing is overwritten, and the card's own menu takes it straight back out. */
              confirmLabel: 'Add faction',
              confirmColor: 'confirm',
            }}
            onCancel={() => setOpened(false)}
            onPick={(picked) => {
              onAdd(picked.id);
              setOpened(false);
            }}
          />
        ) : null}
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 * The menu in a faction card's action slot, on the ruleset page.
 * One choice today;
 * `ActionMenu` owns how a menu looks and what a destructive choice reads like, so this only decides what the choices are.
 * No confirmation — the toolbar's picker puts the faction straight back.
 */
export function FactionCardMenu({
  factionName,
  rulesetName,
  disabled,
  onRemove,
}: {
  factionName: string;
  rulesetName: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <ActionMenu
      label={`Actions for ${factionName}`}
      icon={<EllipsisVertical size={15} aria-hidden />}
      disabled={disabled}
      items={[
        {
          key: 'remove',
          label: `Remove from ${rulesetName}`,
          icon: <Link2Off size={15} aria-hidden />,
          tone: 'danger',
          onSelect: onRemove,
        },
      ]}
    />
  );
}
