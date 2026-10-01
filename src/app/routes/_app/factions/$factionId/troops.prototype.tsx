/* Throwaway for #1615: three troop layouts on the faction detail route, selected by ?variant=A|B|C. */
import { ActionIcon, Badge, Divider, Group, Select, Stack, Table, Text, Tooltip } from '@mantine/core';
import { troopCombatFaces } from '@shared/factions/troopCombat';
import { Section } from '@ui/block/Section';
import { FormattedTextSource } from '@ui/content/FormattedText';
import { Surface } from '@ui/surface';
import { ArrowLeft, ArrowRight, Swords, ShieldOff } from 'lucide-react';
import { useEffect } from 'react';

import type { FactionData } from '@db/factions';
import { TroopToken } from '@game/assets/faction/troop/Troop';

import styles from './troops.prototype.module.css';

type Troop = FactionData['troops'][number];
type Face = ReturnType<typeof troopCombatFaces<NonNullable<Troop['back']>>>[number];
type Props = { data: FactionData; troops: Troop[] };
export type TroopVariant = 'A' | 'B' | 'C';
export type TroopScenario = 'saved' | 'sample';
const variants: TroopVariant[] = ['A', 'B', 'C'];
const names = { A: 'Troop cards', B: 'Strength comparison', C: 'Compact roster' };

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

function Art({ data, face, small = false }: { data: FactionData; face: Face; small?: boolean }) {
  return (
    <div className={small ? styles.smallToken : styles.token}>
      <TroopToken
        background={data.background}
        image={face.face.image}
        hue={face.face.hue}
        star={face.face.star}
        striped={face.face.striped}
      />
    </div>
  );
}

function Eligibility({ face }: { face: Face }) {
  return (
    <Group gap={5} wrap="nowrap">
      <span aria-hidden>{face.capable ? <Swords size={15} /> : <ShieldOff size={15} />}</span>
      <Text size="xs" fw={600}>
        {face.capable ? 'Can fight' : 'Cannot fight'}
      </Text>
    </Group>
  );
}

function Values({ face }: { face: Face }) {
  if (!face.capable)
    return (
      <Text size="sm" c="dimmed">
        Does not participate in combat.
      </Text>
    );
  if (!face.combat)
    return (
      <Text size="sm" c="dimmed">
        Strengths not set. Unavailable in battle plans.
      </Text>
    );
  return (
    <div className={styles.values}>
      <Stack gap={2}>
        <Text size="xs" c="dimmed">
          Undialed
        </Text>
        <Text size="xl" fw={700}>
          {face.combat.strength}
        </Text>
      </Stack>
      <Stack gap={2}>
        <Text size="xs" c="dimmed">
          Dialed
        </Text>
        <Text size="xl" fw={700}>
          {face.combat.fundedStrength}
        </Text>
      </Stack>
      <Stack gap={2}>
        <Text size="xs" c="dimmed">
          Spice / troop
        </Text>
        <Text size="xl" fw={700}>
          {face.combat.fundingCost}
        </Text>
      </Stack>
    </div>
  );
}

export function VariantA({ data, troops }: Props) {
  return (
    <div className={styles.cards}>
      {troops.map((troop, i) => (
        <Surface as="article" aria-label={troop.name} padding="lg" key={i}>
          <Stack gap="md">
            <Group justify="space-between">
              <Text size="sm" fw={700}>
                {troop.name}
              </Text>
              <Badge variant="default">{troop.count} tokens</Badge>
            </Group>
            {troopCombatFaces([troop]).map((face, j) => (
              <Stack gap="sm" key={face.id}>
                {j > 0 ? <Divider label="Reverse side" /> : null}
                <Group wrap="nowrap">
                  <Art data={data} face={face} />
                  <Stack gap={5}>
                    <Text fw={700}>{troop.back ? face.face.name : 'Combat'}</Text>
                    <Eligibility face={face} />
                  </Stack>
                </Group>
                <Values face={face} />
                {face.face.description ? <FormattedTextSource source={face.face.description} size="sm" /> : null}
              </Stack>
            ))}
          </Stack>
        </Surface>
      ))}
    </div>
  );
}

export function VariantB({ data, troops }: Props) {
  return (
    <Surface padding="none">
      <div className={styles.tableScroll}>
        <Table verticalSpacing="md" horizontalSpacing="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Troop / side</Table.Th>
              <Table.Th>Tokens</Table.Th>
              <Table.Th>Combat</Table.Th>
              <Table.Th>Undialed</Table.Th>
              <Table.Th>Dialed</Table.Th>
              <Table.Th>Spice / troop</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {troopCombatFaces(troops).map((face) => (
              <Table.Tr key={face.id}>
                <Table.Td>
                  <Group wrap="nowrap" gap="sm">
                    <Art data={data} face={face} small />
                    <Stack gap={2}>
                      <Text fw={700}>{face.face.name}</Text>
                      <Text size="xs" c="dimmed">
                        {face.side === 'back'
                          ? `Reverse of ${troops[face.troopIndex].name}`
                          : troops[face.troopIndex].back
                            ? 'Front side'
                            : 'Single side'}
                      </Text>
                      {face.face.description ? <FormattedTextSource source={face.face.description} size="xs" /> : null}
                    </Stack>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{face.side === 'back' ? 'Same tokens' : troops[face.troopIndex].count}</Text>
                </Table.Td>
                <Table.Td>
                  <Eligibility face={face} />
                </Table.Td>
                {face.capable && face.combat ? (
                  <>
                    <Table.Td>
                      <Text fw={700}>{face.combat.strength}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fw={700}>{face.combat.fundedStrength}</Text>
                    </Table.Td>
                    <Table.Td>{face.combat.fundingCost}</Table.Td>
                  </>
                ) : (
                  <Table.Td colSpan={3}>
                    <Text size="sm" c="dimmed">
                      {face.capable ? 'Strengths not set' : 'Not applicable'}
                    </Text>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
    </Surface>
  );
}

export function VariantC({ data, troops }: Props) {
  return (
    <Surface padding="lg">
      <Stack gap="md">
        {troopCombatFaces(troops).map((face, i) => (
          <Stack key={face.id} gap="md">
            {i ? <Divider /> : null}
            <div className={styles.rosterRow}>
              <Group wrap="nowrap" align="flex-start">
                <Art data={data} face={face} small />
                <Stack gap={4}>
                  <Group gap="xs">
                    <Text fw={700}>{face.face.name}</Text>
                    {face.side === 'front' ? (
                      <Text size="sm" c="dimmed">
                        ×{troops[face.troopIndex].count}
                      </Text>
                    ) : (
                      <Text size="xs" c="dimmed">
                        Reverse side
                      </Text>
                    )}
                  </Group>
                  <Eligibility face={face} />
                  {face.face.description ? <FormattedTextSource source={face.face.description} size="sm" /> : null}
                </Stack>
              </Group>
              <div className={styles.rosterStrength}>
                {face.capable && face.combat ? (
                  <Stack gap={2}>
                    <Group gap="xs" justify="flex-end">
                      <Tooltip label="Strength per undialed troop">
                        <Text size="xl" fw={700}>
                          {face.combat.strength}
                        </Text>
                      </Tooltip>
                      <ArrowRight size={15} />
                      <Tooltip label="Strength per dialed troop">
                        <Text size="xl" fw={700}>
                          {face.combat.fundedStrength}
                        </Text>
                      </Tooltip>
                    </Group>
                    <Text size="xs" c="dimmed" ta="right">
                      Undialed → dialed
                    </Text>
                    <Text size="xs" ta="right">
                      {face.combat.fundingCost} spice / troop
                    </Text>
                  </Stack>
                ) : (
                  <Text size="sm" c="dimmed">
                    {face.capable ? 'Strengths not set' : 'No combat'}
                  </Text>
                )}
              </div>
            </div>
          </Stack>
        ))}
      </Stack>
    </Surface>
  );
}

export function TroopPrototype({ variant, ...props }: Props & { variant: TroopVariant }) {
  return (
    <Section title="Troops" icon={<Swords size={20} />}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Strength per troop. Dialing uses the funded strength and costs the listed spice.
        </Text>
        {variant === 'A' ? (
          <VariantA {...props} />
        ) : variant === 'B' ? (
          <VariantB {...props} />
        ) : (
          <VariantC {...props} />
        )}
      </Stack>
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
