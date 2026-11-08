import { Text, UnstyledButton } from '@mantine/core';
import { useState } from 'react';

import { FactionTokenFace } from '../../routes/_app/play/multiplayer/FactionTokenFace';
import { CardGlyph, CardPreview, UnknownGlyph } from './CardArt';
import { DeckFooter } from './ColumnsTracker';
import { SeenStrip } from './SeenStrip';
import { chanceOfAny, copyOf, unplaced } from './tracker';
import type { CardCopy, TrackerState } from './tracker';
import { AddCard, SlotChip } from './TrackerParts';
import type { TrackerViewProps } from './TrackerParts';
import styles from './TreacheryTracker.module.css';

/** What a card can do in a battle plan, read from its subtitle: the questions Atreides asks before a battle. */
const THREATS = [
  {
    key: 'poison',
    label: 'Poison weapon',
    sample: 'gom-jabbar',
    test: (detail: string) => detail.startsWith('Weapon - Poison'),
  },
  {
    key: 'projectile',
    label: 'Projectile weapon',
    sample: 'crysknife',
    test: (detail: string, name: string) => detail.startsWith('Weapon - Projectile') || name === 'Weirding Way',
  },
  { key: 'lasgun', label: 'Lasgun', sample: 'lasgun', test: (_: string, name: string) => name === 'Lasgun' },
  {
    key: 'shield',
    label: 'Projectile defense',
    sample: 'shield',
    test: (detail: string) => detail.startsWith('Defense - Projectile'),
  },
  {
    key: 'snooper',
    label: 'Poison defense',
    sample: 'snooper',
    test: (detail: string) => detail.startsWith('Defense - Poison'),
  },
] as const;

const matches = (threat: (typeof THREATS)[number], copy: CardCopy) => threat.test(copy.def.detail, copy.def.name);

/**
 * Option D, Battle odds: a different reading of the same knowledge.
 * A row per faction and a column per thing that matters in a battle: the cards Atreides knows it holds, and for its unknown cards the chance that at least one of them is such a card.
 * Clicking a row opens its hand to change it.
 */
export function OddsTracker({ factions, state, onAction }: TrackerViewProps) {
  const [open, setOpen] = useState<string | null>(null);
  const pool = unplaced(state);
  const unknownTotal = Object.values(state.hands)
    .flat()
    .filter((slot) => slot.card === null).length;
  /* Every unknown card in a hand came from the cards not yet placed, and so did the deck. */
  const poolSize = pool.length;
  return (
    <div className={styles.view}>
      <SeenStrip factions={factions} state={state} onAction={onAction} size={22} />
      <div className={styles.odds} style={{ gridTemplateColumns: `30px repeat(${THREATS.length}, minmax(0, 1fr))` }}>
        <span />
        {THREATS.map((threat) => {
          const sample = state.copies.find((copy) => copy.def.key === threat.sample)!;
          return (
            <span key={threat.key} className={styles.oddsHead} title={threat.label}>
              <CardGlyph card={sample} size={20} corner />
              <span className={styles.oddsHeadLabel}>{threat.label}</span>
            </span>
          );
        })}
        {factions.map((faction) => {
          const slots = state.hands[faction.id] ?? [];
          const unknown = slots.filter((slot) => slot.card === null).length;
          const known = slots.filter((slot) => slot.card).map((slot) => copyOf(state, slot.card!));
          const expanded = open === faction.id;
          return (
            <div key={faction.id} className={styles.oddsRow} data-open={expanded ? 'true' : 'false'}>
              <UnstyledButton
                className={styles.oddsToken}
                aria-label={`${faction.name}: ${slots.length} cards`}
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : faction.id)}
              >
                <FactionTokenFace token={faction} size={26} />
                <span className={styles.oddsCount}>{slots.length}</span>
              </UnstyledButton>
              {THREATS.map((threat) => {
                const holds = known.filter((copy) => matches(threat, copy));
                const matching = pool.filter((copy) => matches(threat, copy)).length;
                const chance = chanceOfAny(poolSize, matching, unknown);
                return (
                  <span key={threat.key} className={styles.oddsCell} data-held={holds.length > 0 ? 'true' : 'false'}>
                    {holds.map((copy) => (
                      <CardPreview key={copy.id} card={copy}>
                        <span>
                          <CardGlyph card={copy} size={20} />
                        </span>
                      </CardPreview>
                    ))}
                    {unknown > 0 && chance > 0 && (
                      <span
                        className={styles.chance}
                        style={{ ['--chance' as string]: chance }}
                        title={chanceWords(chance, unknown, threat.label)}
                      >
                        {Math.round(chance * 100)}%
                      </span>
                    )}
                    {holds.length === 0 && (unknown === 0 || chance === 0) && <span className={styles.none}>–</span>}
                  </span>
                );
              })}
              {expanded && (
                <div className={styles.oddsHand} style={{ gridColumn: `1 / span ${THREATS.length + 1}` }}>
                  {slots.map((slot) => {
                    const copy = slot.card ? copyOf(state, slot.card) : null;
                    return (
                      <SlotChip
                        key={slot.id}
                        faction={faction.id}
                        slot={slot}
                        factions={factions}
                        state={state}
                        onAction={onAction}
                      >
                        {copy ? <CardGlyph card={copy} size={24} /> : <UnknownGlyph size={24} />}
                      </SlotChip>
                    );
                  })}
                  <AddCard faction={faction} state={state} onAction={onAction} />
                  <Text size="xs" className={styles.dim}>
                    {handWords(state, known, unknown)}
                  </Text>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Text size="xs" className={styles.dim}>
        % is the chance that at least one of a faction's {unknownTotal > 0 ? 'unknown cards' : 'cards'} is such a card,
        from the {poolSize} cards you have not placed.
      </Text>
      <DeckFooter factions={factions} state={state} onAction={onAction} deckSize={poolSize} />
    </div>
  );
}

function chanceWords(chance: number, unknown: number, label: string) {
  return `${Math.round(chance * 100)}% that at least one of ${unknown} unknown ${unknown === 1 ? 'card is a' : 'cards is a'} ${label.toLowerCase()}`;
}

function handWords(_: TrackerState, known: readonly CardCopy[], unknown: number) {
  const parts = [known.length > 0 ? `${known.length} known` : null, unknown > 0 ? `${unknown} unknown` : null].filter(
    Boolean
  );
  return parts.join(', ');
}
