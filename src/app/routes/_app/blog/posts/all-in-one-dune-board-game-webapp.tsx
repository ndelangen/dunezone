import { Anchor } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';

import { Figure, FigureRow, Lead, Paragraph } from '../postContent';
import { BLOG_POST_META } from '../posts';

const meta = BLOG_POST_META['all-in-one-dune-board-game-webapp'];

const IMAGES = '/web/blog/running-from-databases';

export default function Post() {
  return (
    <>
      <Lead>
        In the{' '}
        <Anchor
          renderRoot={(props) => <Link {...props} to="/blog/$postSlug" params={{ postSlug: 'tabletop-simulator' }} />}
        >
          last post
        </Anchor>{' '}
        I ended on an asset generator: one source of truth for the factions, with every image drawn from it. That sounds
        like a single project. In fact it was several, and looking back, they share a theme I never planned: I kept
        switching databases. Or trying very hard to have none at all.
      </Lead>
      <Paragraph>
        Every project was a new answer to two questions. Where does the data live? And who turns that data into images?
      </Paragraph>
      <DuneGamesSection />
      <DuneAppSection />
      <StackBlitzSection />
      <DuneAssetsSection />
      <NowSection />
    </>
  );
}

function DuneGamesSection() {
  return (
    <Section title="dune.games: counting wins">
      <Paragraph>
        The first answer was <Anchor href="https://dune.games">dune.games</Anchor>, a dashboard for the games we played
        on the Discord server. It tracked how long games took, on which turn they were won, and how: strongholds, a
        correct prediction, a Fremen or Guild special victory, a forfeit or a timeout. All of it was split by rule set:
        GF9 basic, GF9 advanced and Dreamrules.
      </Paragraph>
      <Paragraph>
        I&rsquo;ll admit I built it to prove a point. I was convinced that games under the GF9 rules lean towards a
        stall-out, and that the rule set I was a fan of had fixed that. A dashboard full of real games felt like the
        most convincing way to show it.
      </Paragraph>
      <Paragraph>
        And it did show it. In this screenshot from March 2021, the outer two rings are the GF9 rules: 14% of basic
        games and 22% of advanced games went all the way to turn 10. In Dreamrules, the inner ring, hardly any did. Most
        of those games were decided between turns 3 and 5, or around turn 8.
      </Paragraph>
      <Figure
        imageKey={`${IMAGES}/victory-turns-2021.jpg`}
        alt="Three nested half-ring charts of the turn on which games were won, for GF9 basic, GF9 advanced and Dreamrules"
        aspect={1190 / 1234}
        caption="Victory turn distribution, March 2021."
      />
      <Paragraph>
        The bigger dream was to have the Tabletop Simulator mod report wins, or even whole games, automatically.
        That&rsquo;s why the site asked players for their Steam ID.
      </Paragraph>
      <Paragraph>At its peak, dune.games held about 1,000 logged games.</Paragraph>
      <Paragraph>
        The data lived in FaunaDB. Fauna has since shut down, and the data went with it. The site is still online,
        though, and its charts are now empty, waiting patiently for games that will never be reported.
      </Paragraph>
      <Figure
        imageKey={`${IMAGES}/dune-games-empty.jpg`}
        alt="The Dune Dashboard today: chart panels for playtime, victory turns and victory methods, all empty"
        aspect={1463 / 2048}
        caption="dune.games today."
      />
    </Section>
  );
}

function DuneAppSection() {
  return (
    <Section title="dune-app: a creator for everything">
      <Paragraph>
        Our homebrew looked homemade. The very first Dreamrules &ldquo;logo&rdquo; was the GF9 box with a rainbow pasted
        behind Shai-Hulud. I wanted our cards and sheets to look as official as the real ones.
      </Paragraph>
      <Paragraph>
        That became <Anchor href="https://dune-app.vercel.app">dune-app</Anchor>. It started small: in September 2021,
        my first attempt at drawing a leader token in code was a red ring, an empty disc where the portrait would go,
        and a strength of 12. It grew into a much more ambitious app, with sign-in, users, rule sets and a GraphQL API.
      </Paragraph>
      <Paragraph>
        Its heart was the <strong>Creator</strong>: for every kind of game asset, a live preview next to an editor.
        Leader cards, treachery cards, alliance cards, faction sheets, tokens and shields could all be edited there.
      </Paragraph>
      <FigureRow
        figures={[
          {
            imageKey: `${IMAGES}/first-leader-token.jpg`,
            alt: 'A first leader token drawn in code: a red ring around a black disc, the number 12, and the name Brainfood',
            aspect: 1172 / 1200,
            caption: 'One of my first leader tokens in code, September 2021.',
          },
          {
            imageKey: `${IMAGES}/dune-app-leader-card.jpg`,
            alt: "Duncan Idaho's traitor card next to an editor with his name, faction, image, strength and colour",
            aspect: 1463 / 2048,
            caption: 'Later, a leader card and its editor.',
          },
        ]}
      />
      <Figure
        imageKey={`${IMAGES}/dune-app-creator.jpg`}
        alt="The Creator gallery: treachery, alliance and leader cards, a faction sheet, tokens and a shield"
        aspect={2187 / 2048}
        caption="The Creator."
      />
      <Paragraph>
        The Creator still works today. The rule sets and users pages don&rsquo;t, because the backend behind them is
        gone. A database again.
      </Paragraph>
    </Section>
  );
}

function StackBlitzSection() {
  return (
    <Section title="StackBlitz: no database at all">
      <Paragraph>
        So in September 2023 I tried the opposite: no database whatsoever. The{' '}
        <Anchor href="https://dune.stackblitz.io/">Dune Online Generator</Anchor> on StackBlitz keeps every faction as a
        code file. From those files it draws full faction sheets with advantages, alliance advantages, fate rules,
        Karama effects and a Q&amp;A, plus faction, leader and troop tokens, and the start of a paged rulebook laid out
        for A4.
      </Paragraph>
      <Paragraph>
        Some of the Q&amp;A sections still say &ldquo;LALALA?&rdquo;. It was a prototype, after all.
      </Paragraph>
    </Section>
  );
}

function DuneAssetsSection() {
  return (
    <Section title="dune-assets: git as the database">
      <Paragraph>
        In March 2024 I took &ldquo;no database, no costs&rdquo; as far as it would go. In{' '}
        <Anchor href="https://github.com/ndelangen/dune-assets">dune-assets</Anchor>, every asset is a Storybook story.
        Each time a change lands, a GitHub Action builds the stories, opens every one in a headless browser, takes a
        picture, and commits the images back into the repository. Git was the database, CI was the renderer, and GitHub
        hosted the images for free.
      </Paragraph>
      <Paragraph>
        It was wildly inefficient. It also worked. The repository holds almost 500 generated files: traitor and
        treachery cards, spice and alliance cards, leader, faction, troop and tech tokens, shields, faction sheets and a
        Dreamrules rulebook PDF.
      </Paragraph>
      <Figure
        imageKey={meta.cover.key}
        alt={meta.cover.alt}
        aspect={meta.cover.aspect}
        caption="Cards and tokens, each one a picture CI took of a story."
      />
      <Paragraph>
        It was also the first of these projects where other people joined in. Thanks to Laurens1234 for the CHOAM,
        alliance and card text updates, to Ralf Boltshauser for fixing Jamis&rsquo; strength, and to Jacek C. for adding
        GF9&rsquo;s Ecaz and Moritani treachery cards and fixing typos.
      </Paragraph>
    </Section>
  );
}

function NowSection() {
  return (
    <Section title="Where the data lives now">
      <Paragraph>
        Each of these projects taught me something that dune.zone now builds on. Factions are data, not pictures. Assets
        are drawn from that data, not drawn by hand. And everything, from the sheets to the rulebook, references the
        same source.
      </Paragraph>
      <Paragraph>
        dune.zone does have a database, and I&rsquo;ve made my peace with that. But the data finally has a home that
        should outlast the next shutdown, and the images are drawn on the page, live, from the same data.
      </Paragraph>
      <Paragraph>
        Where that home is, and how it all fits together, is the story of the next post. Fair warning: that one gets a
        bit technical.
      </Paragraph>
      <Figure
        imageKey={`${IMAGES}/then-and-now.jpg`}
        alt="The Atreides faction sheet from the 2023 prototype next to the House Atreides page on dune.zone"
        aspect={823 / 2048}
        caption={
          <>
            House Atreides in 2023, and on{' '}
            <Anchor
              renderRoot={(props) => (
                <Link {...props} to="/factions/$factionId" params={{ factionId: 'house-atreides' }} />
              )}
              inherit
            >
              dune.zone
            </Anchor>{' '}
            today.
          </>
        }
      />
    </Section>
  );
}
