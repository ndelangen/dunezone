import { canTakeAdditionalFromDraft } from '@shared/play/tableState';

import type { TabletopContextValue } from './TabletopContext';

/* How long a number key is held before it draws that many from a stack. */
const DRAW_HOLD_MS = 1000;

type Controls = Pick<
  TabletopContextValue,
  | 'canHandleTable'
  | 'deckControls'
  | 'finishRotation'
  | 'flipSelected'
  | 'hoveredPieceId'
  | 'ping'
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

/* The key on the keyboard, or what it types when the browser does not say which key it is. */
function physicalKey(event: KeyboardEvent) {
  return event.code && event.code !== 'Unidentified' ? event.code : event.key.toLowerCase();
}

/** Claims the key and acts on the first press only, never on held-key repeats. */
function pressOnce(event: KeyboardEvent, action: () => void) {
  event.preventDefault();
  if (!event.repeat) {
    action();
  }
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
  /* The physical keys turning a piece; the turn goes out when the last comes up. */
  private readonly rotateHeld = new Set<string>();
  /* Whether the Tab held down now pinged, so its repeats stay with the table too. */
  private pingHeld = false;
  /* The held pan keys, by the physical key that went down, with the direction it typed then. */
  private readonly panHeld = new Map<string, string>();
  private readonly panListeners = new Set<() => void>();

  bind(binding: Binding) {
    this.release();
    this.binding = binding;
    binding.events.addEventListener('keydown', this.keyDown);
    binding.events.addEventListener('keyup', this.keyUp);
    binding.events.addEventListener('blur', this.cancelDraw);
    binding.events.addEventListener('blur', this.releasePan);
    binding.events.addEventListener('blur', this.releasePing);
    binding.events.addEventListener('blur', this.releaseRotation);
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
    for (const key of new Set(this.panHeld.values())) {
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
    this.releaseRotation();
    binding.events.removeEventListener('blur', this.releasePan);
    binding.events.removeEventListener('blur', this.releasePing);
    binding.events.removeEventListener('blur', this.releaseRotation);
    binding.events.removeEventListener('keydown', this.keyDown);
    binding.events.removeEventListener('keyup', this.keyUp);
    binding.events.removeEventListener('blur', this.cancelDraw);
    this.binding = null;
  }

  private keyDown = (event: KeyboardEvent) => {
    /* macOS sends no keyup for a key let go while Cmd is down, so Cmd lets go of a held pan or draw rather than leave it running. */
    if (event.key === 'Meta') {
      this.releasePan();
      this.cancelDraw();
      this.releaseRotation();
    }
    const controls = this.binding?.read();
    /* A key a control already answered, such as an arrow moving a peeked card, is not the table's. */
    if (!controls || hasModifier(event) || event.defaultPrevented) {
      return;
    }
    if (this.panKeyDown(event)) {
      return;
    }
    if (event.key === 'Tab') {
      this.pingKey(event, controls);
      return;
    }
    const digit = digitOf(event);
    if (digit !== null && this.spiceBankAnswers(event, controls)) {
      pressOnce(event, () => controls.spawnSpice(digit === 0 ? 10 : digit));
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
    const held = physicalKey(event);
    if (!this.panHeld.has(held)) {
      this.panHeld.set(held, panKey);
      this.panListeners.forEach((listener) => listener());
    }
    return true;
  }

  /*
   * Tab pings where the cursor is, as in Tabletop Simulator, instead of moving the focus; holding it pings once.
   * A button clicked a moment ago keeps the focus, and the cursor back over the table still pings; only a focused text field keeps its Tab.
   * With the cursor off the table there is nowhere to ping, so Tab moves the focus as usual.
   */
  private pingKey(event: KeyboardEvent, controls: Controls) {
    if (event.shiftKey || focusKeepsKey(event.target, 'spiceBank')) {
      return;
    }
    if (!event.repeat) {
      this.pingHeld = controls.ping();
    }
    if (this.pingHeld) {
      event.preventDefault();
    }
  }

  /* A Tab let go while the page had no focus never comes up here, so leaving the page lets it go. */
  private releasePing = () => {
    this.pingHeld = false;
  };

  /* A turn held when the page loses the key, as when it loses focus, goes out as far as it got. */
  private releaseRotation = () => {
    if (this.rotateHeld.size === 0) {
      return;
    }
    this.rotateHeld.clear();
    this.binding?.read().finishRotation();
  };

  private keyUp = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      this.releasePing();
    }
    if (this.rotateHeld.delete(physicalKey(event)) && this.rotateHeld.size === 0) {
      this.binding?.read().finishRotation();
    }
    /* The physical key ends its pan, whatever it types by then: macOS's Option turns a held W into "∑" before it comes up. */
    if (this.panHeld.delete(physicalKey(event))) {
      this.panListeners.forEach((listener) => listener());
    }
    /* The physical key that started the draw ends it, whatever it types by then, as AZERTY's Shift+& does coming up as "&" once Shift is let go; without a code, the typed digit still does. */
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
      pressOnce(event, () => controls.takeAdditionalFromTarget());
      return;
    }
    const pieceId = state.draftMove?.pieceId ?? controls.hoveredPieceId ?? state.selectedPieceId ?? undefined;
    if (!pieceId) {
      return;
    }
    /* Each repeat of a held Q or E turns the piece a step further on this page; the room hears the whole turn once the key comes up. */
    if (key === 'q' || key === 'e') {
      event.preventDefault();
      this.rotateHeld.add(physicalKey(event));
      controls.rotateSelected(key === 'q' ? -1 : 1, pieceId);
      return;
    }
    /* F turns over a held piece in hand as it does one at rest. */
    if (key === 'f') {
      pressOnce(event, () => controls.flipSelected(pieceId));
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
      case 'l':
        pressOnce(event, () => controls.toggleLockSelected(pieceId));
        return;
      case 'g':
        pressOnce(event, () => controls.stackSelected(pieceId));
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
      this.cancelDraw();
      this.binding?.read().splitSelected(digit, pieceId);
    }, DRAW_HOLD_MS);
  }
}
