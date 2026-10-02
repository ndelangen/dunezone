// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appContentTheme } from '../theme';
import { Section } from './Section';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(description?: string) {
  act(() =>
    root.render(
      <MantineProvider theme={appContentTheme}>
        <Section helpOnly title="Faction bank" description={description}>
          <p>Content</p>
        </Section>
      </MantineProvider>
    )
  );
  return container.querySelector<HTMLButtonElement>('button[aria-label="Help: Faction bank"]')!;
}

describe('Section help', () => {
  it('describes the help button with the guidance its tooltip shows', () => {
    const help = render('Only you see this balance.');
    const describedBy = help.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe('Only you see this balance.');
  });

  it('describes nothing when there is no guidance', () => {
    expect(render().hasAttribute('aria-describedby')).toBe(false);
  });
});
