/*
 * PROTOTYPE (#2988): how hovering a stack shows its count. Each story picks one look; the default is today's table.
 * Delete this switch once a look is picked and built for real.
 */
export type StackHoverLook =
  | 'today'
  | 'count'
  | 'name-and-count'
  | 'count-with-hint'
  | 'hint-after-pause'
  | 'hint-until-alt'
  | 'count-with-key';

let look: StackHoverLook = 'today';

export function stackHoverLook(): StackHoverLook {
  return look;
}

export function setStackHoverLook(next: StackHoverLook) {
  look = next;
}

const ALT_USED_KEY = 'dune:stack-hover-prototype:alt-used';

/** Whether the player has held Alt on the table before, so the hint has done its job. */
export function altUsedBefore(): boolean {
  try {
    return localStorage.getItem(ALT_USED_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberAltUsed() {
  try {
    localStorage.setItem(ALT_USED_KEY, '1');
  } catch {
    /* A page without storage shows the hint every time. */
  }
}

export function forgetAltUsed() {
  try {
    localStorage.removeItem(ALT_USED_KEY);
  } catch {
    /* Nothing to forget. */
  }
}

/* Holding Alt once retires the hint in the 'hint-until-alt' look. */
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Alt') {
      rememberAltUsed();
    }
  });
}
