import { Section } from '@ui/block/Section';

import { Figure, Lead, Paragraph, PostLink, WideFigure } from '../postContent';
import { TutorialEmbed } from '../TutorialEmbed';
import { ChapterTiles } from './tutorial/ChapterTiles';
import { ConfettiButton } from './tutorial/ConfettiButton';
import { LocalTable } from './tutorial/LocalTable';

export default function Post() {
  return (
    <>
      <Lead>
        The tutorial on dune.zone is a little bossy. There&rsquo;s no Next button to click through. It won&rsquo;t move
        on until you&rsquo;ve actually picked up the troop, dealt the cards or sent the message.
      </Lead>
      <Paragraph>
        That&rsquo;s on purpose. I wanted a tutorial that really teaches, so I went looking for every place where it
        could make you stop, read and act. And at the end of every chapter there&rsquo;s confetti. That&rsquo;s on
        purpose too.
      </Paragraph>
      <Paragraph>
        You don&rsquo;t have to take my word for it. This is the first chapter, running right here in the post:
      </Paragraph>
      <WideFigure caption="Chapter 1, Welcome. Click into it and press Enter.">
        <TutorialEmbed src="/tutorial/welcome" title="The Welcome chapter of the tutorial" />
      </WideFigure>
      <ChaptersSection />
      <DoingSection />
      <BrowserSection />
      <PlayersSection />
      <AloudSection />
      <ConfettiSection />
      <CreatingSection />
      <TestedSection />
      <ClosingSection />
    </>
  );
}

function ChaptersSection() {
  return (
    <Section title="Twenty-one bite-sized chapters">
      <Paragraph>
        There are 21 chapters, and none of them takes more than six minutes. Together they follow a new player from
        finding a game to declaring a winner, with moving pieces, dealing cards, bidding and battles along the way. Play
        them in order, or jump to the one that&rsquo;s bugging you. Battle plans a mystery? That&rsquo;s chapter 16.
      </Paragraph>
      <Paragraph>
        What the tutorial never teaches is the rules of Dune. The table is a sandbox, and the rules are whatever your
        group plays with. The tutorial only teaches the table.
      </Paragraph>
      <WideFigure caption="All 21 of them. Scroll sideways, and click any tile to play that chapter.">
        <ChapterTiles />
      </WideFigure>
    </Section>
  );
}

function DoingSection() {
  return (
    <Section title="No Next button">
      <Paragraph>
        Every chapter is a short list of tasks, and the only way to tick one off is to do it. Drag a troop onto the
        board and the chapter sees it land. If it asked you to carry the whole stack and you only took the top troop, it
        waits. Even when a task just wants to tell you something, you press Enter to go on, so it never runs ahead of
        your reading.
      </Paragraph>
      <Paragraph>
        I also split things up more than you might expect. Opening the game menu is one task. Copying the game link is
        the next one. One action at a time, so each one sticks.
      </Paragraph>
      <Paragraph>
        Getting people to read turned out to be the hard part. The first version put each task in a thin band across the
        top of the screen, with a long arrow down to the target. Testers looked straight at the board and never read the
        band, and that long arrow looked comical. So the tasks moved to a checklist down the left, in big type, where
        you read them before your eyes go to the board.
      </Paragraph>
      <WideFigure caption="Chapter 7, Moving pieces. Your first job is a single troop.">
        <TutorialEmbed src="/tutorial/moving-pieces" title="The Moving pieces chapter of the tutorial" />
      </WideFigure>
      <Paragraph>
        If the thing it wants is off screen, the arrow points the way. Forgot what a step said? Click it and read it
        again. Made a mess of the board? Reset gives you a fresh table.
      </Paragraph>
    </Section>
  );
}

function BrowserSection() {
  return (
    <Section title="The real table, in your tab">
      <Paragraph>
        A tutorial could get away with a fake table that only knows the moves it&rsquo;s about to teach. This one runs
        the real thing. The table code that referees every{' '}
        <PostLink to="/blog/$postSlug" params={{ postSlug: 'playing-dune-online-in-real-time' }}>
          online game
        </PostLink>{' '}
        on the server runs inside your browser tab instead.
      </Paragraph>
      <Paragraph>
        Your moves go to it exactly the way they would go to the server. It just happens to live in the same tab, and it
        keeps the game in memory instead of in a database. Nothing goes over the internet, and you don&rsquo;t need an
        account. So when a stack splits or a card flips in a chapter, it behaves exactly like it will in your first real
        game. Same code, same call.
      </Paragraph>
      <WideFigure caption="The same table code in both. In a real game it sits in the room on Cloudflare. In the tutorial it sits in your tab.">
        <LocalTable />
      </WideFigure>
      <Paragraph>
        Every chapter starts from one recorded game: the six original factions, playing the Dreamrules. We recorded it
        by playing a script against the real game server and saving the table at three moments: the draft, setup and
        turn one. Some chapters go further. Before you even see the table in the Battle chapter, the other players have
        already played the game forward to the battle phase.
      </Paragraph>
    </Section>
  );
}

function PlayersSection() {
  return (
    <Section title="Your practice opponents">
      <Paragraph>
        You&rsquo;re never alone at the table. The other seats are filled by practice players wearing the names and
        faces of real dune.zone profiles. They bid, they pass, they move the game on. One playtester went off script in
        the Bidding chapter and got the round stuck, so now the practice players keep the bidding going whatever you do.
      </Paragraph>
      <Paragraph>
        They also talk back. Testers kept typing into the chat, and their messages just sat there, pending forever. A
        chat that never answers isn&rsquo;t much of a lesson, so now whoever you message replies a moment later. Say hi
        to House Atreides in the Talking &amp; Alliances chapter and they&rsquo;ll say hi back. Offer them an alliance
        and they&rsquo;ll take it.
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
    <Section title="Eyes on the board">
      <Paragraph>
        Press Z and the tutorial reads every task out loud, so you can keep your eyes on the board. It uses your
        browser&rsquo;s own voice, so it costs nothing. It even says the keys properly: you hear &ldquo;the H key&rdquo;
        or &ldquo;left arrow&rdquo;, not a pair of curly brackets. Turn it on once and it stays on for every chapter.
      </Paragraph>
    </Section>
  );
}

function ConfettiSection() {
  return (
    <Section title="Confetti, obviously">
      <Paragraph>
        Finish a chapter and the table goes quiet, confetti fires in from both corners of the screen, and a card lists
        what you just learned. The lines hop in one at a time, like tokens dropped on the board. The button to the next
        chapter shows up last, so you read the list before you move on.
      </Paragraph>
      <Paragraph>
        Why confetti? A little reward goes a long way. I added it to spark some joy, so learning feels good and you keep
        going to the next chapter.
      </Paragraph>
      <Figure
        imageKey="/web/blog/learn-to-play-dune-online/chapter-complete.jpg"
        alt="The end of the Welcome chapter: a Chapter complete card listing six things the player learned, above a button to the next chapter"
        aspect={1280 / 2048}
        caption="The end of the Welcome chapter, with everything you learned in it."
      />
      <Paragraph>You don&rsquo;t have to finish a chapter to get some, though. Go on, press it:</Paragraph>
      <ConfettiButton />
    </Section>
  );
}

function CreatingSection() {
  return (
    <Section title="Make a faction, safely">
      <Paragraph>
        dune.zone isn&rsquo;t only for playing. People make their own factions, cards and rulebooks here, so
        there&rsquo;s a second set of tutorials at <PostLink to="/create">dune.zone/create</PostLink>. The first one is
        Create a faction: 29 small steps from an empty sheet to a saved faction with its own page.
      </Paragraph>
      <Paragraph>
        Saving a faction writes to the site&rsquo;s real database, and a tutorial shouldn&rsquo;t fill that up with
        practice Sand Wardens. So this one runs on a practice copy of the whole site, inside your browser, with its own
        little database. Every button works. Close the tab and your practice faction is gone.
      </Paragraph>
      <WideFigure caption="Create a faction, live. Go ahead, give it a name.">
        <TutorialEmbed src="/create/faction" title="The Create a faction tutorial" />
      </WideFigure>
      <Paragraph>
        Fourteen more creator tutorials are on the way, from making a card to laying out a rulebook.
      </Paragraph>
    </Section>
  );
}

function TestedSection() {
  return (
    <Section title="Played on every change">
      <Paragraph>
        The table changes a lot, and a tutorial pointing at a button that moved last week is worse than no tutorial. So
        every chapter doubles as an automated test. On every change to dune.zone, a browser plays each chapter from
        start to finish, doing every task the way you would. If a chapter breaks, the change waits until it&rsquo;s
        fixed.
      </Paragraph>
    </Section>
  );
}

function ClosingSection() {
  return (
    <Section title="Your seat is ready">
      <Paragraph>
        If you&rsquo;ve been meaning to try a game on dune.zone, this is the quickest way in, and you don&rsquo;t even
        need an account. Start with{' '}
        <PostLink to="/tutorial/$chapter" params={{ chapter: 'welcome' }}>
          Welcome
        </PostLink>
        . Or skip straight to{' '}
        <PostLink to="/tutorial/$chapter" params={{ chapter: 'battle' }}>
          Battle
        </PostLink>
        , where you play the Fremen and Atreides is already waiting for you in Arrakeen.
      </Paragraph>
      <Figure
        imageKey="/web/blog/learn-to-play-dune-online/meet-in-arrakeen.jpg"
        alt="The Battle chapter: the task Meet in Arrakeen on the left, with an arrow pointing at troops beside the board"
        aspect={1280 / 2048}
        caption="The Battle chapter starts here. Bring your troops to Arrakeen."
      />
    </Section>
  );
}
