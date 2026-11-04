import { Anchor } from '@mantine/core';
import { Section } from '@ui/block/Section';

import { BulletList, Figure, Lead, Paragraph, PostLink, WideFigure } from '../postContent';
import { AiLadder } from './aiart/AiLadder';
import { CreditSample } from './aiart/CreditSample';
import { HiversRow } from './aiart/HiversRow';

const THALER =
  'https://ipwatchdog.com/2025/03/24/d-c-circuit-upholds-human-authorship-requirement-thaler-v-perlmutter/';

export default function Post() {
  return (
    <>
      <Lead>
        If you own the Gale Force Nine edition of Dune, the leader portraits in your box started life as fan art. Around
        2010, Ilya Baranovsky, Ilya77 on BoardGameGeek, redrew the whole 1979 game and shared it as a free
        print-and-play. Groups printed it and played it for years. The MCDM video that got me into Dune was played on
        one of those print-and-plays. I wrote about that video in{' '}
        <PostLink to="/blog/$postSlug" params={{ postSlug: 'why-dune' }}>
          Why Dune?
        </PostLink>
        .
      </Lead>
      <Paragraph>
        When Gale Force Nine remade the game in 2019, they contracted with Ilya for the rights to his art. The look most
        of us now think of as Dune came from one fan making something for other fans.
      </Paragraph>
      <Figure
        imageKey="/web/blog/why-dune/avalon-hill-set.jpg"
        alt="An early Print and Play edition of Dune laid out on a table: board, shields, leader discs, battle wheels and cards"
        aspect={562 / 798}
        caption="A print-and-play of Ilya's art, from before GF9 published their edition."
      />
      <Paragraph>
        I want to be upfront about the rest of this post. Dune Zone uses AI to make images. I&rsquo;m not trying to hide
        that, and I&rsquo;m not trying to take anyone&rsquo;s work or break any laws. So here is what I do, what the law
        says about it, and who made what.
      </Paragraph>
      <CommunitySection />
      <WhySection />
      <WhatSection />
      <LawSection />
      <TrainingSection />
      <CreditSection />
      <ChangesSection />
      <ArtistsSection />
    </>
  );
}

function CommunitySection() {
  return (
    <Section title="The community kept building">
      <Paragraph>
        Ilya&rsquo;s art didn&rsquo;t stop at the printer or the box. Players built Tabletop Simulator mods, online
        versions and whole new factions on top of it. I built a few of those mods myself, which I wrote about in{' '}
        <PostLink to="/blog/$postSlug" params={{ postSlug: 'tabletop-simulator' }}>
          the Tabletop Simulator post
        </PostLink>
        .
      </Paragraph>
      <Paragraph>
        That work was never licensed. This whole community exists because the people who own Dune let it exist.
        That&rsquo;s the Herbert family and Herbert Properties, Gale Force Nine, the original designers Bill Eberle,
        Jack Kittredge and Peter Olotka, and the artists, Ilya first among them.
      </Paragraph>
      <Paragraph>
        I want to thank every one of them, from the bottom of my heart. All I want is for this community to grow and
        flourish. People playing this amazing board game.
      </Paragraph>
    </Section>
  );
}

function WhySection() {
  return (
    <Section title="Why I use AI">
      <Paragraph>
        I want to build the best tool I possibly can, and that needs images: new ones that fit. A homebrew faction of
        space orks shouldn&rsquo;t have Duncan Idaho as one of its leaders. Borrowed portraits make a faction feel
        unfinished, and the same goes for its emblem. Every new faction deserves its own leaders, emblem and decals, and
        they should sit naturally next to the originals.
      </Paragraph>
      <Paragraph>
        I don&rsquo;t have the drawing skills to make those, or the time. Letting everyone upload their own images
        isn&rsquo;t the answer either. I couldn&rsquo;t moderate every upload, and I don&rsquo;t want someone putting
        copyrighted art on the site without anyone checking. AI fills that gap, and every image that goes in is one
        I&rsquo;ve looked at.
      </Paragraph>
    </Section>
  );
}

function WhatSection() {
  return (
    <Section title="What it actually does">
      <Paragraph>
        &ldquo;AI art&rdquo; covers a lot of different things, so here are the four ways it&rsquo;s used on Dune Zone,
        from closest to the original to furthest away.
      </Paragraph>
      <Paragraph>
        <strong>Restoring.</strong> Some GF9 portraits only exist printed on a token, with a rim and a number on top. AI
        removes those so the portrait can sit in a new frame. The result is still GF9&rsquo;s image, and it&rsquo;s
        credited that way.
      </Paragraph>
      <Paragraph>
        <strong>Redrawing.</strong> Duke Leto&rsquo;s portrait is redrawn from GF9&rsquo;s own render in their KH
        edition announcement, matched to the other Atreides leaders. It&rsquo;s still based on GF9&rsquo;s picture.
      </Paragraph>
      <Paragraph>
        <strong>New subjects.</strong> The Hivers are a homebrew faction of insect-like aliens by Roxsy-Variant, who
        drew them. Together we brought those drawings into the GF9 look. The designs are Roxsy-Variant&rsquo;s, and so
        is the copyright.
      </Paragraph>
      <Paragraph>
        <strong>New marks.</strong> Emblems and decals for homebrew factions, designed here and traced into clean vector
        shapes.
      </Paragraph>
      <WideFigure caption="The four kinds of AI use on Dune Zone, from closest to the original to furthest away.">
        <AiLadder />
      </WideFigure>
    </Section>
  );
}

function LawSection() {
  return (
    <Section title="What the law says">
      <Paragraph>
        I&rsquo;m not a lawyer, but according to my research in both the US and the EU: nobody can own a style. An
        individual drawing is protected, but the way it&rsquo;s drawn, the ink lines, the colors, the mood, is not.
      </Paragraph>
      <Paragraph>
        So a new portrait drawn in the style of Ilya&rsquo;s leaders is a new image. A copy of one of his portraits,
        cleaned up or slightly changed, still belongs to the original author. There&rsquo;s no magic percentage that
        turns one into the other. What counts is whether you can still recognize the original drawing.
      </Paragraph>
      <Paragraph>
        AI doesn&rsquo;t change that test. An image is judged on what it looks like, not on the tool that made it. One
        thing does differ: in the US, a court decided that an image made purely by AI has no copyright owner at all (
        <Anchor href={THALER} target="_blank" rel="noreferrer">
          Thaler v. Perlmutter
        </Anchor>
        ). For a free community project, I&rsquo;m fine with that.
      </Paragraph>
    </Section>
  );
}

function TrainingSection() {
  return (
    <Section title="About the training data">
      <Paragraph>
        Whether &ldquo;an image made purely by AI&rdquo; is even a sensible statement is an ongoing debate. AI models
        were trained, and that used artists&rsquo; work without asking. Courts in the US and Europe are still working
        out if that was legal. I think that if the law says artists should be paid for it, they should be.
      </Paragraph>
      <Paragraph>
        I&rsquo;ll await their judgement, but until then I will use the tool as it makes what I need. If you&rsquo;re an
        artist and you see an image on Dune Zone that you recognize as your work, please get in touch. If you ask,
        I&rsquo;ll remove it or credit you properly (your choice).
      </Paragraph>
      <Paragraph>
        None of this is simple, and I won&rsquo;t pretend it is. Something can be within the law and still cross a line
        for a lot of people, because there are morals beyond the law. I try to do the right thing. For me, banning all
        AI use isn&rsquo;t the answer, but I respect people who see it differently.
      </Paragraph>
    </Section>
  );
}

function CreditSection() {
  return (
    <Section title="So, whose work do we credit?">
      <Paragraph>
        Someone asked me exactly this on a forum, and it&rsquo;s a fair question. Here&rsquo;s the answer:
      </Paragraph>
      <BulletList>
        <li>
          <strong>GF9&rsquo;s art</strong>, including restorations of it: Ilya Baranovsky, Solveig Reda and Lochen Reda,
          published by Gale Force Nine.
        </li>
        <li>
          <strong>New portraits in that style:</strong> AI-assisted, in Ilya&rsquo;s style, plus whoever came up with
          the character or drew the sketch. For the ones I generated, I&rsquo;d release them into the public domain if
          no artist claims them as theirs.
        </li>
        <li>
          <strong>Community sets:</strong> the people who made them, by name.
        </li>
        <li>
          <strong>Emblems and decals made here:</strong> Dune Zone.
        </li>
      </BulletList>
    </Section>
  );
}

function ChangesSection() {
  return (
    <Section title="What changed while writing this">
      <Paragraph>
        Writing this post made me look hard at everything on the site. After some reflection, I removed some of the
        images.
      </Paragraph>
      <Paragraph>
        Additionally I&rsquo;ve worked on showing the credits and sources of every image on Dune Zone. You can see it in
        the <PostLink to="/media">media gallery</PostLink>. I&rsquo;m just one person, so if you see any mistakes,
        please let me know and I&rsquo;ll correct it as soon as possible.
      </Paragraph>
      <Paragraph>
        That meant going through about two thousand images and tracing where each one first appeared and who drew it. It
        isn&rsquo;t finished: around 250 are still marked as found online while I look for their original artist.
      </Paragraph>
      <WideFigure caption="The credit line every image on Dune Zone now carries, as the media gallery shows it.">
        <CreditSample />
      </WideFigure>
      <Paragraph>These are the rules I will keep to:</Paragraph>
      <BulletList>
        <li>Credit the original artists.</li>
        <li>Keep a record of how every image was made.</li>
        <li>Don&rsquo;t pass off a copy as something new.</li>
        <li>Keep Dune Zone free and unofficial.</li>
        <li>Take an image down if its owner asks.</li>
      </BulletList>
    </Section>
  );
}

function ArtistsSection() {
  return (
    <Section title="Artists, you're invited">
      <Paragraph>
        The Hivers show how I&rsquo;d like this to work. Roxsy-Variant made them, together we made them fit the Dune
        look, and Roxsy-Variant still holds the copyright.
      </Paragraph>
      <Paragraph>
        If you draw, that&rsquo;s an open invitation. I&rsquo;ll add your artwork to Dune Zone with your name on it. If
        you&rsquo;d like, I&rsquo;ll help you fit it to the art style.
      </Paragraph>
      <Paragraph>
        One last thing. Whatever you think of AI, the person using it to build something is still a person. I&rsquo;d
        ask that we treat each other with kindness, even when we don&rsquo;t agree.
      </Paragraph>
      <WideFigure caption="The Hivers, designed and drawn by Roxsy-Variant, brought into the GF9 look.">
        <HiversRow />
      </WideFigure>
    </Section>
  );
}
