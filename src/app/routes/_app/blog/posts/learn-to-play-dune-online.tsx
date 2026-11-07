import { Section } from '@ui/block/Section';

import { Figure, Lead, Paragraph, PostLink, WideFigure } from '../postContent';
import { LocalTable } from './tutorial/LocalTable';

export default function Post() {
  return (
    <>
      <Lead>
        A game table that can do a lot is also a table with a lot to learn. Which key lifts a whole stack? Where did my
        hand go? How do I put a leader in my battle plan? The dune.zone game table now has a tutorial that answers those
        questions by letting you try them.
      </Lead>
      <Paragraph>
        It lives at <PostLink to="/tutorial">dune.zone/tutorial</PostLink>, it&rsquo;s free, and you don&rsquo;t need an
        account. Here is what&rsquo;s in it, and how it works.
      </Paragraph>
      <Figure
        imageKey="/web/blog/learn-to-play-dune-online/meet-arrakis.jpg"
        alt="The first chapter of the dune.zone tutorial: a list of tasks on the left, and an arrow pointing at the centre of the Arrakis board"
        aspect={1280 / 2048}
        caption="The Welcome chapter. The task is on the left, and the arrow shows where to look."
      />
      <ChaptersSection />
      <DoingSection />
      <BrowserSection />
      <PlayersSection />
      <AloudSection />
      <CreatingSection />
      <TestedSection />
      <ClosingSection />
    </>
  );
}

function ChaptersSection() {
  return (
    <Section title="Twenty-one short chapters">
      <Paragraph>
        The tutorial has 21 chapters, and each one takes between two and six minutes. They follow the path a new player
        takes. First you get into a game: create one or join a friend&rsquo;s, take a seat and draft a faction. Then you
        learn the table itself: looking around, moving pieces, windows, your hand, decks and what goes where. After that
        come the parts of a game, from setup and bidding to battle and declaring a winner. The last few chapters cover
        the extras, like the private side-table, bringing your own pieces and Mentat recall.
      </Paragraph>
      <Paragraph>
        You can follow them in order, or jump straight to the one you need. Each chapter teaches how the table works,
        never the rules of Dune. The table is a sandbox, so the rules are whatever your group plays with.
      </Paragraph>
      <Figure
        imageKey="/web/blog/learn-to-play-dune-online/chapter-tiles.jpg"
        alt="The Learn to play page: chapter tiles in rows, each with a picture, a number, a title, a one-line goal and the minutes it takes"
        aspect={1036 / 2048}
        caption="The first two parts of the Learn to play page. Every tile says what you&rsquo;ll be able to do and how long it takes."
      />
    </Section>
  );
}

function DoingSection() {
  return (
    <Section title="Learning by doing">
      <Paragraph>
        There is no Next button. Each chapter is a list of small tasks, and a task is done when you&rsquo;ve actually
        done it on the table. Drag a troop from your reserves onto the board, and the chapter sees that troop land and
        moves on. Hold a stack before you drag it, and it checks that the whole stack went with you.
      </Paragraph>
      <Paragraph>
        An arrow runs from the task to the thing you need, whether that&rsquo;s a troop on the board, a button or a
        window. When the target is out of view, the arrow points the way. Done tasks stay in the list, so you can open
        one again and reread it. Reset starts the chapter over on a fresh table.
      </Paragraph>
      <Figure
        imageKey="/web/blog/learn-to-play-dune-online/move-a-troop.jpg"
        alt="The Moving pieces chapter: the task Move a troop on the left, with an arrow reaching across the board to the blue troop reserves"
        aspect={1280 / 2048}
        caption="Moving pieces starts with one troop. The arrow points at your reserves."
      />
      <Paragraph>
        Every chapter ends with a short list of what you just learned, with the keys you used, so you can come back to
        it later.
      </Paragraph>
    </Section>
  );
}

function BrowserSection() {
  return (
    <Section title="A real game table, inside your browser">
      <Paragraph>
        In a{' '}
        <PostLink to="/blog/$postSlug" params={{ postSlug: 'playing-dune-online-in-real-time' }}>
          real game
        </PostLink>
        , every move goes to that game&rsquo;s room on Cloudflare, which checks it, saves it and tells everyone at the
        table. A tutorial could fake all of that with a pretend table. Instead, the tutorial runs the room&rsquo;s own
        table code right inside your browser tab.
      </Paragraph>
      <Paragraph>
        Your browser talks to it just as it would talk to the real room. The difference is that the answer comes from
        the same tab, and the table keeps its saved state in memory instead of a database. Nothing goes over the
        internet. So the pieces you move in a chapter behave exactly like the pieces in a real game, because the same
        code decides what happens to them.
      </Paragraph>
      <WideFigure caption="The same table code runs in both. In a real game it sits in the room on Cloudflare. In the tutorial it sits in your tab.">
        <LocalTable />
      </WideFigure>
      <Paragraph>
        Every chapter starts from the same game: the six original factions, playing the Dreamrules. That game was
        recorded by playing a short script on the real game server and saving the table at three stops: the draft, setup
        and the first turn. A chapter opens at the stop it needs, and the other players can move it along from there. In
        the Battle chapter, they play the game forward to the battle phase before you see the table.
      </Paragraph>
    </Section>
  );
}

function PlayersSection() {
  return (
    <Section title="You&rsquo;re not alone at the table">
      <Paragraph>
        The other seats are taken by practice players. They borrow the names and pictures of real public profiles on
        dune.zone, and they play their part. In the Bidding chapter they raise and pass. Their moves go through the same
        table code as yours.
      </Paragraph>
      <Paragraph>
        They answer you too. People who tried an early version typed messages into the chat and waited, and the message
        just sat there. Now a message you send is marked as sent, and a moment later the player you wrote to replies. In
        the Talking &amp; Alliances chapter, Atreides even accepts your alliance.
      </Paragraph>
      <Figure
        imageKey="/web/blog/learn-to-play-dune-online/chat-reply.jpg"
        alt="A private chat in the tutorial: the learner&rsquo;s message is marked Sent, and the Atreides player has replied below it"
        aspect={1800 / 1600}
        caption="Say hello to House Atreides, and House Atreides says hello back."
      />
    </Section>
  );
}

function AloudSection() {
  return (
    <Section title="Read aloud">
      <Paragraph>
        It&rsquo;s easier to follow a task when your eyes can stay on the table. Press Z and the tutorial reads each
        task aloud as it comes up. It uses the voice built into your browser, so it costs nothing and needs no server.
        Keys are read by name, so you hear &ldquo;the H key&rdquo; or &ldquo;left arrow&rdquo; instead of a symbol.
        Press Z again and it&rsquo;s quiet.
      </Paragraph>
    </Section>
  );
}

function CreatingSection() {
  return (
    <Section title="A tutorial for making things, too">
      <Paragraph>
        dune.zone is also where people make their own factions, cards and rulebooks, so there&rsquo;s a second set of
        tutorials for that at <PostLink to="/create">dune.zone/create</PostLink>. The first one is ready: Create a
        faction. In 29 small tasks you name a faction, pick its emblem, give it leaders and troops, write its rules,
        save it and visit its page.
      </Paragraph>
      <Paragraph>
        Creating a faction means saving to the site&rsquo;s database, which a tutorial shouldn&rsquo;t touch. So this
        one runs on a practice copy of dune.zone that lives in your browser, with its own little database. You&rsquo;re
        on the real faction editor, with every button working, and when you close the page the copy is gone.
      </Paragraph>
      <Figure
        imageKey="/web/blog/learn-to-play-dune-online/create-a-faction.jpg"
        alt="The Create a faction tutorial: the task Name your faction on the left, and an arrow pointing at the empty Faction name field of the faction editor"
        aspect={1280 / 2048}
        caption="The Create a faction tutorial runs on the real editor, in a practice copy of the site."
      />
      <Paragraph>
        Fourteen more creator tutorials are planned, from making a card to laying out a rulebook. They&rsquo;ll go up
        one at a time.
      </Paragraph>
    </Section>
  );
}

function TestedSection() {
  return (
    <Section title="Kept working">
      <Paragraph>
        The table changes often, and a tutorial that points at a button that moved is worse than no tutorial. So every
        chapter is also an automated test. On every change to dune.zone, a browser plays each chapter from start to end,
        doing every task the way a player would. If a chapter can no longer be finished, the change doesn&rsquo;t go
        out.
      </Paragraph>
    </Section>
  );
}

function ClosingSection() {
  return (
    <Section title="Pick a chapter">
      <Paragraph>
        If you&rsquo;ve been meaning to try a game on dune.zone, the tutorial is the quickest way in. Start with{' '}
        <PostLink to="/tutorial/$chapter" params={{ chapter: 'welcome' }}>
          Welcome
        </PostLink>
        , or go straight to{' '}
        <PostLink to="/tutorial/$chapter" params={{ chapter: 'battle' }}>
          Battle
        </PostLink>
        , where you play Fremen and Atreides is waiting for you in Arrakeen.
      </Paragraph>
      <Figure
        imageKey="/web/blog/learn-to-play-dune-online/meet-in-arrakeen.jpg"
        alt="The Battle chapter: the task Meet in Arrakeen on the left, with an arrow pointing at troops beside the board"
        aspect={1280 / 2048}
        caption="The Battle chapter starts here: bring your troops to Arrakeen."
      />
    </Section>
  );
}
