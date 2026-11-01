import { Anchor, Button, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { LinkProps } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { TopicIcon } from '@ui/content/TopicIcon';
import type { TopicIconTopic } from '@ui/content/TopicIcon';
import { PageLayout } from '@ui/layout/PageLayout';
import { Bullets } from '@ui/list/Bullets';
import { Card } from '@ui/surface/Card';
import { ArrowRight, BookA, Images, MessagesSquare, Palette, Shapes } from 'lucide-react';
import type { ReactNode } from 'react';

import { publicPageHead } from '@app/routes/publicPage';

import styles from './index.module.css';

export const Route = createFileRoute('/_app/create/')({
  ssr: true,
  head: () =>
    publicPageHead({
      name: 'Create custom content for the Dune board game',
      pathname: '/create',
      description:
        'Make your own homebrew factions, cards, tokens, boards and rulebooks for the Dune board game. Start with the step-by-step faction tutorial, then share or print what you made.',
      social: { kind: 'Dune Zone', shape: 'portrait' },
    }),
  component: CreatePage,
});

type Creation = {
  topic: TopicIconTopic;
  title: string;
  detail: string;
  start: { label: string; link: LinkProps };
  browse: { label: string; link: LinkProps };
};

/* What a creator can make, each with the editor that makes it and the catalogue that shows what others made. */
const CREATIONS: readonly Creation[] = [
  {
    topic: 'factions',
    title: 'Factions',
    detail:
      'A whole faction from one form: leaders, troops, rules and advantages. Dune Zone draws its faction sheet, shield, leader tokens, traitor cards and alliance card for you.',
    start: { label: 'Create a faction', link: { to: '/factions/create' } },
    browse: { label: 'Browse factions', link: { to: '/factions' } },
  },
  {
    topic: 'cards',
    title: 'Cards and decks',
    detail:
      'Treachery, spice, storm, stronghold, homeworld, nexus and leader skill cards, or a card of your own design. Gather them into a deck.',
    start: { label: 'Make a custom card', link: { to: '/assets/$type/create', params: { type: 'card-custom' } } },
    browse: { label: 'Browse cards', link: { to: '/assets' } },
  },
  {
    topic: 'token',
    title: 'Tokens and bundles',
    detail:
      'Disc, plate, tech, pointer and enhance tokens for the rules a faction adds. A bundle packs several tokens into one piece of setup.',
    start: { label: 'Make a disc token', link: { to: '/assets/$type/create', params: { type: 'token-disc' } } },
    browse: { label: 'Browse tokens', link: { to: '/assets' } },
  },
  {
    topic: 'board',
    title: 'Boards',
    detail: 'A variant of the Dune board with your own territories, markings and artwork.',
    start: { label: 'Make a board', link: { to: '/assets/$type/create', params: { type: 'board' } } },
    browse: { label: 'Browse boards', link: { to: '/assets/$type', params: { type: 'board' } } },
  },
  {
    topic: 'rulesets',
    title: 'Rulesets and Rulebooks',
    detail:
      'A Ruleset gathers the factions and rules a game uses. Its Rulebooks are printable pages you lay out in the browser, with an FAQ beside them.',
    start: { label: 'Start a Ruleset', link: { to: '/rulesets/create' } },
    browse: { label: 'Browse Rulesets', link: { to: '/rulesets' } },
  },
  {
    topic: 'groups',
    title: 'Groups',
    detail: 'Work on factions and Rulesets with friends. Members of a Group can edit everything the Group looks after.',
    start: { label: 'Start a Group', link: { to: '/groups/create' } },
    browse: { label: 'See who is creating', link: { to: '/profiles' } },
  },
];

type Resource = { icon: ReactNode; title: ReactNode; detail: string };

const RESOURCES: readonly Resource[] = [
  {
    icon: <Images size={18} />,
    title: <Anchor renderRoot={(props) => <Link {...props} to="/media" />}>Media library</Anchor>,
    detail: 'Every portrait, troop, symbol, emblem and planet you can pick from in the editors.',
  },
  {
    icon: <Palette size={18} />,
    title: (
      <Anchor
        renderRoot={(props) => (
          <Link {...props} to="/blog/$postSlug" params={{ postSlug: 'dune-board-game-style-guide' }} />
        )}
      >
        The Dune board game style guide
      </Anchor>
    ),
    detail: 'The fonts, colours and textures of the GF9 edition, so your faction looks at home on the table.',
  },
  {
    icon: <Shapes size={18} />,
    title: (
      <Anchor
        renderRoot={(props) => (
          <Link {...props} to="/blog/$postSlug" params={{ postSlug: 'anatomy-of-a-dune-faction-atreides' }} />
        )}
      >
        Anatomy of a Dune faction
      </Anchor>
    ),
    detail: 'House Atreides taken apart: the ingredients of a faction and every piece drawn from them.',
  },
  {
    icon: <BookA size={18} />,
    title: <Anchor renderRoot={(props) => <Link {...props} to="/glossary" />}>Glossary</Anchor>,
    detail: 'The words the rulebook uses, so your rules text reads like the rest of the game.',
  },
  {
    icon: <MessagesSquare size={18} />,
    title: <Anchor href="https://discord.com/invite/dune-tabletop-624609341886169117">Dune Discord server</Anchor>,
    detail: 'Where homebrew factions get playtested, argued over and improved.',
  },
];

function CreatePage() {
  return (
    <PageLayout>
      <PageLayout.Header>
        <Stack gap="sm">
          <PageTitle eyebrow="Creating content" title="Make your own Dune" />
          <Text size="lg">
            Homebrew factions, cards, tokens, boards and Rulebooks for the Dune board game, ready to share, print and
            play.
          </Text>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="xl">
          <Section eyebrow="Tutorial" title="Start with a faction">
            <div className={styles.tutorial}>
              <Stack gap="sm">
                <Text size="lg">
                  The faction tutorial walks through the faction creator one tab at a time, from a name and a logo to
                  rules, advantages and a printable faction sheet.
                </Text>
                <Group>
                  <Button
                    rightSection={<ArrowRight size={16} aria-hidden />}
                    renderRoot={(props) => <Link {...props} to="/create/faction" />}
                  >
                    Read the faction tutorial
                  </Button>
                  <Button variant="subtle" renderRoot={(props) => <Link {...props} to="/factions/create" />}>
                    Open the faction creator
                  </Button>
                </Group>
              </Stack>
            </div>
          </Section>
          <Section title="What you can make" description="Every creator saves to your profile and gets its own page.">
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
              {CREATIONS.map((creation) => (
                <Card key={creation.title} title={creation.title} icon={<TopicIcon topic={creation.topic} size={20} />}>
                  <Stack gap="md" justify="space-between" className={styles.creation}>
                    <Text size="sm">{creation.detail}</Text>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        renderRoot={(props) => <Link {...props} {...creation.start.link} />}
                      >
                        {creation.start.label}
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        renderRoot={(props) => <Link {...props} {...creation.browse.link} />}
                      >
                        {creation.browse.label}
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              ))}
            </SimpleGrid>
          </Section>
          <Section title="Before you start" description="Reading that helps a homebrew fit the game.">
            <Bullets gap="xl" columns={{ base: 1, sm: 2 }}>
              {RESOURCES.map((resource) => (
                <Bullets.Item
                  key={resource.detail}
                  icon={resource.icon}
                  title={resource.title}
                  detail={resource.detail}
                />
              ))}
            </Bullets>
          </Section>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
