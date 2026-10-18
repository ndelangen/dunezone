import { Group, Radio, Stack, Switch, Text } from '@mantine/core';
import type { BoardTint } from '@shared/boards/markup';
import { TABLE_PHASES } from '@shared/play/phases';
import { Section } from '@ui/block/Section';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Dices, Images, Map, X } from 'lucide-react';
import { useReducer, useState } from 'react';

import styles from './ProductTerms.module.css';
import { PRODUCT_TERMS, productTermMatches } from './productVocabulary';
import { TintBoard } from './TintBoard';

function GameStages() {
  return (
    <figure className={styles.figure} aria-label="Game stages and the phases inside play">
      <ol className={styles.stages}>
        {[
          ['Drafting', 'Choose factions'],
          ['Swapping', 'Trade factions'],
          ['Setup', 'Prepare the table'],
          ['Play', 'Repeat turns and phases'],
          ['Finished', 'Record the result'],
        ].map(([name, detail]) => (
          <li key={name} data-play={name === 'Play' || undefined}>
            <Text fw={700}>{name}</Text>
            <Text size="sm" c="dimmed">
              {detail}
            </Text>
          </li>
        ))}
      </ol>
      <div className={styles.phases}>
        <Text size="sm" fw={700}>
          Inside Play, each turn repeats these phases
        </Text>
        <ol className={styles.phaseList}>
          {TABLE_PHASES.map((phase) => (
            <li key={phase.id}>{phase.label}</li>
          ))}
        </ol>
        <Text size="sm" c="dimmed">
          After Mentat Pause, the next turn starts at Storm. Factions can add extra phases.
        </Text>
      </div>
      <figcaption className={styles.discarded}>
        <X size={18} aria-hidden />
        <Text size="sm">
          <strong>Discarded</strong> is a separate outcome when the last player leaves.
        </Text>
      </figcaption>
    </figure>
  );
}

type TintDraft = { territory: 'strongholds' | 'spice'; outline: boolean; stickers: boolean };
type TintEvent =
  | { type: 'territory'; value: TintDraft['territory'] }
  | { type: 'outline'; value: boolean }
  | { type: 'stickers'; value: boolean };
const INITIAL_TINT: TintDraft = { territory: 'strongholds', outline: false, stickers: false };
function tintReducer(state: TintDraft, event: TintEvent): TintDraft {
  switch (event.type) {
    case 'territory':
      return { ...state, territory: event.value };
    case 'outline':
      return { ...state, outline: event.value };
    case 'stickers':
      return { ...state, stickers: event.value };
  }
}

function TintDemo() {
  const [draft, dispatch] = useReducer(tintReducer, INITIAL_TINT);
  const strongholds = draft.territory === 'strongholds';
  const tint: BoardTint = {
    id: 'lesson',
    name: strongholds ? 'Strongholds' : 'Spice blow',
    color: '#2f7fe0',
    territories: strongholds
      ? ['arrakeen', 'carthag', 'tabr', 'habbanya', 'tueks']
      : ['the-great-flat', 'funeral-plain', 'habbanya-erg'],
    ...(draft.outline ? { outline: true } : {}),
    ...(draft.stickers ? { stamps: [strongholds ? 'city' : 'spice'] } : {}),
  };
  return (
    <Section title="Build a tint" description="Choose territories, outlines and stickers to see the board change.">
      <Radio.Group
        label="Territories to tint"
        value={draft.territory}
        onChange={(value) => dispatch({ type: 'territory', value: value as TintDraft['territory'] })}
      >
        <Group mt="xs">
          <Radio value="strongholds" label="Strongholds" />
          <Radio value="spice" label="Spice blow" />
        </Group>
      </Radio.Group>
      <Group>
        <Switch
          label="Outline only"
          checked={draft.outline}
          onChange={(event) => dispatch({ type: 'outline', value: event.currentTarget.checked })}
        />
        <Switch
          label="Add stickers"
          checked={draft.stickers}
          onChange={(event) => dispatch({ type: 'stickers', value: event.currentTarget.checked })}
        />
      </Group>
      <div className={styles.board}>
        <TintBoard tints={[tint]} />
      </div>
      <Text role="status">
        {tint.name}: {tint.territories.length} territories, {draft.outline ? 'outline only' : 'filled'},{' '}
        {draft.stickers ? 'with stickers' : 'without stickers'}.
      </Text>
    </Section>
  );
}

export function ProductTerms({ query = '' }: { query?: string }) {
  const [selected, setTopic] = useState('board');
  const terms = PRODUCT_TERMS.filter((term) => productTermMatches(term, query));
  const topics = [
    { value: 'board', label: 'Boards and tints', icon: <Map /> },
    { value: 'play', label: 'Play', icon: <Dices /> },
    { value: 'artwork', label: 'Artwork', icon: <Images /> },
  ].filter((item) => terms.some((term) => term.topic === item.value));
  const topic = topics.some((item) => item.value === selected) ? selected : topics[0]?.value;
  if (!topic) {
    return null;
  }
  return (
    <Section id="product-terms" title="Dune Zone product terms">
      <ConnectedTabs
        stickyRail
        value={topic}
        onValueChange={setTopic}
        ariaLabel="Product glossary topics"
        items={topics.map((item) => ({
          ...item,
          panel:
            item.value === topic ? (
              <Stack gap="xl">
                {topic === 'board' ? <TintDemo /> : null}
                {terms
                  .filter((term) => term.topic === topic)
                  .map((term) => (
                    <Section key={term.id} id={term.id} title={term.term}>
                      <Text>{term.explanation}</Text>
                      {term.id === 'stage' ? <GameStages /> : null}
                    </Section>
                  ))}
              </Stack>
            ) : null,
        }))}
      />
    </Section>
  );
}
