import { canTakeAdditionalFromDraft } from '@shared/play/tableState';

import type { TabletopContextValue } from './TabletopContext';

/* How long a number key is held before it draws that many from a stack. */
const DRAW_HOLD_MS = 1000;

type Controls = Pick<
  TabletopContextValue,
  | 'canInteract'
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
>;
type Binding = {
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  read(): Controls;
};

/* A digit is the character typed, like every other table shortcut, so AZERTY's top row gives digits only with Shift. */
function digitOf(event: KeyboardEvent) {
  return /^\d$/.test(event.key) ? Number(event.key) : null;
}

function hasModifier(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey || event.altKey;
}

/*
 * A focused text field keeps its keys from the table.
 * The table's shortcuts also leave a focused button or the panel divider alone, while the spice disc answers over them.
 */
function focusKeepsKey(target: EventTarget | null, branch: 'supply' | 'table') {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || target.matches('input, textarea, select')) {
    return true;
  }
  return branch === 'table' && target.matches("button, [role='separator']");
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
  private drawCode = '';

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

  /** The spice disc reports its hover here, and while it holds, a digit spawns spice instead of drawing. */
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
    if (!controls || hasModifier(event)) {
      return;
    }
    const digit = digitOf(event);
    if (digit !== null && this.supplyAnswers(event, controls)) {
      event.preventDefault();
      if (!event.repeat) {
        controls.spawnSpice(digit === 0 ? 10 : digit);
      }
    } else if (!focusKeepsKey(event.target, 'table')) {
      this.tableKey(event, controls);
    }
  };

  /* The physical key that started the draw ends it, whatever it types by then, as AZERTY's Shift+& does coming up as "&" once Shift is let go; without a code, the typed digit still does. */
  private keyUp = (event: KeyboardEvent) => {
    const sameKey = this.drawCode !== '' && event.code === this.drawCode;
    if (this.drawDigit !== null && (sameKey || digitOf(event) === this.drawDigit)) {
      this.cancelDraw();
    }
  };

  private cancelDraw = () => {
    if (this.drawTimer !== null) {
      clearTimeout(this.drawTimer);
      this.drawTimer = null;
    }
    this.drawDigit = null;
    this.drawCode = '';
  };

  /* The hovered disc takes a digit, 0 meaning ten, while the viewer can act and holds no carry. */
  private supplyAnswers(event: KeyboardEvent, { canInteract, state }: Controls) {
    return this.supplyHovered && canInteract && !state.draftMove && !focusKeepsKey(event.target, 'supply');
  }

  private tableKey(event: KeyboardEvent, controls: Controls) {
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
      this.restingPieceKey(event, pieceId, controls);
    }
  }

  private restingPieceKey(event: KeyboardEvent, pieceId: string, controls: Controls) {
    switch (event.key.toLowerCase()) {
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
    const digit = digitOf(event);
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
    this.drawCode = event.code === 'Unidentified' ? '' : event.code;
    this.drawTimer = setTimeout(() => {
      this.drawTimer = null;
      this.drawDigit = null;
      this.drawCode = '';
      this.binding?.read().splitSelected(digit, pieceId);
    }, DRAW_HOLD_MS);
  }
}
