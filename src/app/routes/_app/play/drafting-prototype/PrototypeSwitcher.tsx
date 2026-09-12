/* PROTOTYPE (#1142, #1145, #1146): floating variant switcher with a scenario strip; dev builds only. */
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';

import { DRAFT_VARIANTS, SCENARIO_NAMES, SCENARIOS } from './fixture';
import type { DraftVariant } from './fixture';
import type { PrototypeScenario } from './setup';

export function PrototypeSwitcher({
  current,
  name,
  scenario,
  scenarios = SCENARIOS,
  scenarioNames = SCENARIO_NAMES,
}: Readonly<{
  current: DraftVariant;
  name: string;
  scenario?: PrototypeScenario;
  scenarios?: readonly PrototypeScenario[];
  scenarioNames?: Partial<Record<PrototypeScenario, string>>;
}>) {
  const navigate = useNavigate();
  const search = useSearch({ from: '/_app/play/demo' });
  const index = DRAFT_VARIANTS.indexOf(current);
  const go = (delta: number) => {
    const next = DRAFT_VARIANTS[(index + delta + DRAFT_VARIANTS.length) % DRAFT_VARIANTS.length];
    void navigate({ to: '/play/demo', search: { ...search, variant: next } });
  };
  const goScenario = (next: PrototypeScenario) => {
    void navigate({ to: '/play/demo', search: { ...search, scenario: next } });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        go(-1);
      } else if (event.key === 'ArrowRight') {
        go(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!import.meta.env.DEV) {
    return null;
  }
  return (
    <>
      <div className="dp-switcher" role="group" aria-label="Prototype variant">
        <button type="button" onClick={() => go(-1)} aria-label="Previous variant">
          ←
        </button>
        <span>
          <strong>{current}</strong> — {name}
        </span>
        <button type="button" onClick={() => go(1)} aria-label="Next variant">
          →
        </button>
      </div>
      {scenario ? (
        <div className="dp-switcher dp-switcher--scenarios" role="group" aria-label="Fixture scenario">
          {scenarios.map((candidate) => (
            <button key={candidate} type="button" aria-pressed={candidate === scenario} title={scenarioNames[candidate]} onClick={() => goScenario(candidate)}>
              {candidate}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
