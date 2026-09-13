import { Select } from '@mantine/core';
import { useNavigate, useSearch } from '@tanstack/react-router';

import { LOG_SCENARIOS, isLogScenario } from './play';

/* Prototype controls for the simplified Log tab; the URL owns the displayed fixture. */
export function LogSwitcher() {
  const search = useSearch({ from: '/_app/play/demo' });
  const navigate = useNavigate();
  return (
    <div className="dpl-log-switcher" aria-label="Log prototype controls">
      <strong>D</strong>
      <span>Log tab</span>
      <Select
        aria-label="Log scenario"
        w={130}
        size="xs"
        value={isLogScenario(search.scenario) ? search.scenario : 'log-latest'}
        data={LOG_SCENARIOS.map((value) => ({ value, label: value.slice(4) }))}
        onChange={(value) => {
          if (isLogScenario(value)) {
            void navigate({ to: '/play/demo', search: { ...search, scenario: value } });
          }
        }}
      />
    </div>
  );
}
