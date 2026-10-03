import { canTakeAdditionalFromDraft } from '@shared/play/tableState';

import type { TabletopContextValue } from './TabletopContext';

/* How long a number key is held before it draws that many from a stack. */
const DRAW_HOLD_MS = 1000;

type Controls = Pick<
  TabletopContextValue,
  | 'canHandleTable'
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

/* The keys that slide a close look of the board, as a direction on the table: x to the right, z toward the viewer. */
const PAN_KEYS: Record<string, readonly [number, number]> = {
  w: [0, -1],
  arrowup: [0, -1],
  s: [0, 1],
  arrowdown: [0, 1],
  a: [-1, 0],
  arrowleft: [-1, 0],
  d: [1, 0],
  arrowright: [1, 0],
};

/* A digit is the character typed, like every other table shortcut, so AZERTY's top row gives digits only with Shift. */
function digitOf(event: KeyboardEvent) {
  return /^\d$/.test(event.key) ? Number(event.key) : null;
}

function hasModifier(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey || event.altKey;
}

/*
 * What the keyboard has reached on purpose: a control or a link.
 * A focusable region such as the conversation history, and an open piece menu, are left out: the keys keep working over the table while either has focus.
 */
const FOCUSED_CONTROL = "button, a[href], [role='button'], [role='separator']";

/*
 * A focused text field keeps its keys from the table.
 * The table's shortcuts also leave any other focused control or link alone, while the spice disc answers over them.
 */
function focusKeepsKey(target: EventTarget | null, branch: 'spiceBank' | 'table') {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || target.matches('input, textarea, select')) {
    return true;
  }
  return branch === 'table' && target.closest(FOCUSED_CONTROL) !== null;
}

/**
 * Owns one table's keyboard: the piece shortcuts, the one-second number-key draw, and spice from the hovered Spice Bank disc.
 * It binds to the window once and reads the live table through `read()`, so a table update never re-registers a listener.
 * Escape stays with the pointer session, which owns the carry it cancels.
 */
export class TableKeyboard {
  private binding: Binding | null = null;
  private spiceBankHovered = false;
  private drawTimer: ReturnType<typeof setTimeout> | null = null;
  private drawDigit: number | null = null;
  private drawCode = '';
  private panAvailable = false;
  private readonly panHeld = new Set<string>();
  private readonly panListeners = new Set<() => void>();

  bind(binding: Binding) {
    this.release();
    this.binding = binding;
    binding.events.addEventListener('keydown', this.keyDown);
    binding.events.addEventListener('keyup', this.keyUp);
    binding.events.addEventListener('blur', this.cancelDraw);
    binding.events.addEventListener('blur', this.releasePan);
    return () => {
      if (this.binding === binding) {
        this.release();
      }
    };
  }

  /** The camera reports here whether a close look is open, which is when the pan keys slide it. */
  setPanAvailable(available: boolean) {
    this.panAvailable = available;
    if (!available) {
      this.releasePan();
    }
  }

  /** The direction the held pan keys point, on the table: x to the right, z toward the viewer. */
  panDirection(): [number, number] {
    let x = 0;
    let z = 0;
    for (const key of this.panHeld) {
      x += PAN_KEYS[key][0];
      z += PAN_KEYS[key][1];
    }
    return [Math.sign(x), Math.sign(z)];
  }

  /** Hears the pan keys going down or up, so a camera that draws on demand can start drawing. */
  onPanChange(listener: () => void) {
    this.panListeners.add(listener);
    return () => {
      this.panListeners.delete(listener);
    };
  }

  private releasePan = () => {
    if (this.panHeld.size === 0) {
      return;
    }
    this.panHeld.clear();
    this.panListeners.forEach((listener) => listener());
  };

  /** The spice disc reports its hover here, and while it holds, a digit spawns spice instead of drawing. */
  hoverSpiceBank(hovered: boolean) {
    this.spiceBankHovered = hovered;
  }

  private release() {
    const binding = this.binding;
    if (!binding) {
      return;
    }
    this.cancelDraw();
    this.releasePan();
    binding.events.removeEventListener('blur', this.releasePan);
    binding.events.removeEventListener('keydown', this.keyDown);
    binding.events.removeEventListener('keyup', this.keyUp);
    binding.events.removeEventListener('blur', this.cancelDraw);
    this.binding = null;
  }

  private keyDown = (event: KeyboardEvent) => {
    const controls = this.binding?.read();
    /* A key a control already answered, such as an arrow moving a peeked card, is not the table's. */
    if (!controls || hasModifier(event) || event.defaultPrevented) {
      return;
    }
    if (this.panKeyDown(event)) {
      return;
    }
    const digit = digitOf(event);
    if (digit !== null && this.spiceBankAnswers(event, controls)) {
      event.preventDefault();
      if (!event.repeat) {
        controls.spawnSpice(digit === 0 ? 10 : digit);
      }
    } else if (!focusKeepsKey(event.target, 'table')) {
      this.tableKey(event, controls);
    }
  };

  /* A pan key held while a close look is open slides it; a focused control keeps its arrow keys, as a tab list does, while only a text field keeps the letters. */
  private panKeyDown(event: KeyboardEvent) {
    const panKey = event.key.toLowerCase();
    const panFocus = panKey.startsWith('arrow') ? 'table' : 'spiceBank';
    if (!this.panAvailable || !(panKey in PAN_KEYS) || focusKeepsKey(event.target, panFocus)) {
      return false;
    }
    event.preventDefault();
    if (!this.panHeld.has(panKey)) {
      this.panHeld.add(panKey);
      this.panListeners.forEach((listener) => listener());
    }
    return true;
  }

  /* The physical key that started the draw ends it, whatever it types by then, as AZERTY's Shift+& does coming up as "&" once Shift is let go; without a code, the typed digit still does. */
  private keyUp = (event: KeyboardEvent) => {
    /* A key let go after Shift or a layout change may type another case; both forms end the pan. */
    if (this.panHeld.delete(event.key.toLowerCase())) {
      this.panListeners.forEach((listener) => listener());
    }
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

  /* The hovered disc takes a digit, 0 meaning ten, while the viewer can handle the table and holds no carry. */
  private spiceBankAnswers(event: KeyboardEvent, { canHandleTable, state }: Controls) {
    return this.spiceBankHovered && canHandleTable && !state.draftMove && !focusKeepsKey(event.target, 'spiceBank');
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
