import { Menu } from '@mantine/core';
import { IconAction } from '@ui/control/IconAction';
import type { ReactNode } from 'react';

export interface ActionMenuItem {
  key: string;
  /** The words are data — what this choice does, as a verb phrase. */
  label: string;
  /** A glyph beside the label. An adornment, so it stays `ReactNode`. */
  icon?: ReactNode;
  /** `danger` for a choice that removes or destroys something; the tone-to-colour mapping is owned here. */
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onSelect: () => void;
}

export interface ActionMenuProps {
  /**
   * The trigger's accessible name, naming what the menu acts on — "Actions for House Atreides".
   * An icon-only control has no other way to say what it opens.
   */
  label: string;
  /** The trigger's glyph. */
  icon: ReactNode;
  items: ActionMenuItem[];
  disabled?: boolean;
  size?: 'sm' | 'lg';
}

/**
 * A menu of actions behind an icon trigger.
 *
 * A Control: callers hand it intents — a label, a glyph, and the choices — and it owns opening, the pane, and the mapping from tone to colour, so two menus in the same app cannot disagree about what a destructive choice looks like.
 * Mantine's `Menu` does the positioning, focus and dismissal;
 * the dropdown takes the app's pane treatment from the theme, the same one a `Popover` gets.
 *
 * Use it wherever a control opens a short list of actions on one thing.
 * A menu whose items navigate rather than act is not this component's job — that is a set of links.
 */
export function ActionMenu({ label, icon, items, disabled = false, size = 'sm' }: ActionMenuProps) {
  return (
    <Menu position="bottom-end" shadow="md" withinPortal>
      <Menu.Target>
        <IconAction label={label} variant="light" color="gray" size={size} disabled={disabled} icon={icon} />
      </Menu.Target>
      <Menu.Dropdown>
        {items.map((item) => (
          <Menu.Item
            key={item.key}
            color={item.tone === 'danger' ? 'red' : undefined}
            leftSection={item.icon}
            disabled={item.disabled}
            onClick={item.onSelect}
          >
            {item.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
