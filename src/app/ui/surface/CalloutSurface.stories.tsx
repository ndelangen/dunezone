import { Button, Group, Text } from '@mantine/core';
import preview from '@sb/preview';
import { expect, waitFor, within } from 'storybook/test';

import { CalloutSurface } from './CalloutSurface';

const meta = preview.meta({ component: CalloutSurface });
const calloutActions = (
  <Group justify="space-between">
    <Button variant="default">Cancel</Button>
    <Button>Ready</Button>
  </Group>
);

async function expectCalloutGeometry(canvasElement: HTMLElement, pointerAbove = false) {
  const canvas = within(canvasElement);
  const cancel = canvas.getByRole('button', { name: 'Cancel' });
  expect(cancel).toBeVisible();
  const [shape] = canvasElement.querySelectorAll('svg path');
  expect(shape).toBeTruthy();
  if (!(shape instanceof SVGPathElement)) {
    return;
  }
  await waitFor(() => expect(shape.getAttribute('d')).toMatch(/\bM\b/));
  const outline = shape.getAttribute('d') ?? '';
  expect.soft(outline.match(/\bM\b/g) ?? []).toHaveLength(1);
  expect.soft(outline.match(/\bZ\b/g) ?? []).toHaveLength(1);
  expect.soft(outline.match(/\bA\b/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
  expect.soft(outline).not.toMatch(/\bQ\b/);

  const svg = shape.ownerSVGElement;
  const root = svg?.parentElement;
  const content = root?.children.item(1);
  const actions = root?.children.item(2);
  expect(svg).toBeTruthy();
  expect(content).toBeTruthy();
  expect(actions).toBeTruthy();
  if (!svg || !content || !actions) {
    return;
  }
  const svgBounds = svg.getBoundingClientRect();
  const contentBounds = content.getBoundingClientRect();
  const actionsBounds = actions.getBoundingClientRect();
  const point = svg.createSVGPoint();
  const capsuleRadius = Math.min(svgBounds.width / 2, contentBounds.height / 2);
  const capsuleCornerProbe = capsuleRadius * 0.27;
  point.x = capsuleCornerProbe;
  point.y = capsuleCornerProbe;
  expect.soft(shape.isPointInFill(point)).toBe(false);
  point.x = capsuleRadius * 0.31;
  point.y = capsuleRadius * 0.31;
  expect.soft(shape.isPointInFill(point)).toBe(true);
  for (const direction of [-1, 1]) {
    point.x = direction < 0 ? capsuleRadius * 0.27 : svgBounds.width - capsuleRadius * 0.27;
    point.y = contentBounds.height - capsuleRadius * 0.27;
    expect.soft(shape.isPointInFill(point)).toBe(false);
    point.x = direction < 0 ? capsuleRadius * 0.31 : svgBounds.width - capsuleRadius * 0.31;
    point.y = contentBounds.height - capsuleRadius * 0.31;
    expect.soft(shape.isPointInFill(point)).toBe(true);
  }

  point.x = actionsBounds.right - svgBounds.left + 1;
  point.y = contentBounds.bottom - svgBounds.top + 2;
  expect.soft(shape.isPointInFill(point)).toBe(true);

  point.y = pointerAbove ? -4 : actionsBounds.bottom - svgBounds.top + 4;
  const samples = Array.from({ length: Math.ceil(svgBounds.width) }, (_, x) => {
    point.x = x;
    return shape.isPointInFill(point);
  });
  let runStart: number | null = null;
  let longestRun = 0;
  for (const [x, filled] of samples.entries()) {
    if (filled) {
      runStart ??= x;
      longestRun = Math.max(longestRun, x - runStart);
    } else {
      runStart = null;
    }
  }
  expect.soft(longestRun).toBeGreaterThanOrEqual(48);

  const actionsRadius = Math.min(24, actionsBounds.width / 2, actionsBounds.height);
  const pointerBaseHalfWidth = Math.min(40, actionsBounds.width / 2 - actionsRadius);
  point.y = pointerAbove ? -2 : actionsBounds.bottom - svgBounds.top + 2;
  for (const direction of [-1, 1]) {
    point.x = svgBounds.width / 2 + direction * (pointerBaseHalfWidth - 4.25);
    expect.soft(shape.isPointInFill(point)).toBe(true);
  }
}

export const Actions = meta.story({
  args: {
    children: <Text ta="center">Two players are preparing.</Text>,
    actions: calloutActions,
  },
  play: async ({ canvasElement }) => expectCalloutGeometry(canvasElement),
});

export const PointerAbove = meta.story({
  args: {
    children: <Text ta="center">Two players are preparing.</Text>,
    actions: calloutActions,
    pointer: [80, -160],
  },
  play: async ({ canvasElement }) => expectCalloutGeometry(canvasElement, true),
});
