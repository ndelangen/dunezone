/*
 * The browser's own `getContext`, kept as its property descriptor rather than as a bare method reference.
 * A replacement calls it through `Reflect.apply` with the canvas as `this`, and defining the descriptor again restores the prototype exactly.
 */
export function nativeGetContext() {
  const descriptor: TypedPropertyDescriptor<HTMLCanvasElement['getContext']> | undefined =
    Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
  const value = descriptor?.value;
  if (!descriptor || !value) {
    throw new TypeError('HTMLCanvasElement has no getContext method.');
  }
  return { descriptor, value };
}
