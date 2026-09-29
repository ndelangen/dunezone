import { Group } from '@mantine/core';
import preview from '@sb/preview';
import type { ReactNode } from 'react';
import { expect } from 'storybook/test';

import { SurfaceFiller } from './SurfaceFiller.stories.fixture';
import { Toolbar } from './Toolbar';

/* Control-shaped stand-ins. A toolbar does not care what its controls are, only where they go. */
const control = <SurfaceFiller height={36} width={36} />;
const wideControl = <SurfaceFiller height={36} width={120} />;

const meta = preview.meta({
  component: Toolbar,
  parameters: { layout: 'padded' },
});

/** All three positions: what leads, what labels, what acts. */
export const Default = meta.story({
  args: {
    children: [
      <Toolbar.Left key="left">{control}</Toolbar.Left>,
      <Toolbar.Center key="center">{wideControl}</Toolbar.Center>,
      <Toolbar.Right key="right">
        {control}
        {control}
      </Toolbar.Right>,
    ],
  },
});

/** The common shape: navigation on one edge, actions on the other, nothing between. */
export const LeftAndRight = meta.story({
  args: {
    children: [
      <Toolbar.Left key="left">{control}</Toolbar.Left>,
      <Toolbar.Right key="right">{wideControl}</Toolbar.Right>,
    ],
  },
});

/** Centre alone stays centred, because the empty edges still claim their share. */
export const CenterOnly = meta.story({
  args: {
    children: [<Toolbar.Center key="center">{wideControl}</Toolbar.Center>],
  },
});

/** A single edge, for a page whose toolbar only goes back. */
export const LeftOnly = meta.story({
  args: {
    children: [<Toolbar.Left key="left">{control}</Toolbar.Left>],
  },
});

/** A crowded edge keeps its controls on one line and lets the band grow instead. */
export const ManyControls = meta.story({
  args: {
    children: [
      <Toolbar.Left key="left">
        {control}
        {control}
      </Toolbar.Left>,
      <Toolbar.Right key="right">
        {control}
        {control}
        {control}
        {wideControl}
      </Toolbar.Right>,
    ],
  },
});

/* A band narrower than its edges' controls, so the stories below can show which part gives way. */
const NARROW_WIDTH = 320;

const narrow = (Story: () => ReactNode) => (
  <div data-narrow-frame style={{ width: NARROW_WIDTH }}>
    <Story />
  </div>
);

/* Each edge asks its controls to wrap, as a page with a long row of actions does. */
const wrappingEdges = [
  <Toolbar.Left key="left">
    <Group gap="xs" wrap="wrap">
      {wideControl}
      {control}
      {control}
    </Group>
  </Toolbar.Left>,
  <Toolbar.Right key="right">
    <Group gap="xs" wrap="wrap">
      {control}
      {control}
      {wideControl}
    </Group>
  </Toolbar.Right>,
];

function controlRows(canvasElement: HTMLElement) {
  const controls = [...canvasElement.querySelectorAll<HTMLElement>('[data-narrow-frame] [aria-hidden]')];
  return new Set(controls.map((element) => Math.round(element.getBoundingClientRect().top))).size;
}

function rightmostControlEdge(canvasElement: HTMLElement) {
  const controls = [...canvasElement.querySelectorAll<HTMLElement>('[data-narrow-frame] [aria-hidden]')];
  return Math.max(...controls.map((element) => element.getBoundingClientRect().right));
}

function frameRight(canvasElement: HTMLElement) {
  const frame = canvasElement.querySelector<HTMLElement>('[data-narrow-frame]');
  expect(frame).not.toBeNull();
  return (frame as HTMLElement).getBoundingClientRect().right;
}

/** By default the edges hold their width, so a wrapping row inside one stays on one line even when the band is too narrow for it. */
export const EdgesHoldWhenNarrow = meta.story({
  decorators: [narrow],
  args: { children: wrappingEdges },
  play: async ({ canvasElement }) => {
    await expect(controlRows(canvasElement)).toBe(1);
    await expect(rightmostControlEdge(canvasElement)).toBeGreaterThan(frameRight(canvasElement));
  },
});

/** `edges="shrink"` lets the edges give way, so the rows inside them wrap and every control stays inside the band. */
export const ShrinkingEdgesWrap = meta.story({
  decorators: [narrow],
  args: { edges: 'shrink', children: wrappingEdges },
  play: async ({ canvasElement }) => {
    await expect(controlRows(canvasElement)).toBeGreaterThan(1);
    await expect(rightmostControlEdge(canvasElement)).toBeLessThanOrEqual(frameRight(canvasElement));
  },
});
