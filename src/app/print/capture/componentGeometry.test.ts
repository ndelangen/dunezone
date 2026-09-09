// @vitest-environment jsdom

import { COMPONENT_GEOMETRY_PROTOCOL } from '@shared/asset-publishing/componentGeometry';
import { describe, expect, it } from 'vitest';

import { measureComponentGeometry } from './componentGeometry';

function bounds(x: number, y: number, width: number, height: number): DOMRect {
  return { x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON: () => ({}) };
}

function componentFrame(scale: number) {
  const frame = document.createElement('div');
  frame.getBoundingClientRect = () => bounds(20, 30, 300 * scale, 300 * scale);
  function part(key: string, rect: DOMRect) {
    const element = document.createElement('div');
    element.setAttribute(COMPONENT_GEOMETRY_PROTOCOL.partAttribute, key);
    element.getBoundingClientRect = () => rect;
    frame.append(element);
  }
  return { frame, part };
}

describe('component capture geometry', () => {
  it('keeps named targets in the same relative place at different capture sizes', () => {
    const results = [1, 2].map((scale) => {
      const { frame, part } = componentFrame(scale);
      part('portrait', bounds(20 + 30 * scale, 30 + 15 * scale, 210 * scale, 225 * scale));
      return measureComponentGeometry(frame);
    });
    expect(results[0]?.parts).toEqual(results[1]?.parts);
    expect(results[1]).toEqual({
      width: 600,
      height: 600,
      parts: [{ key: 'portrait', x: 0.1, y: 0.05, width: 0.7, height: 0.75 }],
    });
  });

  it('clips a target to the delivered image and omits parts with no visible bounds', () => {
    const { frame, part } = componentFrame(1);
    part('name', bounds(5, 285, 330, 60));
    part('strength', bounds(120, 130, 0, 0));
    expect(measureComponentGeometry(frame).parts).toEqual([{ key: 'name', x: 0, y: 0.85, width: 1, height: 0.15 }]);
  });

  it('rejects repeated semantic targets instead of publishing an ambiguous image mapping', () => {
    const { frame, part } = componentFrame(1);
    part('portrait', bounds(50, 60, 100, 100));
    part('portrait', bounds(170, 60, 100, 100));
    expect(() => measureComponentGeometry(frame)).toThrow('Component part is repeated');
  });
});
