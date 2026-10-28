import { Menu } from '@mantine/core';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import { useId } from 'react';
import { createPortal } from 'react-dom';

export type HandMenuAnchor = { pieceId: string; x: number; y: number };

/** Where a right-click opens a hand piece's menu: at the pointer, keeping the browser's own menu shut. */
export function handMenuAnchor(event: MouseEvent, pieceId: string): HandMenuAnchor {
  event.preventDefault();
  return { pieceId, x: event.clientX, y: event.clientY };
}

/*
 * An empty positioning anchor at the pointer, not a control, as the table's piece menu uses.
 * It lives on the body: fixed against the viewport only there, since a window with a transform or a backdrop filter
 * (the compass's) would otherwise be its containing block and put it off-screen, where the dropdown hides itself.
 */
function PointerAnchor({ x, y, style, ...target }: ComponentProps<'span'> & { x: number; y: number }) {
  return createPortal(
    <span
      aria-hidden
      {...target}
      style={{ ...style, position: 'fixed', left: x, top: y, width: 1, height: 1, pointerEvents: 'none' }}
    />,
    document.body
  );
}

/** A hand piece's right-click menu, opened at the pointer as the table's piece menu is. */
export function HandPieceMenu({
  anchor,
  label,
  onClose,
  children,
}: {
  anchor: HandMenuAnchor | null;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const labelId = useId();
  return (
    <Menu opened={!!anchor} onChange={(opened) => !opened && onClose()} withinPortal position="bottom-start">
      <Menu.Target>
        <PointerAnchor x={anchor?.x ?? 0} y={anchor?.y ?? 0} />
      </Menu.Target>
      <Menu.Dropdown aria-labelledby={labelId}>
        <span id={labelId} hidden>
          {label}
        </span>
        {children}
      </Menu.Dropdown>
    </Menu>
  );
}
