import type { TablePiece, Vector3Tuple } from './model';
import type { TabletopContextValue } from './TabletopContext';

const DRAG_THRESHOLD_PX = 4;
const STACK_HOLD_MS = 320;

type PointerInput = Pick<PointerEvent, 'pointerId' | 'button' | 'clientX' | 'clientY' | 'timeStamp'>;
type Controls = Pick<TabletopContextValue, 'beginGesture' | 'updateGesture' | 'finishGesture' | 'cancelDraft'> & {
  canInteract: boolean;
  hasDraft: boolean;
  piece(id: string): TablePiece | undefined;
  point(piece: TablePiece, x: number, y: number): Vector3Tuple | null;
  isPublicPoint(x: number, y: number): boolean;
  publishPointer(point: Vector3Tuple | null): void;
  onActiveChange(active: boolean): void;
};
type Binding = {
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  canvas: HTMLCanvasElement;
  read(): Controls;
};
type ActivePress = {
  input: PointerInput;
  pieceId: string;
  origin: 'table' | 'panel';
  dragging: boolean;
  draftObserved: boolean;
};

/** Owns one table's active pointer from pickup through drop or cancellation. */
export class PointerSession {
  private binding: Binding | null = null;
  private active: ActivePress | null = null;

  get busy() {
    return this.active !== null;
  }

  bind(binding: Binding) {
    this.cancel();
    this.binding?.events.removeEventListener('keydown', this.keyDown);
    this.binding = binding;
    binding.events.addEventListener('keydown', this.keyDown);
    return () => {
      if (this.binding === binding) {
        this.cancel();
        binding.events.removeEventListener('keydown', this.keyDown);
        this.binding = null;
      }
    };
  }

  press(input: PointerInput, pieceId: string) {
    return this.start(input, pieceId, 'table');
  }

  carry(input: PointerInput, pieceId: string, pickup: 'top' | 'whole') {
    if (this.start(input, pieceId, 'panel')) {
      this.beginDrag(pickup);
    }
  }

  isDragging(pieceId: string) {
    return this.active?.pieceId === pieceId && this.active.dragging;
  }

  reconcile() {
    if (!this.active || !this.binding) {
      return;
    }
    const controls = this.binding.read();
    if (!controls.canInteract || !controls.piece(this.active.pieceId)) {
      this.cancel();
    } else if (controls.hasDraft) {
      this.active.draftObserved = true;
    } else if (this.active.draftObserved) {
      /* Scene renders can lag pickup; only a draft that was observed can disappear. */
      this.release('default');
    }
  }

  cancel = () => {
    if (!this.active || !this.binding) {
      return;
    }
    const dragging = this.active.dragging;
    const controls = this.binding.read();
    this.release('default');
    if (dragging) {
      controls.cancelDraft();
    }
    controls.publishPointer(null);
  };

  private start(input: PointerInput, pieceId: string, origin: ActivePress['origin']) {
    if (input.button !== 0 || this.active || !this.binding) {
      return false;
    }
    const controls = this.binding.read();
    if (!controls.canInteract || !controls.piece(pieceId)) {
      return false;
    }
    this.active = { input, pieceId, origin, dragging: false, draftObserved: false };
    this.listen(this.binding);
    controls.onActiveChange(true);
    try {
      this.binding.canvas.setPointerCapture(input.pointerId);
    } catch {
      this.release('default');
      return false;
    }
    return true;
  }

  private listen({ events, canvas }: Binding) {
    events.addEventListener('pointermove', this.move);
    events.addEventListener('pointerup', this.drop);
    events.addEventListener('pointercancel', this.pointerCancelled);
    events.addEventListener('blur', this.cancel);
    canvas.addEventListener('lostpointercapture', this.pointerCancelled);
  }

  private release(cursor: string) {
    const active = this.active;
    const binding = this.binding;
    if (!active || !binding) {
      return;
    }
    this.active = null;
    const { events, canvas } = binding;
    events.removeEventListener('pointermove', this.move);
    events.removeEventListener('pointerup', this.drop);
    events.removeEventListener('pointercancel', this.pointerCancelled);
    events.removeEventListener('blur', this.cancel);
    canvas.removeEventListener('lostpointercapture', this.pointerCancelled);
    try {
      canvas.releasePointerCapture(active.input.pointerId);
    } catch {
      /* The browser may already have released capture after cancellation. */
    }
    canvas.style.cursor = cursor;
    binding.read().onActiveChange(false);
  }

  private matches(input: Pick<PointerInput, 'pointerId'>) {
    return this.active?.input.pointerId === input.pointerId;
  }

  private beginDrag(pickup: 'top' | 'whole') {
    if (!this.active || !this.binding) {
      return;
    }
    this.active.dragging = true;
    this.binding.read().beginGesture(this.active.pieceId, pickup);
    this.binding.canvas.style.cursor = 'grabbing';
  }

  private dragAfterThreshold(input: PointerInput) {
    const active = this.active;
    if (!active) {
      return false;
    }
    if (active.dragging) {
      return true;
    }
    if (Math.hypot(input.clientX - active.input.clientX, input.clientY - active.input.clientY) < DRAG_THRESHOLD_PX) {
      return false;
    }
    this.beginDrag(input.timeStamp - active.input.timeStamp >= STACK_HOLD_MS ? 'whole' : 'top');
    return true;
  }

  private point(input: PointerInput) {
    if (!this.active || !this.binding) {
      return null;
    }
    const controls = this.binding.read();
    const piece = controls.piece(this.active.pieceId);
    return piece ? controls.point(piece, input.clientX, input.clientY) : null;
  }

  private move = (event: PointerEvent) => {
    if (!this.matches(event) || !this.binding) {
      return;
    }
    const controls = this.binding.read();
    if (this.active?.origin === 'table' && !controls.isPublicPoint(event.clientX, event.clientY)) {
      this.cancel();
      return;
    }
    if (!this.dragAfterThreshold(event)) {
      return;
    }
    const point = this.point(event);
    if (point) {
      controls.updateGesture(point);
    }
  };

  private drop = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }
    if (!this.matches(event) || !this.binding) {
      return;
    }
    const controls = this.binding.read();
    const dragging = this.dragAfterThreshold(event);
    const point = dragging ? this.point(event) : null;
    this.release('grab');
    if (!dragging) {
      return;
    }
    if (point) {
      controls.finishGesture(point);
    } else {
      controls.cancelDraft();
      controls.publishPointer(null);
    }
  };

  private pointerCancelled = (event: PointerEvent) => {
    if (this.matches(event)) {
      this.cancel();
    }
  };

  private keyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') {
      return;
    }
    if (this.active) {
      this.cancel();
    } else {
      this.binding?.read().cancelDraft();
    }
  };
}
