// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { useForm } from '@tanstack/react-form';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appContentTheme } from '@app/theme';
import { defaultFaction } from '@data/defaultFaction';

import { FactionFormFields, type FactionFormFieldsHandle } from './FactionFormFields';
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

const warningFixtures = [
  {
    path: 'troops[0].back.name',
    chapter: 'forces' as const,
    label: 'Troop back needs a name',
    targetId: 'troop-0-back-name',
  },
  {
    path: 'planet[0].name',
    chapter: 'worlds' as const,
    label: 'World needs a name',
    targetId: 'planet-0-name',
  },
];

function Harness() {
  const form = useForm({ defaultValues: structuredClone(defaultFaction) });
  const fieldsRef = useRef<FactionFormFieldsHandle>(null);
  return (
    <>
      <button type="button" onClick={() => fieldsRef.current?.focusWarning(warningFixtures[0])}>
        Focus first warning
      </button>
      <FactionFormFields
        ref={fieldsRef}
        form={form as unknown as FactionFormApi}
        warnings={warningFixtures}
      />
    </>
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

function buttonWithLabel(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Missing button: ${label}`);
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
      matches: false,
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
      window.setTimeout(() => callback(0), 0);
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

describe('FactionFormFields responsive workbench', () => {
  it('mounts one active chapter while keeping both responsive navigation interfaces available', async () => {
    await renderFields();

    expect(container?.querySelectorAll('[data-mobile-section]')).toHaveLength(2);
    expect(container?.querySelector('[data-mobile-section="identity"]')).not.toBeNull();
    expect(container?.querySelector('[data-mobile-section="background"]')).not.toBeNull();
    expect(container?.querySelector('[role="tablist"]')).not.toBeNull();
    expect(container?.querySelector('[data-connected-tabs-mobile-picker]')).not.toBeNull();
  });

  it('navigates compact chapters and focuses warning targets in the active panel', async () => {
    await renderFields();

    for (let step = 0; step < 5; step += 1) {
      await act(async () => buttonWithLabel('Next section').click());
    }

    expect(container?.querySelector('[data-mobile-section="forces"]')).not.toBeNull();
    await act(async () => {
      buttonWithText('Troop back needs a name').click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(document.activeElement?.id).toBe('troop-0-back-name');

    await act(async () => buttonWithLabel('Previous section').click());
    expect(container?.querySelector('[data-mobile-section="worlds"]')).not.toBeNull();
    await act(async () => {
      buttonWithText('World needs a name').click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(document.activeElement?.id).toBe('planet-0-name');
  });

  it('selects an inactive warning chapter before focusing through its imperative handle', async () => {
    await renderFields();

    await act(async () => {
      buttonWithText('Focus first warning').click();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(container?.querySelector('[data-mobile-section="forces"]')).not.toBeNull();
    expect(document.activeElement?.id).toBe('troop-0-back-name');
  });

  it('keeps the adjacent artifact proof mounted for container-driven presentation', async () => {
    await renderFields();

    expect(container?.textContent).toContain('Artifact workbench');
    expect(
      container?.querySelector('section[aria-label="Background composite live preview"]')
    ).not.toBeNull();
  });
});
