import { Accordion, Box, Divider, Group, SegmentedControl, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { FactionInput } from '@shared/factions/schema';
import { Section } from '@ui/block/Section';
import { FormattedTextSource, InlineFormattedTextSource } from '@ui/content/FormattedText';
import { TopicIcon } from '@ui/content/TopicIcon';
import { Card } from '@ui/surface/Card';
import { useState } from 'react';

import { LeaderToken } from '@game/assets/faction/leader/Leader';
import { Token as FactionToken } from '@game/assets/faction/token/Token';

import styles from './FactionDetails.module.css';

/* Prototype layouts for Norbert's pick (#1007); the chosen one stays and the rest go. */
export type FactionDetailsLayout = 'sheet' | 'tabs' | 'accordion' | 'columns';

type Props = Readonly<{ faction: FactionInput; layout: FactionDetailsLayout }>;

/** What a faction starts the game with, as its page shows it: leaders, advantages, alliance, fate and setup. */
export function FactionDetails({ faction, layout }: Props) {
  switch (layout) {
    case 'tabs':
      return <TabsLayout faction={faction} />;
    case 'accordion':
      return <AccordionLayout faction={faction} />;
    case 'columns':
      return <ColumnsLayout faction={faction} />;
    default:
      return <SheetLayout faction={faction} />;
  }
}

type Faction = Readonly<{ faction: FactionInput }>;

function Leaders({ faction }: Faction) {
  return (
    <div className={styles.leaders}>
      {faction.leaders.map((leader, index) => (
        <div
          key={`${leader.name}-${index}`}
          className={styles.leader}
          title={`${leader.name}, strength ${leader.strength ?? 'not specified'}`}
        >
          <LeaderToken {...leader} background={faction.background} logo={faction.logo} />
        </div>
      ))}
    </div>
  );
}

function Advantages({ faction, plain = false }: Faction & Readonly<{ plain?: boolean }>) {
  const { advantages } = faction.rules;
  if (!advantages.length) {
    return <Text c="dimmed">No faction advantages have been added yet.</Text>;
  }
  return (
    <Stack gap={plain ? 'md' : 'sm'}>
      {advantages.map((advantage, index) => {
        const title = advantage.title ?? `Advantage ${index + 1}`;
        const body = (
          <Stack gap="xs">
            <FormattedTextSource source={advantage.text} size="sm" />
            {advantage.karama ? (
              <Group gap="xs" wrap="nowrap" align="flex-start">
                <TopicIcon topic="karama" size={16} />
                <FormattedTextSource source={advantage.karama} size="sm" tone="neutral" />
              </Group>
            ) : null}
          </Stack>
        );
        return plain ? (
          <Box key={`${title}-${index}`}>
            <Text size="sm" fw={700} mb={4}>
              {title}
            </Text>
            {body}
          </Box>
        ) : (
          <Card key={`${title}-${index}`} title={title}>
            {body}
          </Card>
        );
      })}
    </Stack>
  );
}

function Setup({ faction }: Faction) {
  return (
    <Stack gap="sm">
      <Box>
        <Title order={4} size="h5">
          At start
        </Title>
        <Text size="sm" mt={4}>
          <InlineFormattedTextSource source={faction.rules.startText} />
        </Text>
      </Box>
      <Box>
        <Title order={4} size="h5">
          Revival
        </Title>
        <Text size="sm" mt={4}>
          <InlineFormattedTextSource source={faction.rules.revivalText} />
        </Text>
      </Box>
    </Stack>
  );
}

function AllianceAndFate({ faction }: Faction) {
  return (
    <SimpleGrid cols={2} spacing="sm">
      <Card icon={<TopicIcon topic="alliance" size={20} />} title="Alliance">
        <FormattedTextSource source={faction.rules.alliance.text} size="sm" />
      </Card>
      <Card icon={<TopicIcon topic="fate" size={20} />} title={faction.rules.fate.title || 'Fate'}>
        <FormattedTextSource source={faction.rules.fate.text} size="sm" />
      </Card>
    </SimpleGrid>
  );
}

/* A: everything stacked, as the faction page reads, one section after another. */
function SheetLayout({ faction }: Faction) {
  return (
    <Stack gap="lg">
      <Section icon={<TopicIcon topic="leaders" size={20} />} title="Leaders">
        <Leaders faction={faction} />
      </Section>
      <Section icon={<TopicIcon topic="advantages" size={20} />} title="Advantages">
        <Advantages faction={faction} />
      </Section>
      <AllianceAndFate faction={faction} />
      <Section icon={<TopicIcon topic="setup" size={20} />} title="Setup">
        <Setup faction={faction} />
      </Section>
    </Stack>
  );
}

/* B: one part at a time behind a switch. */
function TabsLayout({ faction }: Faction) {
  const [part, setPart] = useState('leaders');
  return (
    <Stack gap="md">
      <SegmentedControl
        fullWidth
        value={part}
        onChange={setPart}
        data={[
          { value: 'leaders', label: 'Leaders' },
          { value: 'advantages', label: 'Advantages' },
          { value: 'alliance', label: 'Alliance & fate' },
          { value: 'setup', label: 'Setup' },
        ]}
      />
      {part === 'leaders' && <Leaders faction={faction} />}
      {part === 'advantages' && <Advantages faction={faction} />}
      {part === 'alliance' && <AllianceAndFate faction={faction} />}
      {part === 'setup' && <Setup faction={faction} />}
    </Stack>
  );
}

/* C: leaders always in view, the text in folds that open on demand. */
function AccordionLayout({ faction }: Faction) {
  return (
    <Stack gap="md">
      <Leaders faction={faction} />
      <Accordion multiple defaultValue={['advantages']} variant="separated">
        <Accordion.Item value="advantages">
          <Accordion.Control icon={<TopicIcon topic="advantages" size={18} />}>Advantages</Accordion.Control>
          <Accordion.Panel>
            <Advantages faction={faction} plain />
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="alliance">
          <Accordion.Control icon={<TopicIcon topic="alliance" size={18} />}>Alliance</Accordion.Control>
          <Accordion.Panel>
            <FormattedTextSource source={faction.rules.alliance.text} size="sm" />
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="fate">
          <Accordion.Control icon={<TopicIcon topic="fate" size={18} />}>
            {faction.rules.fate.title || 'Fate'}
          </Accordion.Control>
          <Accordion.Panel>
            <FormattedTextSource source={faction.rules.fate.text} size="sm" />
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="setup">
          <Accordion.Control icon={<TopicIcon topic="setup" size={18} />}>Setup</Accordion.Control>
          <Accordion.Panel>
            <Setup faction={faction} />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}

/* D: a reference sheet: token and leaders down the side, the rules as plain text beside them. */
function ColumnsLayout({ faction }: Faction) {
  return (
    <div className={styles.columns}>
      <Stack gap="sm">
        <div className={styles.token}>
          <FactionToken logo={faction.logo} background={faction.background} />
        </div>
        <Leaders faction={faction} />
      </Stack>
      <Stack gap="md">
        <Advantages faction={faction} plain />
        <Divider />
        <Box>
          <Text size="sm" fw={700} mb={4}>
            Alliance
          </Text>
          <FormattedTextSource source={faction.rules.alliance.text} size="sm" />
        </Box>
        <Box>
          <Text size="sm" fw={700} mb={4}>
            {faction.rules.fate.title || 'Fate'}
          </Text>
          <FormattedTextSource source={faction.rules.fate.text} size="sm" />
        </Box>
        <Divider />
        <Setup faction={faction} />
      </Stack>
    </div>
  );
}
