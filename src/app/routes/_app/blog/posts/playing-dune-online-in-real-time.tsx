import { Anchor } from '@mantine/core';
import { Section } from '@ui/block/Section';

import { Figure, Lead, Paragraph, PostLink, WideFigure } from '../postContent';
import { CarryRace } from './realtime/CarryRace';
import { HandRelay } from './realtime/HandRelay';
import { PatchStream } from './realtime/PatchStream';
import { RoomHub } from './realtime/RoomHub';
import { SeatLens } from './realtime/SeatLens';
import { TableInPlay } from './realtime/TableInPlay';
import { Timeline } from './realtime/Timeline';

export default function Post() {
  return (
    <>
      <Lead>
        Most of what makes the dune.zone game table feel live is invisible when it works. You see another player&rsquo;s
        hand drift across the board. You see them lift a troop and set it down in Arrakeen. Your cards stay yours.
      </Lead>
      <Paragraph>Here is what happens in between.</Paragraph>
      <Figure
        imageKey="/web/blog/building-a-dune-sandbox/game-table.jpg"
        alt="The dune.zone game table during the spice blow: the Dune board with troops, faction shields and the treachery deck"
        aspect={1019 / 2048}
        caption="The dune.zone game table. Everything on it moves in real time."
      />
      <RoomSection />
      <HandsSection />
      <CarrySection />
      <StepSection />
      <SecretsSection />
      <HistorySection />
      <OtherTablesSection />
      <ClosingSection />
    </>
  );
}

function RoomSection() {
  return (
    <Section title="One room for every game">
      <Paragraph>
        Every game on dune.zone gets its own room. A room is a small program running on Cloudflare, a so-called Durable
        Object, with its own little database. There is exactly one of them per game, and it&rsquo;s the only place that
        decides what the table looks like.
      </Paragraph>
      <Paragraph>
        When you open a game, your browser keeps a connection open to that room, and so does everyone else&rsquo;s.
        Anything you do travels to the room, the room checks it and saves it, and then it tells everyone what changed.
        The rest of the site, with its factions, rulebooks and accounts, lives in a different database. That one only
        knows which games exist and who is allowed in. It never sees a single move.
      </Paragraph>
      <WideFigure caption="One room per game. A move goes in, gets saved, and goes out to every player and spectator at the table.">
        <RoomHub />
      </WideFigure>
    </Section>
  );
}

function HandsSection() {
  return (
    <Section title="The hands you see moving">
      <Paragraph>
        Every player&rsquo;s pointer shows up on the table as a hand in their colour, with their picture below it. You
        can see someone hovering over the Treachery deck, or pointing at the territory they&rsquo;re about to ship into.
      </Paragraph>
      <Paragraph>
        Your browser sends where your pointer is on the table, at most twenty times a second. The room gathers what
        arrives for a twentieth of a second and then sends one bundle to everybody. That keeps the traffic low, but it
        also means a hand arrives in little jumps. So each browser doesn&rsquo;t put the hand straight where the last
        message said. It glides it there, closing most of the gap within a tenth of a second. Try it below, and turn the
        smoothing off to see what actually comes in over the wire.
      </Paragraph>
      <WideFigure caption="Move over the left table. The dots on the right are the positions the other player receives; the hand glides between them.">
        <HandRelay />
      </WideFigure>
      <Paragraph>
        When someone moves off the table, their hand goes away, and if their browser stops reporting for three seconds,
        the room removes it. Spectators can watch every hand, but they don&rsquo;t send one of their own.
      </Paragraph>
    </Section>
  );
}

function CarrySection() {
  return (
    <Section title="Picking up a piece">
      <Paragraph>
        Two people can reach for the same troop at the same moment. On a real table your hands would bump. Online, the
        room has to decide.
      </Paragraph>
      <Paragraph>
        When you press on a piece, your browser asks the room to start a carry. The room reserves that piece for you. If
        someone else grabs it a moment later, they get the message &ldquo;Another player is carrying that piece.&rdquo;
        While you carry it, your browser sends its position just like your pointer, and everyone sees the piece travel
        in your hand. Nothing is saved yet. Only when you let go does your browser send a drop. The room checks it,
        saves the new position, and then tells everyone where the piece landed.
      </Paragraph>
      <WideFigure caption="Atreides and Harkonnen reach for the same troop. The room gives it to whoever asked first.">
        <CarryRace />
      </WideFigure>
      <Paragraph>
        Drag a stack straight away and you take the top piece; hold it for a third of a second and you lift the whole
        stack. You can turn a card over while it&rsquo;s in your hand, and everyone sees it flip. If your connection
        drops while you&rsquo;re holding something, the piece goes back to where it was last saved.
      </Paragraph>
    </Section>
  );
}

function StepSection() {
  return (
    <Section title="Keeping every table in step">
      <Paragraph>
        Every change the room saves gets a number, one higher than the last. When your browser sends a command, it
        mentions the number it last saw. If the table has changed since, say someone else just moved the storm, the room
        asks you to try again rather than apply your move to a table you haven&rsquo;t seen. A few things, like drawing
        a card, adding spice to the board or editing your battle plan, are fine to do at the same time as someone else,
        so the room lets those through.
      </Paragraph>
      <Paragraph>
        Going the other way, the room doesn&rsquo;t send the whole table every time. When you first join, you get a full
        view. After that, each update only describes what changed since the last one the room sent your browser. Those
        updates are numbered too. If one ever goes missing, your browser notices the gap, asks for a fresh full view,
        and holds your next move until it arrives.
      </Paragraph>
      <WideFigure caption="A full view to start, then small patches. A missing patch asks for a fresh full view. Sizes measured on a test table in September.">
        <PatchStream />
      </WideFigure>
      <Paragraph>
        I measured this in September. A cursor move cost about half a kilobyte, and a quarter of that turned out to be
        leftovers that never changed, so they went. Dropping a big stack of a hundred cards used to send every card in
        the stack again. Now a saved move sends only which piece moved, where to and which way it faces.
      </Paragraph>
    </Section>
  );
}

function SecretsSection() {
  return (
    <Section title="How your cards stay yours">
      <Paragraph>
        Dune is a game of secrets. Traitors, Treachery cards, battle plans, the spice behind your shield. The easiest
        way to build a game table would be to send everyone the whole table and simply not draw the parts they
        shouldn&rsquo;t see. But then anyone who opens their browser&rsquo;s developer tools could read your hand.
      </Paragraph>
      <Paragraph>
        So the room never sends a secret to someone who isn&rsquo;t allowed to see it. Before anything leaves, it makes
        a separate copy of the table for each seat. Your copy has your cards with their faces. The copies for everyone
        else say how many Treachery cards you hold, because the rules make that public, and nothing more. A face-down
        card travels as its back only. Spectators get the public table and nothing else.
      </Paragraph>
      <WideFigure caption="One table in the room, three different copies on the way out. Switch seats to compare.">
        <SeatLens />
      </WideFigure>
      <Paragraph>
        Hiding the face isn&rsquo;t enough on its own. If a card kept the same name on the wire, you could follow it:
        that&rsquo;s the card Harkonnen drew, and now it&rsquo;s on top of the discard pile. So every card gets a
        scrambled name for each game, and shuffling a deck gives all of its cards new ones. Peeking works the same way.
        When you look at the top card of a deck, only you get its face, and everyone else sees that you peeked. Battle
        plans stay in the room until the reveal, and a card you put in a plan keeps counting in your hand until then, so
        even your opponent&rsquo;s card count can&rsquo;t give away that you&rsquo;re planning to use it.
      </Paragraph>
    </Section>
  );
}

function HistorySection() {
  return (
    <Section title="How it got here">
      <Paragraph>
        The game table started life as its own project, Dune Play, next to dune.zone. Early plans kept the table in the
        same database as the rest of the site. Dune Play&rsquo;s design then settled on one Durable Object per game, and
        that is still how it works today.
      </Paragraph>
      <Paragraph>
        In September the table moved into dune.zone, and from there it grew one piece at a time: first a shared table,
        then batched movement and numbered updates, private spice, battles, smaller updates, and later the hidden zone
        beside your hand and public card counts. Most recently, a room that has gone quiet goes to sleep while its
        players think, and wakes the moment someone moves.
      </Paragraph>
      <WideFigure caption="From its own project to the table on dune.zone today.">
        <Timeline />
      </WideFigure>
    </Section>
  );
}

function OtherTablesSection() {
  return (
    <Section title="Other tables, other choices">
      <Paragraph>
        I play on{' '}
        <PostLink to="/blog/$postSlug" params={{ postSlug: 'tabletop-simulator' }}>
          Tabletop Simulator
        </PostLink>{' '}
        and on <Anchor href="https://treachery.online">Treachery.Online</Anchor>, and both have their own good answer to
        the same problem.
      </Paragraph>
      <Paragraph>
        In Tabletop Simulator, the host&rsquo;s computer runs the table, physics and all, and everyone else follows
        along. Cards in your hand zone are hidden from the other seats. Anything you can put on a table, you can play
        with.
      </Paragraph>
      <Paragraph>
        In Treachery.Online, as its{' '}
        <Anchor href="https://github.com/ronaldossendrijver/treachery.online">README</Anchor> describes, every browser
        runs the whole game, rules included. When you act, the server checks your move against its own copy of the game
        and passes it on to everyone, and every copy plays it out the same way. Because the rules run everywhere, the
        game can tell you exactly what you&rsquo;re allowed to do.
      </Paragraph>
      <Paragraph>
        dune.zone sits somewhere between the two. Like Tabletop Simulator, it&rsquo;s a{' '}
        <PostLink to="/blog/$postSlug" params={{ postSlug: 'building-a-dune-sandbox' }}>
          sandbox
        </PostLink>
        : the room doesn&rsquo;t enforce the rules of Dune, so homebrew factions and new ideas work the day you make
        them. But like a server, the room is the referee for the things a table needs to be fair: who holds which piece,
        what got saved, and who is allowed to see what.
      </Paragraph>
    </Section>
  );
}

function ClosingSection() {
  return (
    <Section title="Pull up a chair">
      <Paragraph>
        This post stayed at the level of what you see at the table. Underneath there is a lot more: how a saved game is
        stored, how the history lets you look back at any phase, and how the code is split between the room and your
        browser. Maybe that&rsquo;s a deeper dive for a future post.
      </Paragraph>
      <WideFigure caption="A game in Shipment and Movement, with the other players' hands on the table.">
        <TableInPlay />
      </WideFigure>
    </Section>
  );
}
