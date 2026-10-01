/* Throwaway for #1615: compact troop layouts, selected by ?variant=A|B|C. */
import { ActionIcon, Group, Select, Stack, Text, Tooltip } from '@mantine/core';
import { troopCombatFaces } from '@shared/factions/troopCombat';
import { Section } from '@ui/block/Section';
import { FormattedTextSource } from '@ui/content/FormattedText';
import { TopicIcon } from '@ui/content/TopicIcon';
import { Surface } from '@ui/surface';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Fragment, useEffect } from 'react';
import type { ReactNode } from 'react';

import type { FactionData } from '@db/factions';
import { TroopToken } from '@game/assets/faction/troop/Troop';

import styles from './troops.prototype.module.css';

type Troop = FactionData['troops'][number];
type Face = ReturnType<typeof troopCombatFaces<NonNullable<Troop['back']>>>[number];
type Props = { data: FactionData; troops: Troop[] };
export type TroopVariant = 'A' | 'B' | 'C';
export type TroopScenario = 'saved' | 'sample';
const variants: TroopVariant[] = ['A', 'B', 'C'];
const names = { A: 'Compact cards', B: 'Token strip', C: 'Compact comparison' };

export function prototypeTroops(saved: Troop[], scenario: TroopScenario): Troop[] {
  if (scenario === 'saved' || !saved[0]) return saved;
  const art = saved[0];
  return [
    {
      ...art,
      name: 'Soldiers',
      count: 15,
      description: 'The main fighting force.',
      capable: true,
      combat: { strength: 0.5, fundedStrength: 1, fundingCost: 1 },
      back: {
        image: art.image,
        name: 'Advisors',
        description: 'The reverse side supports the faction without joining battles.',
        striped: true,
        capable: false,
      },
    },
    {
      ...art,
      name: 'Veterans',
      count: 5,
      description: 'A smaller force with a stronger dial.',
      capable: true,
      back: undefined,
      combat: { strength: 1, fundedStrength: 2, fundingCost: 2 },
    },
    {
      ...art,
      name: 'Recruits',
      count: 8,
      description: 'Combat values have not been entered yet.',
      capable: true,
      combat: undefined,
      back: undefined,
    },
  ];
}

function Hint({ label, children, name }: { label: ReactNode; children: ReactNode; name?: string }) {
  return (
    <Tooltip label={label} multiline maw={260} withArrow events={{ hover: true, focus: true, touch: true }}>
      <span className={styles.hint} tabIndex={0} aria-label={name ?? (typeof label === 'string' ? label : undefined)}>
        {children}
      </span>
    </Tooltip>
  );
}

function Art({ data, face }: { data: FactionData; face: Face }) {
  return (
    <Hint
      name={`${face.face.name}${face.side === 'back' ? ', reverse side' : ''}`}
      label={
        <Stack gap={4}>
          <Text size="sm" fw={700}>
            {face.face.name}
            {face.side === 'back' ? ' · Reverse side' : ''}
          </Text>
          {face.face.description ? <FormattedTextSource source={face.face.description} size="sm" /> : null}
        </Stack>
      }
    >
      <span className={styles.token}>
        <TroopToken
          background={data.background}
          image={face.face.image}
          hue={face.face.hue}
          star={face.face.star}
          striped={face.face.striped}
        />
      </span>
    </Hint>
  );
}

function Eligibility({ face }: { face: Face }) {
  if (face.capable) return null;
  return (
    <Hint label="Cannot participate in combat">
      <TopicIcon topic="noncombatant" size={15} />
    </Hint>
  );
}

function Values({ face }: { face: Face }) {
  if (!face.capable) return null;
  if (!face.combat)
    return (
      <Hint label="Combat strengths have not been set. This side is unavailable in battle plans.">
        <Text component="span" c="var(--color-caution)" style={{ display: 'inline-flex' }}>
          <TopicIcon topic="combatUnknown" size={16} />
        </Text>
      </Hint>
    );
  return (
    <>
      <Hint label={`Strength per troop: ${face.combat.strength} undialed | ${face.combat.fundedStrength} dialed`}>
        <TopicIcon topic="strength" size={15} />
        <b>
          {face.combat.strength} <span aria-hidden>|</span> {face.combat.fundedStrength}
        </b>
      </Hint>
      <Hint label={`Funding cost: ${face.combat.fundingCost} spice per dialed troop`}>
        <TopicIcon topic="spice" size={15} />
        <b>{face.combat.fundingCost}</b>
      </Hint>
    </>
  );
}

function Count({ count }: { count: number }) {
  return (
    <Hint label={`${count} troop tokens`}>
      <Text size="xs" c="dimmed">
        ×{count}
      </Text>
    </Hint>
  );
}

function PairedFaces({ data, troop }: { data: FactionData; troop: Troop }) {
  const faces = troopCombatFaces([troop]);
  return (
    <div className={troop.back ? styles.pairedFaces : styles.singleFace}>
      {faces.map((face, index) => (
        <Fragment key={face.id}>
          {index > 0 ? (
            <div className={styles.flipDivider}>
              <Hint label={`Flip side: ${face.face.name}`}>
                <TopicIcon topic="flip" size={16} />
              </Hint>
            </div>
          ) : null}
          <div className={styles.cardFace}>
            {face.side === 'front' ? <Count count={troop.count} /> : null}
            <Art data={data} face={face} />
            <div className={styles.faceContent}>
              <Group gap={6} wrap="nowrap">
                <Text size="sm" fw={700} lh={1.2}>
                  {face.face.name}
                </Text>
              </Group>
              <Group gap={6} wrap="nowrap">
                <Eligibility face={face} />
                <Values face={face} />
              </Group>
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

export function VariantA({ data, troops }: Props) {
  return (
    <div className={styles.cards}>
      {troops.map((troop, i) => (
        <Surface
          as="article"
          aria-label={troop.name}
          padding="sm"
          className={troop.back ? styles.doubleCard : styles.singleCard}
          key={i}
        >
          <PairedFaces data={data} troop={troop} />
        </Surface>
      ))}
    </div>
  );
}

export function VariantB({ data, troops }: Props) {
  return (
    <Surface padding="sm">
      <div className={styles.strip}>
        {troops.map((troop, i) => (
          <div className={styles.stripTroop} key={i}>
            <PairedFaces data={data} troop={troop} />
          </div>
        ))}
      </div>
    </Surface>
  );
}

export function VariantC({ data, troops }: Props) {
  return (
    <Surface padding="sm">
      <div className={styles.comparison}>
        {troops.map((troop, i) => (
          <div className={styles.comparisonRow} key={i}>
            <PairedFaces data={data} troop={troop} />
          </div>
        ))}
      </div>
    </Surface>
  );
}

export function TroopPrototype({ variant, ...props }: Props & { variant: TroopVariant }) {
  return (
    <Section title="Troops" icon={<TopicIcon topic="troops" size={20} />}>
      {variant === 'A' ? <VariantA {...props} /> : variant === 'B' ? <VariantB {...props} /> : <VariantC {...props} />}
    </Section>
  );
}

export function PrototypeSwitcher({
  variant,
  scenario,
  troops,
  onVariant,
  onScenario,
}: {
  variant: TroopVariant;
  scenario: TroopScenario;
  troops: Troop[];
  onVariant: (v: TroopVariant) => void;
  onScenario: (v: TroopScenario) => void;
}) {
  const cycle = (step: number) => onVariant(variants[(variants.indexOf(variant) + step + 3) % 3]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, select, [contenteditable], [role="combobox"], [role="slider"]')
      )
        return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        cycle(event.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!import.meta.env.DEV) return null;
  return (
    <div className={styles.switcher}>
      <Surface padding="sm">
        <Stack gap={4}>
          <Group gap="sm" justify="center">
            <ActionIcon aria-label="Previous variant" variant="default" onClick={() => cycle(-1)}>
              <ArrowLeft size={18} />
            </ActionIcon>
            <Text fw={700} size="sm" aria-live="polite">
              {variant} · {names[variant]}
            </Text>
            <ActionIcon aria-label="Next variant" variant="default" onClick={() => cycle(1)}>
              <ArrowRight size={18} />
            </ActionIcon>
            <Select
              aria-label="Troop preview data"
              w={150}
              size="xs"
              value={scenario}
              allowDeselect={false}
              onChange={(v) => onScenario(v as TroopScenario)}
              data={[
                { value: 'saved', label: 'Saved troops' },
                { value: 'sample', label: 'Sample cases' },
              ]}
            />
          </Group>
          <Text size="xs" ta="center" c="dimmed">
            Prototype · {scenario === 'sample' ? 'Sample troop values only' : 'Saved troop values'} · {troops.length}{' '}
            types · {troopCombatFaces(troops).length} faces
          </Text>
        </Stack>
      </Surface>
    </div>
  );
}
