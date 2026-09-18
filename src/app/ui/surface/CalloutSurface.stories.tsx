import { Button, Group, Text } from '@mantine/core';
import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { CalloutSurface } from './CalloutSurface';

const meta = preview.meta({ component: CalloutSurface });
export const Actions = meta.story({
  args: {
    children: <Text ta="center">Two players are preparing.</Text>,
    actions: (
      <Group justify="space-between">
        <Button variant="default">Cancel</Button>
        <Button>Ready</Button>
      </Group>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cancel = canvas.getByRole('button', { name: 'Cancel' });
    expect(cancel).toBeVisible();
    const [shape] = canvasElement.querySelectorAll('svg path');
    expect(shape).toBeTruthy();
    if (!(shape instanceof SVGPathElement)) {
      return;
    }
    const outline = shape?.getAttribute('d') ?? '';
    expect.soft(outline.match(/\bM\b/g) ?? []).toHaveLength(1);
    expect.soft(outline.match(/\bZ\b/g) ?? []).toHaveLength(1);

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
    point.x = actionsBounds.right - svgBounds.left + 1;
    point.y = contentBounds.bottom - svgBounds.top + 2;
    expect.soft(shape.isPointInFill(point)).toBe(true);

    point.y = actionsBounds.bottom - svgBounds.top + 4;
    const filled = Array.from({ length: Math.ceil(svgBounds.width) }, (_, x) => {
      point.x = x;
      return shape.isPointInFill(point) ? x : null;
    }).filter((x): x is number => x !== null);
    expect.soft((filled.at(-1) ?? 0) - (filled[0] ?? 0)).toBeGreaterThanOrEqual(80);

    const actionsRadius = Math.min(24, actionsBounds.width / 2, actionsBounds.height);
    const pointerBaseHalfWidth = Math.min(64, actionsBounds.width / 2 - actionsRadius);
    point.x = svgBounds.width / 2 + pointerBaseHalfWidth - 4.25;
    point.y = actionsBounds.bottom - svgBounds.top + 2;
    expect.soft(shape.isPointInFill(point)).toBe(true);
  },
});
