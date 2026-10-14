import { Anchor } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';
import { Surface } from '@ui/surface';

import { Figure, FigureRow, Lead, Paragraph, YouTube } from '../postContent';
import { BLOG_POST_META } from '../posts';

const meta = BLOG_POST_META['why-dune'];

export default function Post() {
  return (
    <>
      <Lead>
        It started the way a lot of things start now: YouTube recommended me a video I hadn&rsquo;t asked for. It was
        from <Anchor href="https://www.youtube.com/@helloMCDM">MCDM</Anchor>, a group playing the Dune board game, and
        the thumbnail looked strange enough that I clicked.
      </Lead>
      <Paragraph>
        I wasn&rsquo;t new to board games. I had been part of an in-person board game group for years, and I was already
        playing on{' '}
        <Anchor href="https://www.tabletopsimulator.com/" inherit>
          Tabletop Simulator
        </Anchor>
        : Secret Hitler, Codenames and plenty of others. I knew what a good game night felt like. What I didn&rsquo;t
        know yet was what I was missing.
      </Paragraph>
      <ComputerSection />
      <UnbalancedSection />
      <TableSection />
      <CracksSection />
      <ImprovingSection />
    </>
  );
}

function ComputerSection() {
  return (
    <Section title="Would this play differently against a computer?">
      <Paragraph>
        Our in-person group mostly played Euro-style games. You know the kind: a score track running around the edge of
        the board, worker placement, everyone quietly optimising their own little engine. I liked those games, and I
        still think playing board games together is great fun, even the ones with little interaction. But it was the
        group that kept me coming back, not the games.
      </Paragraph>
      <Paragraph>
        The games that did pull me in were the ones where the other players <em>were</em> the game. Where you spent the
        evening talking, reading the table, and trying to work out what everyone else wanted.
      </Paragraph>
      <Paragraph>
        One evening made this click for me. I mentioned that I was having a hard time figuring out who was ahead.
        Another player told me that was by design: you weren&rsquo;t supposed to be able to tell. That stuck with me. I
        asked myself whether the game would play any differently if I were playing it against an AI, and I realised it
        really wouldn&rsquo;t change at all.
      </Paragraph>
    </Section>
  );
}

function UnbalancedSection() {
  return (
    <Section title="Unbalanced, and proud of it">
      <Paragraph>
        So when that MCDM video came along, I was completely captivated. The game was openly unbalanced. Every faction
        broke the rules in its own way. The board looked wild. It didn&rsquo;t look like any game I had ever played.
      </Paragraph>
      <Paragraph>
        I knew of Dune, but I had never read the books. My Dune was <em>Dune 2000</em>, the Command &amp; Conquer-style
        strategy game, and a viewing of the David Lynch film that hadn&rsquo;t meant much to me at the time. That video
        changed it. It sparked an interest in the Dune universe, in the board game, and honestly in board games in
        general.
      </Paragraph>
      <YouTube
        id="Js_WINTqtjo"
        title="MCDM Plays Dune - Round 1"
        posterKey="/web/blog/why-dune/mcdm-plays-dune.jpg"
        caption={
          <>
            MCDM Plays Dune, Round 1. The story continues in{' '}
            <Anchor href="https://www.youtube.com/watch?v=aNbODmHvyQc" inherit>
              Round 2
            </Anchor>{' '}
            and{' '}
            <Anchor href="https://www.youtube.com/watch?v=aJIC4z6z4bQ" inherit>
              Round 3
            </Anchor>
            .
          </>
        }
      />
      <Paragraph>
        I watched two or three of their Dune let&rsquo;s-plays back to back. Then I went looking for people to play
        with.
      </Paragraph>
    </Section>
  );
}

function TableSection() {
  return (
    <Section title="Finding the table">
      <Paragraph>
        I found the{' '}
        <Anchor href="https://discord.com/invite/dune-tabletop-624609341886169117">Dune Discord server</Anchor>, joined
        my first game, and I was hooked from that moment.
      </Paragraph>
      <Paragraph>
        The timing helped. This was in early 2020, right around when Covid arrived, and a lot of people suddenly had a
        lot of time on their hands. The servers were full, games ran constantly, and we had a really good time.
      </Paragraph>
      <Figure
        imageKey="/web/blog/why-dune/tts-table.jpg"
        alt="A Dune game set up in Tabletop Simulator, with faction shields around the board"
        aspect={603 / 1072}
        caption={
          <>
            A game of Dune on{' '}
            <Anchor href="https://www.tabletopsimulator.com/" inherit>
              Tabletop Simulator
            </Anchor>
            .
          </>
        }
      />
    </Section>
  );
}

function CracksSection() {
  return (
    <Section title="Where the cracks showed">
      <Paragraph>
        After twenty or thirty games on{' '}
        <Anchor href="https://www.tabletopsimulator.com/" inherit>
          Tabletop Simulator
        </Anchor>
        , the cracks in the design started to show.
      </Paragraph>
      <Paragraph>
        There were already several rule sets around: the{' '}
        <Anchor href="https://www.boardgamers.org/wbc22/previews/dun.html" inherit>
          World Boardgaming Championships (WBC) rules
        </Anchor>
        , the original Avalon Hill rules, and the GF9 rules. The GF9 rule set left a lot of questions open. Working out
        exactly how two abilities interacted was always a puzzle. Often the rulebook simply didn&rsquo;t say, and even
        when we asked the designers directly we sometimes got conflicting answers.
      </Paragraph>
      <FigureRow
        figures={[
          {
            imageKey: '/web/blog/why-dune/gf9-board.jpg',
            alt: 'A prototype GF9 edition board with leader discs and treachery cards',
            aspect: 341 / 512,
            caption: 'A home-made prototype Print & Play.',
          },
          {
            imageKey: '/web/blog/why-dune/avalon-hill-set.jpg',
            alt: 'An early Print and Play edition of Dune laid out on a table: board, shields, leader discs, combat wheels and cards',
            aspect: 562 / 798,
            caption: "A Print & Play version of Ilya's art before GF9 published their edition.",
          },
        ]}
      />
      <Paragraph>
        I also learned how much one rule can change a game. The MCDM video that got me hooked didn&rsquo;t play with
        spice dialing, the rule that has you add spice to your battle wheel. I&rsquo;ve since come to see it as one of
        the important parts of Dune&rsquo;s skill ceiling.
      </Paragraph>
    </Section>
  );
}

function ImprovingSection() {
  return (
    <Section title="Improving the game we love">
      <Paragraph>
        I&rsquo;ve kept playing Dune ever since, and my ambition has always been to fix the rule set I play with the
        people I like to play with.
      </Paragraph>
      <Figure
        imageKey={meta.cover.key}
        alt={meta.cover.alt}
        aspect={meta.cover.aspect}
        caption={
          <>
            My attempt at making my own{' '}
            <Anchor href="https://steamcommunity.com/sharedfiles/filedetails/?id=2859509846" inherit target="_blank">
              Dreamrules TTS mod
            </Anchor>
            .
          </>
        }
      />
      <Paragraph>
        But I also love sharing and experimenting. GF9 started releasing FAQ documents that explained, and sometimes
        quietly changed, their rules. Meanwhile the group I played with started writing a rule set of our own:{' '}
        <Anchor
          renderRoot={(props) => <Link {...props} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: 'dreamrules' }} />}
        >
          Dreamrules
        </Anchor>
        .
      </Paragraph>
      <Paragraph>
        Dreamrules was a group effort, and I played a small part in writing it. Where I couldn&rsquo;t let go was how
        the game looked. Changing the rules meant changing the pieces, and for a while that meant tokens and cards
        scribbled over in MS Paint.
      </Paragraph>
      <Paragraph>
        I didn&rsquo;t want to play with that. I wanted the board, the cards, the tokens and the rulebook to look like
        they belonged together, as if Dreamrules had come out of the same box as everything else.
      </Paragraph>
      <Surface padding="lg">
        <Paragraph>
          I also wanted a{' '}
          <Anchor href="https://www.tabletopsimulator.com/" inherit>
            Tabletop Simulator
          </Anchor>{' '}
          mod, in which all those assets could be used together seamlessly, which I'll talk about in a future post.
        </Paragraph>
      </Surface>
      <Figure
        imageKey="/web/blog/why-dune/dream-rulebook.jpg"
        alt="The cover of the Dream Rulebook: a sandworm rising beneath a rainbow sky and two moons"
        aspect={1784 / 1792}
        caption={
          <>
            The{' '}
            <Anchor
              renderRoot={(props) => (
                <Link
                  {...props}
                  to="/rulesets/$rulesetSlug/rulebooks/$rulebookSlug"
                  params={{ rulesetSlug: 'dreamrules', rulebookSlug: 'dream-rulebook' }}
                />
              )}
              inherit
            >
              Dream Rulebook
            </Anchor>{' '}
            on dune.zone today.
          </>
        }
      />
    </Section>
  );
}
