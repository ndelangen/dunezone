import { Section } from '@ui/block/Section';

import { Figure, FigureRow, Lead, Paragraph, PostLink } from '../postContent';

const FOLDER = '/web/blog/mentat-recall-online-dune-game-history';

export default function Post() {
  return (
    <>
      <Lead>
        Dune is a game of memory. Spice sits behind your shield, Treachery cards go face down into your hand, and the
        discard pile is not yours to search. Whatever you remember about the last three turns, you remember on your own.
      </Lead>
      <Paragraph>
        An online table remembers everything, though. Every phase of every game on dune.zone is saved, so the site could
        show you any earlier moment with a click. That is very handy when someone knocks a troop out of Carthag by
        accident, and a problem when it turns into a notebook nobody at a real table would be allowed to keep.
      </Paragraph>
      <Paragraph>
        Mentat recall is how dune.zone handles both: the whole table looks back together, or nobody does.
      </Paragraph>
      <Figure
        imageKey={`${FOLDER}/recall-table.jpg`}
        alt="The dune.zone game table during a Mentat recall: the board in cool blue tones with a faint diagonal Mentat recall pattern, two players' pointers on the board and the Shared history slider at the bottom"
        aspect={1280 / 2048}
        caption="A table in Mentat recall. The board is frozen at an earlier checkpoint, and everyone sees the same one."
      />
      <NotesSection />
      <AskSection />
      <FreezeSection />
      <CheckpointSection />
      <ShieldSection />
      <ChatSection />
      <NameSection />
      <AfterSection />
    </>
  );
}

function NotesSection() {
  return (
    <Section title="No notes at the table">
      <Paragraph>
        Tournament Dune is strict about this. The house rules at the World Boardgaming Championships say no player may
        record notes, with one exception: Atreides may write down who holds which card, which is their faction&rsquo;s
        power. The Gale Force Nine rulebook adds that discard piles are not public and may not be searched.
      </Paragraph>
      <Paragraph>
        A replay you can open during a game breaks both rules at once. You could step back through the bidding to see
        who bought which card, add up every spice payment to know an opponent&rsquo;s exact reserve, or read every
        battle plan to spot which leaders a faction never sends. That is the Atreides power, handed to everyone.
      </Paragraph>
      <Paragraph>
        So since the end of October, the game room refuses history while a game is running. Not by hiding a button: the
        room itself won&rsquo;t send an earlier checkpoint to anyone, seated or watching, until a winner is declared.
      </Paragraph>
    </Section>
  );
}

function AskSection() {
  return (
    <Section title="Asking the table">
      <Paragraph>
        Dune Zone is a sandbox. It doesn&rsquo;t enforce the rules, so pieces get dropped in the wrong territory and
        sometimes nobody notices until a turn later. &ldquo;I had six troops there before the storm, not four&rdquo; is
        a fair thing to want to check. At a real table you would all lean over the board and work it out together.
        Mentat recall does the same thing online.
      </Paragraph>
      <Paragraph>
        Any seated player can open Mentat recall from the controls and pick one of the 30 most recent checkpoints. That
        is far enough back to settle what just happened, and not far enough to rebuild the whole game.
      </Paragraph>
      <Figure
        imageKey={`${FOLDER}/ask.jpg`}
        alt="The table controls opened over the board, with Mentat recall typed into the search and a match listed under History"
        aspect={800 / 1960}
        caption="Mentat recall lives in the table controls, under History."
      />
      <Paragraph>
        The request shows up in everyone&rsquo;s header with Agree and Decline. Once a majority of the seated players
        agree, the asker included, the recall starts for the whole table. In a game of four that means three players; in
        a game of six, four. The asker can withdraw while the vote is open, and every request, refusal and recall is
        written to the table&rsquo;s Audit log.
      </Paragraph>
      <Figure
        imageKey={`${FOLDER}/vote.jpg`}
        alt="The game header reading: Central asks to Mentat recall Turn 1, Bidding (1 of 4 agreed), with Agree and Decline buttons"
        aspect={560 / 1640}
        caption="Everyone else answers from the header."
      />
    </Section>
  );
}

function FreezeSection() {
  return (
    <Section title="The table freezes">
      <Paragraph>
        When the vote passes, every screen at the table jumps to the chosen checkpoint, spectators included. The board
        cools to blue and grey with a slow diagonal pattern, so nobody mistakes the past for the game in progress.
      </Paragraph>
      <FigureRow
        figures={[
          {
            imageKey: `${FOLDER}/live-table.jpg`,
            alt: 'The game table during play in its normal warm sand colours',
            aspect: 1280 / 2048,
            caption: 'The live table.',
          },
          {
            imageKey: `${FOLDER}/recall-table.jpg`,
            alt: 'The same table in Mentat recall, in cool blue and grey tones',
            aspect: 1280 / 2048,
            caption: 'The same table, recalled.',
          },
        ]}
      />
      <Paragraph>
        Nothing on the table can change while it is recalled. The room turns down every move, peek and phase step, and a
        piece someone was holding goes back to where it was. A running bidding or battle timer pauses and picks up with
        the time it had left.
      </Paragraph>
      <Paragraph>
        Everything that isn&rsquo;t the game still works. You can move your camera, point at things and ping a
        territory, which is most of what you need to argue about it. Any seated player can slide the table to another
        checkpoint, and everyone follows. When you&rsquo;re done, any seated player presses Return to the game, and play
        carries on exactly where it stopped.
      </Paragraph>
    </Section>
  );
}

function CheckpointSection() {
  return (
    <Section title="Where the checkpoints come from">
      <Paragraph>
        The room doesn&rsquo;t save a checkpoint for every move. It saves one when the table enters a phase or setup
        step, when a battle is settled, when a faction finishes its Shipment and Movement, and when a result is declared
        or continued. Each one is named the way the game log names it, like &ldquo;Turn 2, Battle&rdquo; or &ldquo;Turn
        3, Shipment and Movement, after Fremen&rdquo;, and the slider marks the start of each turn.
      </Paragraph>
      <Paragraph>
        That adds up to more than a dozen checkpoints a turn, so the 30 a recall offers during a game reach back a turn
        or two. Here is the same eleven-turn game in the checkpoint picker, first while it is being played and then once
        it is over.
      </Paragraph>
      <FigureRow
        figures={[
          {
            imageKey: `${FOLDER}/checkpoints-during.jpg`,
            alt: 'The checkpoint picker during a game: the slider covers only the end of Turn 10 and Turn 11, ending at Turn 11, Battle, after battle 1',
            aspect: 270 / 820,
            caption: 'During the game: the 30 most recent checkpoints.',
          },
          {
            imageKey: `${FOLDER}/checkpoints-after.jpg`,
            alt: 'The checkpoint picker after the game: the slider runs from Turn 1 to Turn 11 with a mark at every turn',
            aspect: 270 / 820,
            caption: 'After the game: every checkpoint, Turn 1 to 11.',
          },
        ]}
      />
    </Section>
  );
}

function ShieldSection() {
  return (
    <Section title="Your shield, as it was">
      <Paragraph>
        The recalled board is public: troops, spice on the board, the storm, alliances, how many cards each player
        holds. That is what everyone at a real table could see.
      </Paragraph>
      <Paragraph>
        Behind your own shield, you see your own past. Open your hand during a recall and you get the cards, leaders,
        traitors and spice your seat had at that checkpoint. Nobody else gets to see them, spectators included. The
        cards keep their normal colours, so they read as yours rather than as part of the frozen table.
      </Paragraph>
      <Figure
        imageKey={`${FOLDER}/recalled-hand.jpg`}
        alt="The Your recalled hand panel over the frozen board: 10 spice, four leaders, an alliance card and four traitor cards"
        aspect={880 / 960}
        caption="Your recalled hand: what your seat held at that checkpoint."
      />
      <Paragraph>
        That history belongs to the seat, not the person. If someone takes over a seat halfway through, they can recall
        what the faction held before they sat down, just as they would inherit the shield on a real table. The player
        who left can&rsquo;t.
      </Paragraph>
    </Section>
  );
}

function ChatSection() {
  return (
    <Section title="A chat that forgets">
      <Paragraph>
        A recall comes with its own chat, next to the table chat. It is there for the discussion itself: what the board
        showed, whose troop goes where. When the table returns to the game, that chat and any half-written messages are
        deleted, and the panels go back to where you had them. The argument doesn&rsquo;t follow you into the next
        phase.
      </Paragraph>
      <Figure
        imageKey={`${FOLDER}/recall-chat.jpg`}
        alt="The Recall chat panel with one message, Earlier position, from a Harkonnen player, above the table controls"
        aspect={560 / 1200}
        caption="Recall chat is separate from the table chat and disappears when play resumes."
      />
    </Section>
  );
}

function NameSection() {
  return (
    <Section title="Why Mentat">
      <Paragraph>
        The first version of this was called Table review, which describes it well and is easy to forget. In Dune,
        Mentats are people trained to think like computers and remember everything, like Thufir Hawat for the Atreides
        and Piter De Vries for the Harkonnen. A Mentat recall is the table borrowing that memory for a moment, on the
        condition that everyone looks at the same thing.
      </Paragraph>
      <Paragraph>
        The <PostLink to="/tutorial">tutorial</PostLink> has a chapter of its own for it, on a practice table with three
        turns of history to slide through.
      </Paragraph>
    </Section>
  );
}

function AfterSection() {
  return (
    <Section title="After the last turn">
      <Paragraph>
        At a playtest on 3 November, the suggestion came up to offer Mentat recall after the game too. The rules about
        notes are there to protect a game in progress, and once a winner is declared there is nothing left to protect.
      </Paragraph>
      <Paragraph>
        So now, when a game ends, the Mentat recall window stays open. Any seated player can pick any checkpoint of the
        whole game, not just the last 30, and press Recall together. There is no vote. The table still looks at the same
        moment together, which is the point: going back over the battle that decided it, or the turn the alliance fell
        apart, is much more fun with the people who played it.
      </Paragraph>
      <Figure
        imageKey={`${FOLDER}/after-the-game.jpg`}
        alt="A finished game: the result panel says House Atreides and Emperor won as an alliance, and the Mentat recall window offers a Recall together button"
        aspect={1280 / 2048}
        caption="After the game, no vote is needed. Pick a moment and recall it together."
      />
    </Section>
  );
}
