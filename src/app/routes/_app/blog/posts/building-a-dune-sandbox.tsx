import { Anchor } from '@mantine/core';
import { Section } from '@ui/block/Section';

import { Figure, Lead, Paragraph, PostLink } from '../postContent';
import { BLOG_POST_META } from '../posts';

const meta = BLOG_POST_META['building-a-dune-sandbox'];

export default function Post() {
  return (
    <>
      <Lead>
        There&rsquo;s a question I keep asking myself: why build something of my own, instead of contributing to the
        great work that already exists?
      </Lead>
      <Paragraph>
        For Dune online, the obvious place to contribute is Treachery.Online. So let me answer that question for myself,
        honestly. The short version: I want a sandbox, and that&rsquo;s simply not what Treachery.Online sets out to be.
      </Paragraph>
      <TreacherySection />
      <TabletopSimulatorSection />
      <AsksSection />
      <GapSection />
    </>
  );
}

function TreacherySection() {
  return (
    <Section title="Treachery.Online is a marvel">
      <Paragraph>
        If you haven&rsquo;t played on <Anchor href="https://treachery.online">Treachery.Online</Anchor>, go try it.{' '}
        <Anchor href="https://github.com/ronaldossendrijver">Ronald Ossendrijver</Anchor> started building it during the
        2020 lockdowns, around the same time{' '}
        <PostLink to="/blog/$postSlug" params={{ postSlug: 'why-dune' }}>
          I fell for this game
        </PostLink>
        . Today it plays the whole thing in your browser: every faction, the expansions, bots to fill empty seats, live
        games and slow games. Every rule is in there, and the game makes sure everyone follows it. Ronald even made{' '}
        <Anchor href="https://github.com/ronaldossendrijver/treachery.online">the code</Anchor> open source.
      </Paragraph>
      <Paragraph>It&rsquo;s a marvel of engineering, and I play on it myself.</Paragraph>
      <Paragraph>
        There&rsquo;s also a little-known connection between Ronald&rsquo;s work and mine. Years ago I built{' '}
        <Anchor href="https://dune.games">dune.games</Anchor>, a dashboard of win rates for the games we played.
        Treachery.Online sent its results there. When a game finished with mostly human players at the table, the result
        went straight into my database: which factions played, who won, on which turn and how. Some of what we learned
        about the game in those years we owe to that connection between our two sites.
      </Paragraph>
    </Section>
  );
}

function TabletopSimulatorSection() {
  return (
    <Section title="Why my group still plays on Tabletop Simulator">
      <Paragraph>So if Treachery.Online is that good, why does my group mostly play on Tabletop Simulator?</Paragraph>
      <Paragraph>
        Because it feels like sitting at a table. You pick up your troops and put them where you want. The rules live
        with the players, just like around a real table. And players make mistakes all the time, often noticing only a
        few moves later. No amount of strict checking prevents every one of them. On a table you simply put things right
        together and carry on.
      </Paragraph>
      <Figure
        imageKey="/web/blog/tabletop-simulator/game-night.jpg"
        alt="A game of Dune in Tabletop Simulator seen from above, with player areas around the round board"
        aspect={1050 / 1240}
        caption="A game night on Tabletop Simulator."
      />
      <Paragraph>
        But the biggest reason is homebrew, which I care about a lot. Our group even wrote{' '}
        <PostLink to="/blog/$postSlug" params={{ postSlug: 'why-dune' }}>
          a rule set of our own
        </PostLink>
        . We love trying new ideas: a new faction, a changed rule, a mechanic someone dreamt up last week. On Tabletop
        Simulator you put the new pieces on the table and play tonight.
      </Paragraph>
      <Paragraph>
        On Treachery.Online you can&rsquo;t, and that&rsquo;s not a flaw. It&rsquo;s the reason it works so well. Every
        rule is written into the code, so the game can enforce it for you. The other side of that is that a rule has to
        be programmed before anyone can play it. To Ronald&rsquo;s credit, he has built a large number of toggles,
        switches and optional rulings into it. But no system can enforce a rule you want to playtest for the very first
        time.
      </Paragraph>
    </Section>
  );
}

function AsksSection() {
  return (
    <Section title="What Tabletop Simulator asks of you">
      <Paragraph>
        Tabletop Simulator isn&rsquo;t expensive, it&rsquo;s often on sale, and it&rsquo;s great value for money. But
        it&rsquo;s a large application you buy on Steam and install on a computer that can run it. That rules out a lot
        of devices people actually own: budget laptops, Android tablets, iPhones and iPads. A web page runs on all of
        them.
      </Paragraph>
      <Paragraph>
        And making a proper mod for it is still hard work, as I found out myself. I wrote about that in{' '}
        <PostLink to="/blog/$postSlug" params={{ postSlug: 'tabletop-simulator' }}>
          Building Dune on Tabletop Simulator
        </PostLink>
        .
      </Paragraph>
    </Section>
  );
}

function GapSection() {
  return (
    <Section title="The gap">
      <Paragraph>
        So here&rsquo;s the gap I see. I want the freedom of Tabletop Simulator, with the room it leaves for homebrew,
        but in a browser, free, on any device. The rules should be there to help you, not to stop you from trying
        something new.
      </Paragraph>
      <Paragraph>
        That&rsquo;s what I&rsquo;m building toward on dune.zone. And the factions, cards and tokens made here
        aren&rsquo;t only for playing online. You can print them for a print &amp; play copy. You can look up a rule in
        the rulebook halfway through a real game night. And maybe one day, Treachery.Online could use them too.
      </Paragraph>
      <Paragraph>
        One more reason is a personal one. I started on this idea six years ago. This time I want to see it through, and
        I&rsquo;m close!
      </Paragraph>
      <Paragraph>
        There&rsquo;s room for all of it: Treachery.Online, Tabletop Simulator, and a sandbox on dune.zone. You&rsquo;ll
        keep finding me at all of those tables.
      </Paragraph>
      <Figure
        imageKey={meta.cover.key}
        alt={meta.cover.alt}
        aspect={meta.cover.aspect}
        caption="The dune.zone game table. See you there."
      />
    </Section>
  );
}
