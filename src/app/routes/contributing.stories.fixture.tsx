import { expect, within } from 'storybook/test';

export async function expectDiagramLabelsFit(region: HTMLElement) {
  const labels = Array.from(region.querySelectorAll<SVGSVGElement>('svg[role="img"]')).flatMap((drawing) => {
    const bounds = drawing.getBoundingClientRect();
    if (!bounds.width) {
      return [];
    }
    return Array.from(drawing.querySelectorAll('text')).map((label) => ({
      bounds,
      ink: label.getBoundingClientRect(),
      label: label.textContent ?? '',
    }));
  });
  await Promise.all(
    labels.map(async ({ bounds, ink, label }) => {
      await expect(ink.left, label).toBeGreaterThanOrEqual(bounds.left - 1);
      await expect(ink.right, label).toBeLessThanOrEqual(bounds.right + 1);
    })
  );
}

export async function expectMissingLesson({ canvasElement }: { canvasElement: HTMLElement }) {
  await expect(
    within(canvasElement.ownerDocument.body).findByRole('heading', { name: 'Page not found' }, { timeout: 30_000 })
  ).resolves.toBeVisible();
}
