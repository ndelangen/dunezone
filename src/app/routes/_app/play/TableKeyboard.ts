import { canTakeAdditionalFromDraft } from '@shared/play/tableState';

import type { TabletopContextValue } from './TabletopContext';

/* How long a number key is held before it draws that many from a stack. */
const DRAW_HOLD_MS = 1000;

/*
 * PROTOTYPE, #1323 F29: where a key press's digit is read.
 * 'key' is the character typed, as B proposes: AZERTY types 1 with Shift.
 * 'code' is the physical top-row or keypad key, as C proposes: the same key gives 1 on any layout, with or without Shift.
 */
export type DigitSource = 'key' | 'code';

type Controls = Pick<
  TabletopContextValue,
  | 'deckControls'
  | 'flipSelected'
  | 'hoveredPieceId'
  | 'rotateSelected'
  | 'spawnSpice'
  | 'splitSelected'
  | 'stackSelected'
  | 'state'
  | 'takeAdditionalFromTarget'
  | 'toggleLockSelected'
> & {
  canInteract: boolean;
  digits: DigitSource;
};
type Binding = {
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  read(): Controls;
};

function digitOf(event: KeyboardEvent, source: DigitSource) {
  const match = source === 'code' ? /^(?:Digit|Numpad)(\d)$/.exec(event.code) : /^(\d)$/.exec(event.key);
  return match ? Number(match[1]) : null;
}

function hasModifier(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey || event.altKey;
}

/* The spice disc's gate: a field that takes text keeps its digits. */
function isEditingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'));
}

/* The table's gate: a focused control keeps its keys too, down to a button's Space and the divider's arrows. */
function isControlTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches("input, textarea, select, button, [role='separator']"))
  );
}

/**
 * Owns one table's keyboard: the piece shortcuts, the one-second number-key draw, and spice from the hovered supply disc.
 * It binds to the window once and reads the live table through `read()`, so a table update never re-registers a listener.
 * Escape stays with the pointer session, which owns the carry it cancels.
 */
export class TableKeyboard {
  private binding: Binding | null = null;
  private supplyHovered = false;
  private drawTimer: ReturnType<typeof setTimeout> | null = null;
  private drawDigit: number | null = null;

  bind(binding: Binding) {
    this.release();
    this.binding = binding;
    binding.events.addEventListener('keydown', this.keyDown);
    binding.events.addEventListener('keyup', this.keyUp);
    binding.events.addEventListener('blur', this.cancelDraw);
    return () => {
      if (this.binding === binding) {
        this.release();
      }
    };
  }

  /** The spice disc reports its hover here; while it holds, a digit spawns spice instead of drawing. */
  hoverSupply(hovered: boolean) {
    this.supplyHovered = hovered;
  }

  private release() {
    const binding = this.binding;
    if (!binding) {
      return;
    }
    this.cancelDraw();
    binding.events.removeEventListener('keydown', this.keyDown);
    binding.events.removeEventListener('keyup', this.keyUp);
    binding.events.removeEventListener('blur', this.cancelDraw);
    this.binding = null;
  }

  private keyDown = (event: KeyboardEvent) => {
    const controls = this.binding?.read();
    if (!controls) {
      return;
    }
    if (this.supplyHovered && this.spawnFromSupply(event, controls)) {
      return;
    }
    this.tableKey(event, controls);
  };

  private keyUp = (event: KeyboardEvent) => {
    const controls = this.binding?.read();
    if (controls && this.drawDigit !== null && digitOf(event, controls.digits) === this.drawDigit) {
      this.cancelDraw();
    }
  };

  private cancelDraw = () => {
    if (this.drawTimer !== null) {
      clearTimeout(this.drawTimer);
      this.drawTimer = null;
    }
    this.drawDigit = null;
  };

  /* Any digit over the disc spawns that much spice, 0 meaning ten, while the viewer can act and holds no carry. Shift does not block it. */
  private spawnFromSupply(event: KeyboardEvent, controls: Controls) {
    if (!controls.canInteract || controls.state.draftMove || hasModifier(event) || isEditingTarget(event.target)) {
      return false;
    }
    const digit = digitOf(event, controls.digits);
    if (digit === null) {
      return false;
    }
    event.preventDefault();
    if (!event.repeat) {
      controls.spawnSpice(digit === 0 ? 10 : digit);
    }
    return true;
  }

  private tableKey(event: KeyboardEvent, controls: Controls) {
    if (isControlTarget(event.target) || hasModifier(event)) {
      return;
    }
    const { state } = controls;
    const key = event.key.toLowerCase();
    if (key === 't' && state.draftMove && canTakeAdditionalFromDraft(state, state.draftMove)) {
      event.preventDefault();
      if (!event.repeat) {
        controls.takeAdditionalFromTarget();
      }
      return;
    }
    const pieceId = state.draftMove?.pieceId ?? controls.hoveredPieceId ?? state.selectedPieceId ?? undefined;
    if (!pieceId) {
      return;
    }
    if (key === 'q' || key === 'e') {
      event.preventDefault();
      controls.rotateSelected(key === 'q' ? -1 : 1, pieceId);
      return;
    }
    if (!state.draftMove) {
      this.restingPieceKey(event, key, pieceId, controls);
    }
  }

  private restingPieceKey(event: KeyboardEvent, key: string, pieceId: string, controls: Controls) {
    switch (key) {
      case 'r': {
        const piece = controls.state.pieces.find((candidate) => candidate.id === pieceId);
        if (
          controls.hoveredPieceId === pieceId &&
          !event.repeat &&
          piece?.kind === 'card' &&
          piece.items.length > 1 &&
          controls.deckControls
        ) {
          event.preventDefault();
          controls.deckControls.shuffle(pieceId);
        }
        return;
      }
      case 'f':
        event.preventDefault();
        if (!event.repeat) {
          controls.flipSelected(pieceId);
        }
        return;
      case 'l':
        event.preventDefault();
        controls.toggleLockSelected(pieceId);
        return;
      case 'g':
        event.preventDefault();
        controls.stackSelected(pieceId);
        return;
    }
    const digit = digitOf(event, controls.digits);
    if (digit !== null && digit > 0) {
      event.preventDefault();
      this.startDraw(event, digit, pieceId);
    }
  }

  /* The draw keeps the piece it started on, whatever the hover does meanwhile, and a repeat never restarts it. */
  private startDraw(event: KeyboardEvent, digit: number, pieceId: string) {
    if (event.repeat || this.drawTimer !== null) {
      return;
    }
    this.drawDigit = digit;
    this.drawTimer = setTimeout(() => {
      this.drawTimer = null;
      this.drawDigit = null;
      this.binding?.read().splitSelected(digit, pieceId);
    }, DRAW_HOLD_MS);
  }
}
