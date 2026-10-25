import { expect, waitFor, within } from 'storybook/test';

import { resetTableGraphics, TABLE_GRAPHICS_UNAVAILABLE } from '../../../widgets/tabletop/useTableGraphics';
import { install } from './game.stories.fixture';
import { productTransport } from './product.stories.fixture';
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

/* Takes WebGL2 away and puts `gpu` in place of the browser's WebGPU, then restores both and the probe's answer. */
export const withoutGraphics = (gpu: unknown) => () => {
  resetTableGraphics();
  const getContext = nativeGetContext();
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
    return kind === 'webgl2' ? null : Reflect.apply(getContext.value, this, [kind, ...rest]);
  } as HTMLCanvasElement['getContext'];
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: gpu });
  const uninstall = install(() => productTransport())();
  return () => {
    uninstall();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', getContext.descriptor);
    Reflect.deleteProperty(navigator, 'gpu');
    resetTableGraphics();
  };
};

export async function expectGraphicsMessage(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const message = await page.findByRole('alert', {}, { timeout: 30_000 });
  await expect(message).toHaveTextContent(TABLE_GRAPHICS_UNAVAILABLE);
  const shell = canvasElement.ownerDocument.querySelector<HTMLElement>('.dune-play-shell')!;
  await waitFor(() => expect(shell.parentElement).toHaveAttribute('data-scene-ready', 'true'));
  await expect(shell.querySelector('canvas')).toBeNull();
  await expect(page.getByRole('button', { name: 'Game menu' })).toBeVisible();
  await expect(page.queryByText('Something went wrong!')).toBeNull();
}
