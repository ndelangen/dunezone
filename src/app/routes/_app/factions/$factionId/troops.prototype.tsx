/* Throwaway for #1615: compact troop layouts, selected by ?variant=A|B|C. */
import { ActionIcon, Group, Select, Stack, Text, Tooltip } from '@mantine/core';
import { troopCombatFaces } from '@shared/factions/troopCombat';
import { Section } from '@ui/block/Section';
import { FormattedTextSource } from '@ui/content/FormattedText';
import { TopicIcon } from '@ui/content/TopicIcon';
import { Surface } from '@ui/surface';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
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
  return (
    <Hint label={face.capable ? 'Can participate in combat' : 'Cannot participate in combat'}>
      {face.capable ? <TopicIcon topic="battle" size={15} /> : <TopicIcon topic="noncombatant" size={15} />}
    </Hint>
  );
}

function Values({ face }: { face: Face }) {
  if (!face.capable) return null;
  if (!face.combat)
    return (
      <Hint label="Combat strengths have not been set. This side is unavailable in battle plans.">
        <TopicIcon topic="combatUnknown" size={16} />
      </Hint>
    );
  return (
    <>
      <Hint label={`Undialed strength: ${face.combat.strength} per troop`}>
        <TopicIcon topic="undialed" size={15} />
        <b>{face.combat.strength}</b>
      </Hint>
      <Hint label={`Dialed strength: ${face.combat.fundedStrength} per troop`}>
        <TopicIcon topic="dialed" size={15} />
        <b>{face.combat.fundedStrength}</b>
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

export function VariantA({ data, troops }: Props) {
  return (
    <div className={styles.cards}>
      {troops.map((troop, i) => (
        <Surface as="article" aria-label={troop.name} padding="sm" key={i}>
          <Stack gap={6}>
            <Group justify="space-between" gap={6}>
              <Text fw={700} size="sm">
                {troop.name}
              </Text>
              <Count count={troop.count} />
            </Group>
            {troopCombatFaces([troop]).map((face) => (
              <div className={styles.cardFace} key={face.id}>
                <Art data={data} face={face} />
                <div className={styles.faceContent}>
                  {face.side === 'back' ? (
                    <Group gap={4}>
                      <TopicIcon topic="flip" size={12} />
                      <Text size="xs">{face.face.name}</Text>
                    </Group>
                  ) : null}
                  <Group gap="sm" wrap="nowrap">
                    <Eligibility face={face} />
                    <Values face={face} />
                  </Group>
                </div>
              </div>
            ))}
          </Stack>
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
            <Group gap={6} justify="center">
              <Text fw={700} size="sm">
                {troop.name}
              </Text>
              <Count count={troop.count} />
            </Group>
            <Group gap="md" justify="center" align="flex-start" wrap="nowrap">
              {troopCombatFaces([troop]).map((face) => (
                <Stack gap={5} align="center" key={face.id}>
                  <Group gap={5} wrap="nowrap">
                    <Art data={data} face={face} />
                    <Eligibility face={face} />
                  </Group>
                  <Group gap="sm" wrap="nowrap">
                    <Values face={face} />
                  </Group>
                  {face.side === 'back' ? (
                    <Hint label={`Reverse side: ${face.face.name}`}>
                      <TopicIcon topic="flip" size={13} />
                    </Hint>
                  ) : null}
                </Stack>
              ))}
            </Group>
          </div>
        ))}
      </div>
    </Surface>
  );
}

export function VariantC({ data, troops }: Props) {
  return (
    <Surface padding="sm">
      <div className={styles.comparison} role="table" aria-label="Troop combat comparison">
        <div className={styles.comparisonRow} role="row">
          <span />
          <span role="columnheader">
            <Hint label="Combat eligibility">
              <TopicIcon topic="battle" size={15} />
            </Hint>
          </span>
          <span role="columnheader">
            <Hint label="Undialed strength per troop">
              <TopicIcon topic="undialed" size={15} />
            </Hint>
          </span>
          <span role="columnheader">
            <Hint label="Dialed strength per troop">
              <TopicIcon topic="dialed" size={15} />
            </Hint>
          </span>
          <span role="columnheader">
            <Hint label="Spice per dialed troop">
              <TopicIcon topic="spice" size={15} />
            </Hint>
          </span>
        </div>
        {troopCombatFaces(troops).map((face) => (
          <div className={styles.comparisonRow} role="row" key={face.id}>
            <Group gap="xs" wrap="nowrap" role="cell">
              <Art data={data} face={face} />
              <Text size="sm" fw={face.side === 'front' ? 700 : 400}>
                {face.face.name}
              </Text>
              {face.side === 'front' ? (
                <Count count={troops[face.troopIndex].count} />
              ) : (
                <Hint label={`Reverse of ${troops[face.troopIndex].name}`}>
                  <TopicIcon topic="flip" size={13} />
                </Hint>
              )}
            </Group>
            <span role="cell">
              <Eligibility face={face} />
            </span>
            {face.capable && face.combat ? (
              <>
                <span role="cell">
                  <Hint label={`Undialed strength: ${face.combat.strength}`}>
                    <b>{face.combat.strength}</b>
                  </Hint>
                </span>
                <span role="cell">
                  <Hint label={`Dialed strength: ${face.combat.fundedStrength}`}>
                    <b>{face.combat.fundedStrength}</b>
                  </Hint>
                </span>
                <span role="cell">
                  <Hint label={`Funding cost: ${face.combat.fundingCost} spice`}>
                    <b>{face.combat.fundingCost}</b>
                  </Hint>
                </span>
              </>
            ) : (
              <span role="cell" className={styles.noValues}>
                {face.capable ? <Values face={face} /> : null}
              </span>
            )}
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
