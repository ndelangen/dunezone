// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { Region } from '@ui/layout/Region';
import { Card } from '@ui/surface/Card';
import { appContentTheme } from '@ui/theme';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { Section } from './Section';

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

afterEach(cleanup);

function renderInTheme(ui: React.ReactNode) {
  return render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      {ui}
    </MantineProvider>
  );
}

describe('Section outside a heading slot', () => {
  test('warns, because nothing then owns the heading and its content together', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderInTheme(<Section title="Stewardship" />);

    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  test('stays quiet in a card header', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    renderInTheme(<Card header={<Section title="Stewardship" />}>body</Card>);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('Region', () => {
  test('names its landmark after the heading it was given', () => {
    renderInTheme(<Region heading={<Section title="Included factions" />}>content</Region>);

    expect(screen.getByRole('region', { name: 'Included factions' })).toBeTruthy();
  });
});
