import { Anchor, Text } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { Card } from '@ui/surface/Card';

import { Token } from '@game/assets/faction/token/Token';
import { disc } from '@game/data/sizes';
import { factionTokenFixtures } from '@game/fixtures/factionTokens';

import { Figure, Lead, LiveEmbed, Paragraph } from '../postContent';
import { BLOG_POST_META } from '../posts';

const { cover } = BLOG_POST_META['a-blog-for-dune-zone'];

export default function Post() {
  return (
    <>
      <Lead>
        Dune Zone has grown a lot since it started. Along the way we tried ideas that worked, ideas that did not, and a
        few that surprised us. This blog is where we write those stories down.
      </Lead>

      <Section title="What you will find here">
        <Paragraph>
          Posts about how the site is built and why it works the way it does: how a custom faction becomes printable
          artwork, how a{' '}
          <Anchor component={Link} to="/rulesets">
            Ruleset
          </Anchor>{' '}
          and its Rulebooks fit together, and how the table for playing online came to be.
        </Paragraph>
        <Figure
          imageKey={cover.key}
          alt={cover.alt}
          aspect={cover.aspect}
          caption="The board, as Dune Zone draws it."
        />
      </Section>

      <Section title="Drawn by the site itself">
        <Paragraph>
          Most of the game artwork on Dune Zone is not a picture file. It is drawn by the same code that renders
          factions, cards and Rulebooks, so posts here can show the real thing.
        </Paragraph>
        <LiveEmbed
          caption="The Atreides faction token, drawn live by the site's token renderer."
          width="min(12rem, 60cqi)"
        >
          <CanvasScale canvasWidth={disc.width} canvasHeight={disc.height}>
            <Token {...factionTokenFixtures.atreides} />
          </CanvasScale>
        </LiveEmbed>
      </Section>

      <Card title="Want to follow along?" padding="md">
        <Text>
          The project is open source. Read the code and its history on{' '}
          <Anchor href="https://github.com/ndelangen/dunezone">GitHub</Anchor>.
        </Text>
      </Card>
    </>
  );
}
