import { Anchor } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';

import { Figure, FigureRow, Lead, Paragraph } from '../postContent';
import { BLOG_POST_META } from '../posts';

const meta = BLOG_POST_META['tabletop-simulator'];

const WORKSHOP = 'https://steamcommunity.com/sharedfiles/filedetails/?id=';
const TTS = 'https://www.tabletopsimulator.com/';

export default function Post() {
  return (
    <>
      <Lead>
        In the{' '}
        <Anchor renderRoot={(props) => <Link {...props} to="/blog/$postSlug" params={{ postSlug: 'why-dune' }} />}>
          last post
        </Anchor>{' '}
        I told how I ended up playing Dune online every week. All of those games happened in{' '}
        <Anchor href={TTS}>Tabletop Simulator</Anchor> (TTS), on the{' '}
        <Anchor href={`${WORKSHOP}1972622978`}>GF9 Dune 2019 (Discord Mod)</Anchor>, maintained by Krell. It&rsquo;s
        still the mod most people use, with close to 7,000 subscribers, and it&rsquo;s the table where I learned to
        play.
      </Lead>
      <Figure
        imageKey="/web/blog/tabletop-simulator/game-night.jpg"
        alt="A game of Dune in Tabletop Simulator seen from above, with player areas around the round board"
        aspect={1050 / 1240}
        caption="A game night on Tabletop Simulator."
      />
      <Paragraph>
        TTS gives you a table and pieces you can pick up, and very little else. Every rule is enforced by the players,
        and Dune has a lot of bookkeeping. Every bit of it is a chance to make a mistake or slow the game down.
      </Paragraph>
      <Paragraph>So I started scripting.</Paragraph>
      <CommunityModSection />
      <OwnModsSection />
      <ToolsSection />
      <FundamentalsSection />
    </>
  );
}

function CommunityModSection() {
  return (
    <Section title="What I added to the community mod">
      <Paragraph>
        The contribution I am proudest of is <strong>the bidder</strong>. Bidding on treachery cards used to mean typing
        numbers into chat and someone keeping track of who had passed. With the bidder, you click to bid, your faction
        symbol shows up, and it moves on to the next player by itself. Bidding happens every turn, so I think it may be
        the biggest single improvement the mod ever got.
      </Paragraph>
      <Figure
        imageKey="/web/blog/tabletop-simulator/bidder.jpg"
        alt="The bidder: a numbered wheel with faction symbols beside it"
        aspect={500 / 1000}
        caption="The bidder."
      />
      <Paragraph>
        I also scripted the storm, so each storm card moves it the right number of sectors; spice blow cards that spawn
        their own spice in the right territory; and personal spice reserves and the spice bank&rsquo;s stacks.
      </Paragraph>
      <Figure
        imageKey="/web/blog/tabletop-simulator/storm-cards.jpg"
        alt="Two storm cards, one showing its Move storm tracker button"
        aspect={723 / 1000}
        caption="Every storm card moves the storm with one click."
      />
      <Paragraph>
        And I modelled a lot of the 3D objects in <Anchor href="https://www.blender.org/">Blender</Anchor> that are
        still on the table today: the bidder, the table and the board, the phase icons and some of the ships. I also
        converted the Shai-Hulud sandworm and the Ixians&rsquo; HMS.
      </Paragraph>
      <Figure
        imageKey="/web/blog/tabletop-simulator/blender-models.jpg"
        alt="Two 3D models: the bidding phase icon, a gavel over cards, and an Emperor troop"
        aspect={1024 / 2048}
        caption="Two of my models: the bidding phase icon and an Emperor troop."
      />
      <Paragraph>It&rsquo;s a joy to see many of these ideas show up in other Dune mods too.</Paragraph>
    </Section>
  );
}

function OwnModsSection() {
  return (
    <Section title="Mods of my own">
      <Paragraph>
        Some experiments I shared as separate Workshop items: scripted{' '}
        <Anchor href={`${WORKSHOP}2451574437`}>battle wheels</Anchor>, automated{' '}
        <Anchor href={`${WORKSHOP}2454511220`}>bidding decks</Anchor>, a{' '}
        <Anchor href={`${WORKSHOP}2447780542`}>memory bag</Anchor> that sets pieces out wherever you put it, and a{' '}
        <Anchor href={`${WORKSHOP}2485372113`}>faction creator</Anchor> with GF9&rsquo;s factions and Brainfood&rsquo;s
        custom ones to start from.
      </Paragraph>
      <FigureRow
        figures={[
          {
            imageKey: '/web/blog/tabletop-simulator/battle-wheels.jpg',
            alt: 'Two scripted battle wheels with leader discs and treachery cards between them',
            aspect: 764 / 852,
            caption: 'Scripted battle wheels.',
          },
          {
            imageKey: '/web/blog/tabletop-simulator/bidding-decks.jpg',
            alt: 'Two treachery decks with Take and Next buttons',
            aspect: 1638 / 1792,
            caption: 'Automated bidding decks.',
          },
        ]}
      />
      <Figure
        imageKey={meta.cover.key}
        alt={meta.cover.alt}
        aspect={meta.cover.aspect}
        caption="The faction creator, with a table for every faction."
      />
      <Paragraph>
        Long before the Homeworlds variant came out, I wanted each faction&rsquo;s home planet floating behind the
        table. I never finished it, but the <Anchor href={`${WORKSHOP}2462418534`}>Planets</Anchor> pack I made for it
        found almost 3,000 subscribers.
      </Paragraph>
      <Figure
        imageKey="/web/blog/tabletop-simulator/planets.jpg"
        alt="Dozens of textured planets floating against a starry sky"
        aspect={1240 / 2048}
        caption="The Planets pack."
      />
    </Section>
  );
}

function ToolsSection() {
  return (
    <Section title="Fighting the tools">
      <Paragraph>
        The more I built, the harder TTS was to work with. Its scripts are Lua, a perfectly fine language but not the
        one I was most comfortable in, and they lived scattered across objects in the save file.
      </Paragraph>
      <Paragraph>
        I had a vision of <Anchor href={`${WORKSHOP}2859509846`}>my own TTS mod</Anchor>: written from the ground up,
        automating every tedious bit where mistakes, delays and frustration build up. Unfortunately, I got incredibly
        side-tracked.
      </Paragraph>
      <Paragraph>
        It started with the assets. Our group played a custom rule set that we kept playtesting and improving; new metas
        developed and new strategies were found, so the changes never stopped. Every time a faction ability changed, its
        sheet had to change too. I redrew the vectors and icons, and worked in{' '}
        <Anchor href="https://www.gimp.org/">GIMP</Anchor>, stacking layers and overlaying text, to stay as close as I
        could to the original art.
      </Paragraph>
      <FigureRow
        figures={[
          {
            imageKey: '/web/blog/tabletop-simulator/abomination.jpg',
            alt: 'A custom Abomination treachery card made in the style of the GF9 cards',
            aspect: 600 / 430,
            caption: (
              <>
                A custom card by <RidwanLink />.
              </>
            ),
          },
          {
            imageKey: '/web/blog/tabletop-simulator/rainbow-troops.jpg',
            alt: 'Force tokens on the Imperial Basin, one stack painted in rainbow colours',
            aspect: 895 / 1830,
            caption: 'Hand-painted troops on the Imperial Basin, June 2020.',
          },
        ]}
      />
      <Paragraph>
        And I always wanted my mod to support multiple rule sets, maybe infinitely many, with everything customisable.
        So the scope creep never seemed to stop, in a development environment that was rather tedious.
      </Paragraph>
    </Section>
  );
}

function FundamentalsSection() {
  return (
    <Section title="From a mod to the fundamentals">
      <Paragraph>
        So I decided to build an asset generator: one source of truth for everything about the factions, from which my
        tool would generate every image TTS needed.
      </Paragraph>
      <Paragraph>
        Then I wanted the rulebook to reference the same data. It kept growing bigger and bigger, with more work every
        time I touched something. I wasn&rsquo;t working on the TTS mod anymore; I was working on the fundamentals.
      </Paragraph>
      <FigureRow
        figures={[
          {
            imageKey: '/web/blog/tabletop-simulator/iduali-sheet.jpg',
            alt: 'The Iduali faction sheet as a text document, listing its advantages',
            aspect: 1600 / 1200,
            caption: (
              <>
                The Iduali by <RidwanLink />, as a document.
              </>
            ),
          },
          {
            imageKey: '/web/blog/tabletop-simulator/iduali-dune-zone.jpg',
            alt: 'The Iduali faction page on dune.zone, with leader discs, troops and advantages',
            aspect: 1690 / 1400,
            caption: (
              <>
                The{' '}
                <Anchor
                  renderRoot={(props) => <Link {...props} to="/factions/$factionId" params={{ factionId: 'iduali' }} />}
                  inherit
                >
                  Iduali
                </Anchor>{' '}
                on dune.zone today.
              </>
            ),
          },
        ]}
      />
      <Paragraph>Those fundamentals are what dune.zone is built on.</Paragraph>
    </Section>
  );
}

function RidwanLink() {
  return (
    <Anchor
      renderRoot={(props) => <Link {...props} to="/profiles/$profileSlug" params={{ profileSlug: 'ridwan' }} />}
      inherit
    >
      Ridwan
    </Anchor>
  );
}
