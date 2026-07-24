// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { useForm } from '@tanstack/react-form';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appContentTheme } from '@app/theme';
import { defaultFaction } from '@data/defaultFaction';

import { FactionFormFields } from './FactionFormFields';
import type { FactionFormApi } from './factionFormTypes';

vi.mock('./FactionFormSectionIdentity', () => ({
  FactionFormSectionIdentity: () => <div data-mobile-section="identity" />,
}));
vi.mock('./FactionFormSectionBackground', () => ({
  FactionFormSectionBackground: () => <div data-mobile-section="background" />,
}));
vi.mock('./FactionFormSectionHero', () => ({
  FactionFormSectionHero: () => <div data-mobile-section="hero" />,
}));
vi.mock('./FactionFormSectionLeaders', () => ({
  FactionFormSectionLeaders: () => <div data-mobile-section="leaders" />,
}));
vi.mock('./FactionFormSectionAlliance', () => ({
  FactionFormSectionAlliance: () => <div data-mobile-section="alliance" />,
}));
vi.mock('./FactionFormSectionPlanets', () => ({
  FactionFormSectionPlanets: () => (
    <div data-mobile-section="worlds">
      <input id="planet-0-name" aria-label="Planet name" />
    </div>
  ),
}));
vi.mock('./FactionFormSectionTroops', () => ({
  FactionFormSectionTroops: () => (
    <div data-mobile-section="forces">
      <input id="troop-0-back-name" aria-label="Troop back name" />
    </div>
  ),
}));
vi.mock('./FactionFormSectionRules', () => ({
  FactionFormSectionRules: () => <div data-mobile-section="rules" />,
}));
vi.mock('./FactionFormSectionAdvantages', () => ({
  FactionFormSectionAdvantages: () => <div data-mobile-section="advantages" />,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement | undefined;
let root: Root | undefined;

function Harness() {
  const form = useForm({ defaultValues: structuredClone(defaultFaction) });
  return (
    <FactionFormFields
      form={form as unknown as FactionFormApi}
      warnings={[
        {
          path: 'troops[0].back.name',
          chapter: 'forces',
          label: 'Troop back needs a name',
          targetId: 'troop-0-back-name',
        },
        {
          path: 'planet[0].name',
          chapter: 'worlds',
          label: 'World needs a name',
          targetId: 'planet-0-name',
        },
      ]}
    />
  );
}

async function renderFields() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MantineProvider theme={appContentTheme} forceColorScheme="light">
        <Harness />
      </MantineProvider>
    );
  });
}

function buttonWithText(text: string) {
  const button = [...(container?.querySelectorAll('button') ?? [])].find(
    (candidate) => candidate.textContent?.trim() === text
  );
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 48em)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn().mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    })
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

describe('FactionFormFields mobile document', () => {
  it('renders every editor section in one preview-free vertical document', async () => {
    await renderFields();

    expect(container?.querySelectorAll('section')).toHaveLength(8);
    expect(container?.querySelectorAll('[data-mobile-section]')).toHaveLength(9);
    expect(container?.querySelector('[role="tablist"]')).toBeNull();
    expect(container?.textContent).not.toContain('Artifact workbench');
  });

  it('focuses warning targets without switching or unmounting chapters', async () => {
    await renderFields();

    await act(async () => buttonWithText('Troop back needs a name').click());
    expect(document.activeElement?.id).toBe('troop-0-back-name');

    await act(async () => buttonWithText('World needs a name').click());
    expect(document.activeElement?.id).toBe('planet-0-name');
  });
});

describe('FactionFormFields tablet workbench', () => {
  beforeEach(() => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it('keeps the tabbed editor and adjacent artifact proof mounted above the mobile breakpoint', async () => {
    await renderFields();

    expect(container?.querySelector('[role="tablist"]')).not.toBeNull();
    expect(container?.textContent).toContain('Artifact workbench');
    expect(container?.querySelector('section')).toBeNull();
  });
});
