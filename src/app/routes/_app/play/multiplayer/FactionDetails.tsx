import { Accordion, Box, Stack, Text, Title } from '@mantine/core';
import { factionSpecialRuleLabel } from '@shared/factions/specialRule';
import type { PublicFaction } from '@shared/play/capture';
import { FormattedTextSource, InlineFormattedTextSource } from '@ui/content/FormattedText';
import { TopicIcon } from '@ui/content/TopicIcon';

import { LeaderToken } from '@game/assets/faction/leader/Leader';

import styles from './FactionDetails.module.css';

type Faction = Readonly<{ faction: PublicFaction }>;

/**
 * What a faction starts the game with, as the game captured it from its page.
 * The leaders stay in view.
 * Advantages, alliance, the special rule and setup fold open on demand.
 */
export function FactionDetails({ faction }: Faction) {
  return (
    <Stack gap="md">
      <Leaders faction={faction} />
      <Accordion multiple defaultValue={['advantages']} variant="separated">
        <Accordion.Item value="advantages">
          <Accordion.Control icon={<TopicIcon topic="advantages" size={18} />}>Advantages</Accordion.Control>
          <Accordion.Panel>
            <Advantages faction={faction} />
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="alliance">
          <Accordion.Control icon={<TopicIcon topic="alliance" size={18} />}>Alliance</Accordion.Control>
          <Accordion.Panel>
            <FormattedTextSource source={faction.rules.alliance.text} size="sm" />
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="fate">
          <Accordion.Control
            icon={<TopicIcon topic={faction.rules.fate.label === 'fate' ? 'fate' : 'karama'} size={18} />}
          >
            {factionSpecialRuleLabel(faction.rules.fate.label)}
          </Accordion.Control>
          <Accordion.Panel>
            {faction.rules.fate.title ? (
              <Text size="sm" fw={700}>
                {faction.rules.fate.title}
              </Text>
            ) : null}
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

function Advantages({ faction }: Faction) {
  const { advantages } = faction.rules;
  if (!advantages.length) {
    return <Text c="dimmed">No faction advantages have been added yet.</Text>;
  }
  return (
    <Stack gap="md">
      {advantages.map((advantage, index) => {
        const title = advantage.title ?? `Advantage ${index + 1}`;
        return (
          <Box key={`${title}-${index}`}>
            <Text size="sm" fw={700} mb={4}>
              {title}
            </Text>
            <Stack gap="xs">
              <FormattedTextSource source={advantage.text} size="sm" />
              {advantage.karama ? (
                <Box className={styles.karama}>
                  <TopicIcon topic="karama" size={16} />
                  <FormattedTextSource source={advantage.karama} size="sm" tone="neutral" />
                </Box>
              ) : null}
            </Stack>
          </Box>
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
          Starting spice
        </Title>
        <Text size="sm" mt={4}>
          {faction.rules.spiceCount} spice
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
