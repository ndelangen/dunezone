import { useState } from 'react';

import type { FactionToken } from '@app/widgets/faction-token/FactionTokenFace';
import { FACTIONS } from '@app/widgets/treachery-tracker/tracker.stories.fixture';

import { FactionSearchList } from './FactionSearchList';
import type { SetupDeck } from './StandaloneTracker';
import { TrackerSetup } from './StandaloneTracker';
import type { FactionSearch, TrackerConfig } from './TrackerConfig';

export const RULESETS = [
  { id: 'dreamrules', name: 'Dreamrules' },
  { id: 'classic', name: 'Classic' },
];

/* Every faction the story's search knows: the table's six, and two more without a published token yet. */
const MORE_FACTIONS: readonly FactionToken[] = [
  ...FACTIONS,
  { id: 'ixians', name: 'Ixians' },
  { id: 'tleilaxu', name: 'Tleilaxu' },
];

/* The search the page hands the setup, over the story's factions instead of the catalogue. */
const StorySearch: FactionSearch = ({ seated, onPick }) => {
  const [query, setQuery] = useState('');
  return (
    <FactionSearchList
      query={query}
      onQuery={setQuery}
      factions={MORE_FACTIONS.filter((faction) => faction.name.toLowerCase().includes(query.trim().toLowerCase()))}
      seated={seated}
      status="done"
      onMore={() => {}}
      onPick={onPick}
    />
  );
};

export function StorySetup({
  deck,
  loading,
  onStart = () => {},
}: Readonly<{ deck: SetupDeck; loading?: boolean; onStart?: () => void }>) {
  const [config, setConfig] = useState<TrackerConfig>({ ruleset: 'dreamrules', seats: FACTIONS });
  const [query, setQuery] = useState('');
  return (
    <TrackerSetup
      rulesets={RULESETS.filter(
        (ruleset) => ruleset.id === config.ruleset || ruleset.name.toLowerCase().includes(query.trim().toLowerCase())
      )}
      onRulesetSearch={setQuery}
      deck={deck}
      config={loading ? { ...config, seats: undefined } : config}
      onChange={setConfig}
      onStart={onStart}
      search={StorySearch}
    />
  );
}
