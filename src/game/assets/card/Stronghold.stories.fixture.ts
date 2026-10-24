import { expect, waitFor, within } from 'storybook/test';

/** Each stock face fills the illustration window and keeps its whole Body inside the frame. */
export async function checkBody({ canvasElement, args }: { canvasElement: HTMLElement; args: { text: string } }) {
  await document.fonts.ready;
  const body = within(canvasElement).getByText(args.text, { exact: true }).closest('div');
  await expect(body).not.toBeNull();
  await expect(body!.scrollHeight).toBeLessThanOrEqual(body!.clientHeight);
  const illustration = canvasElement.querySelector('svg image')! as SVGImageElement;
  const image = new Image();
  image.src = illustration.href.baseVal;
  await image.decode();
  await waitFor(() => expect(illustration.getBBox().height).toBeGreaterThan(0));
  const box = illustration.getBBox();
  const fit = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
  const width = image.naturalWidth * fit;
  const height = image.naturalHeight * fit;
  const bounds = { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
  await expect(bounds.x).toBeLessThanOrEqual(74);
  await expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(826);
  await expect(bounds.y).toBeLessThanOrEqual(254);
  await expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(686);
}
