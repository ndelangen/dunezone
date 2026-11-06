/** @vitest-environment jsdom */
import { afterEach, describe, expect, test } from 'vite-plus/test';

import { focusTable } from './focusTable';

afterEach(() => {
  document.body.replaceChildren();
});

function field() {
  const input = document.createElement('textarea');
  document.body.append(input);
  input.focus();
  return input;
}

describe('focusTable', () => {
  test('the scene takes the focus where a table is shown', () => {
    const scene = document.createElement('div');
    scene.tabIndex = -1;
    scene.setAttribute('data-table-focus', '');
    document.body.append(scene);
    field();
    focusTable();
    expect(document.activeElement).toBe(scene);
  });

  test('without a table, whatever had the focus lets go', () => {
    const input = field();
    focusTable();
    expect(document.activeElement).not.toBe(input);
  });
});
