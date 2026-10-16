import { Anchor } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';
import { Surface } from '@ui/surface';
import type { ReactNode } from 'react';

import { Figure, Lead, Paragraph } from '../postContent';

/*
 * Outline only: each section says what it will cover, and each `Planned` box marks a figure still to be made.
 * The closing figure is a stand-in borrowed from the previous post until this post's own is made.
 */

function Planned({ children }: { children: ReactNode }) {
  return (
    <Surface padding="lg">
      <Paragraph>
        <strong>Figure to come:</strong> {children}
      </Paragraph>
    </Surface>
  );
}

function PostLink({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <Anchor renderRoot={(props) => <Link {...props} to="/blog/$postSlug" params={{ postSlug: slug }} />} inherit>
      {children}
    </Anchor>
  );
}

export default function Post() {
  return (
    <>
      <Lead>
        At the end of <PostLink slug="all-in-one-dune-board-game-webapp">my earlier attempts</PostLink> I promised to
        show where the data lives now, and how it all fits together. This is that post. It takes House Atreides apart:
        first its ingredients, then how they combine into every card, token and sheet you see on dune.zone.
      </Lead>
      <Section title="The ingredients">
        <Paragraph>
          What House Atreides is made of, one ingredient at a time, in plain words: its name, logo, background texture
          and two colours, the leader portraits, the troops with their backs and battle values, decals, and the rules
          (start, revival, spice, advantages, fate and alliance). For each, a line on where you meet it in the game.
        </Paragraph>
      </Section>
      <Section title="Everything is drawn from it">
        <Paragraph>
          None of the pictures are stored. The faction sheet, leader tokens, traitor cards, troop tokens, the alliance
          card and the shield are all drawn from those ingredients. Change the logo once and every one of them follows.
          How the drawing itself works is in the post about drawing tokens and cards.
        </Paragraph>
        <Paragraph>
          A small detail: the complexity rating is calculated from the faction&rsquo;s own rules, and the author can
          override it.
        </Paragraph>
        <Planned>
          each input shown on its own (the background, the row of leader portraits, the logo, the advantages, the
          colours) flowing together into House Atreides, with the finished assets coming out the other side: sheet,
          leader tokens, traitor cards, troop tokens, alliance card and shield. Drawn with the site&rsquo;s own
          components, so the outputs are real. While scrolling, one input lights up at a time to show where it lands:
          the logo on everything, the advantages only on the sheet.
        </Planned>
      </Section>
      <Section title="Adding your own cards and tokens">
        <Paragraph>
          Not everything a faction brings is drawn from its ingredients. A faction can bring its own deck or a set of
          special tokens. Those are made as assets of their own, and the faction lists them. At setup, they come along
          with it.
        </Paragraph>
        <Planned>
          the same diagram, with a second lane joining from the side: a custom deck and a token bundle from the
          catalogue, linked into the faction and appearing among its outputs.
        </Planned>
      </Section>
      <Section title="It took five years to get this shape">
        <Paragraph>
          The same faction, in the shape each earlier project gave it. In 2021 a faction was just a name on a game
          result. In 2023 a Faction finally existed, but every card kept its own copy of its data. In 2024 the pictures
          came first, and each one carried its own logo, colours and background, so changing a logo meant changing it
          everywhere. In 2026 there is one faction, and everything is drawn from it. The stories behind those projects
          are in <PostLink slug="all-in-one-dune-board-game-webapp">the earlier post</PostLink>; this section only shows
          their shapes.
        </Paragraph>
        <Planned>
          the input-to-output diagram redrawn for each era: no inputs at all in 2021, a copy of the logo and colours on
          every output in 2023 and 2024, and every line running from one faction in 2026.
        </Planned>
      </Section>
      <Section title="Where it lives now">
        <Paragraph>
          The bit technical part, kept light. The whole faction sits in one box, and it is checked against one set of
          rules before it&rsquo;s saved. One line each on the databases: it lived on Supabase for 17 days in March 2026,
          then moved to Convex, where the data and the server code live together and pages update live.
        </Paragraph>
        <Paragraph>
          A nice bit of continuity: some of today&rsquo;s rules, like the ones for decals and rule text, are the 2024
          versions almost unchanged.
        </Paragraph>
        <Planned>the faction passing a check on its way into its one box.</Planned>
      </Section>
      <Section title="Why the shape matters for homebrew">
        <Paragraph>
          Because a faction is one thing, anyone who makes a homebrew faction gets every card, token and sheet for free:
          ready for the table, for print and play, and for the rulebook. Close warmly, pointing at the faction creator.
        </Paragraph>
        <Planned>
          a community homebrew faction shown as its finished set: sheet, tokens and cards together. Until it&rsquo;s
          made, the picture below stands in.
        </Planned>
        <Figure
          imageKey="/web/blog/running-from-databases/then-and-now.jpg"
          alt="The Atreides faction sheet from the 2023 prototype next to the House Atreides page on dune.zone"
          aspect={823 / 2048}
          caption="Stand-in closing picture."
        />
      </Section>
    </>
  );
}
