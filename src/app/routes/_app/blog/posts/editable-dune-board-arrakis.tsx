import { Section } from '@ui/block/Section';

import { BulletList, Figure, Lead, Paragraph, PostLink, WideFigure } from '../postContent';
import { ArrakisCopies } from './board/ArrakisCopies';
import { SharedLines } from './board/SharedLines';

export default function Post() {
  return (
    <>
      <Lead>
        Arrakis is the one thing every game of Dune shares. On dune.zone it turns up all over the place: on the homepage
        table, in the glossary, in the tutorials, on every Spice card, in Rulebook illustrations and on the game table.
        For a long time, each of those places kept its own copy of the map.
      </Lead>
      <Paragraph>
        Since last week they all draw the same one: a saved board called Arrakis Official, which you can open in the
        board editor like any other asset.
      </Paragraph>
      <Figure
        imageKey="/web/blog/editable-dune-board-arrakis/homepage-table.jpg"
        alt="The homepage game table on dune.zone: the Arrakis board with troops, faction tokens and another player's hand"
        aspect={606 / 2048}
        caption="The table on the homepage, drawn from the saved Arrakis board."
      />
      <CopiesSection />
      <EditorSection />
      <NamesSection />
      <PublishSection />
      <StepsSection />
      <PagesSection />
      <GamesSection />
    </>
  );
}

function CopiesSection() {
  return (
    <Section title="One desert, several copies">
      <Paragraph>
        Every part of the site that needed Arrakis had ended up with its own version of it, shaped for what that part
        had to do.
      </Paragraph>
      <BulletList>
        <li>Spice cards drew a fixed picture of the map and lit territories from a set list of highlight groups.</li>
        <li>
          Rulebook illustrations had their own description of every territory&rsquo;s shape: 1,324 lines of JSON, and an
          SVG made from it.
        </li>
        <li>The game table had its own drawing of the board.</li>
        <li>The homepage, the glossary and the tutorials borrowed one of those.</li>
      </BulletList>
      <Paragraph>
        They mostly agreed. When they were finally lined up side by side, one territory turned out to be called{' '}
        <code>greater-flat</code> in the Rulebooks, where everything else said <code>the-greater-flat</code>.
      </Paragraph>
      <Paragraph>
        Copies like these also meant a board could only ever be Arrakis. dune.zone is built for homebrew, and a homebrew
        map had nowhere to go.
      </Paragraph>
      <WideFigure caption="Before, each part of the site kept its own Arrakis. Now one saved board feeds them all.">
        <ArrakisCopies />
      </WideFigure>
    </Section>
  );
}

function EditorSection() {
  return (
    <Section title="Drawing a board from shared lines">
      <Paragraph>
        The board editor arrived in October. A board is a circle. You draw dividing lines across it, and every closed
        area between the lines and the rim becomes a territory. A line belongs to both territories it separates, so two
        neighbours can never disagree about where their border is.
      </Paragraph>
      <Paragraph>
        Then you give each territory a name and a type: sand, rock, stronghold or polar. The type sets its colour and
        outline. A territory can get an inset line, and decals such as a city or a sietch that you place, scale and
        turn. An optional guide shows the 18 storm sectors, and points can snap to it.
      </Paragraph>
      <Paragraph>
        Arrakis is drawn the same way. The preset has 42 territories, with the enclosed strongholds, the Polar Sink and
        the curved borders of the printed map. The aim was to match the existing map exactly, not to make a simpler
        version of it.
      </Paragraph>
      <Figure
        imageKey="/web/blog/editable-dune-board-arrakis/arrakis-official.jpg"
        alt="The published Arrakis Official board: sand and rock territories, five strongholds with city and sietch decals, and the white Polar Sink in the middle"
        aspect={1}
        caption="Arrakis Official as the site publishes it. The picture is made from the saved lines, not drawn by hand."
      />
    </Section>
  );
}

function NamesSection() {
  return (
    <Section title="What a territory's name promises">
      <Paragraph>
        Spice cards point at territories by name, so names needed rules that hold up while someone is still drawing.
      </Paragraph>
      <BulletList>
        <li>
          Every territory has a readable name, and the site makes an id from it: Hagga basin becomes{' '}
          <code>hagga_basin</code>.
        </li>
        <li>
          Cut a territory in two and one half keeps the name. It&rsquo;s always picked in the same order, so the same
          edit gives the same result. The other half gets a new name, which you can change.
        </li>
        <li>Remove a line and the two territories merge. The first one keeps its name, and the other name is gone.</li>
        <li>
          Rename a territory and nothing else is rewritten. A Spice card keeps the id it was made with. If that id is
          gone, the card doesn&rsquo;t light it, and the card&rsquo;s page tells you.
        </li>
        <li>
          A line that doesn&rsquo;t close anything yet is fine. It&rsquo;s saved and drawn, it just makes no territory.
        </li>
      </BulletList>
      <Paragraph>
        The renaming rule is deliberate. A board and the cards that use it can belong to different people, and editing
        your board should never quietly change someone else&rsquo;s card.
      </Paragraph>
      <WideFigure caption="Step through a cut, a merge and a rename, and watch what the Spice card lights.">
        <SharedLines />
      </WideFigure>
    </Section>
  );
}

function PublishSection() {
  return (
    <Section title="Save the board, and the cards follow">
      <Paragraph>
        Boards publish like every other asset on dune.zone: saving is publishing. When a board changes, every Spice card
        linked to it is drawn again by itself. Each card is its own job, so a card that fails doesn&rsquo;t hold up the
        board or the other cards. It keeps its last good picture and tries again.
      </Paragraph>
      <Paragraph>
        Rulebooks work differently on purpose. A published Rulebook edition, with its HTML and PDF, is a snapshot of the
        day it was published, and a board change leaves it alone. The next edition the author publishes picks up the new
        board.
      </Paragraph>
      <Figure
        imageKey="/web/blog/editable-dune-board-arrakis/spice-cards.jpg"
        alt="Twelve Spice cards from dune.zone, each with a small Arrakis map and its territory lit: The Great Flat, Hagga Basin, Gaia Kulon, Cielago West and more"
        aspect={924 / 2048}
        caption="Spice cards on dune.zone, each lit on the saved Arrakis board."
      />
    </Section>
  );
}

function StepsSection() {
  return (
    <Section title="Moving everything without breaking a card">
      <Paragraph>
        People already had Spice cards and Rulebooks that pointed at the old map, so the move happened in steps.
      </Paragraph>
      <BulletList>
        <li>On 8 October the board editor shipped next to the old copies, and nothing else moved.</li>
        <li>
          By November most Spice cards were already linked to the saved board. On 4 November a migration moved the rest.
          Before it ran, a dry run over the live data showed exactly what it would do: 17 of the 28 Spice cards would
          change, and 70 board references across the current editions of 4 Rulebooks would be renamed. A second pass
          changed nothing. The two Spice cards that had never been linked to a board kept their highlights and look the
          same as before. Published Rulebook HTML and PDF files were left as they were.
        </li>
        <li>
          On 5 November the built-in map came out, together with the old Rulebook geometry and the table&rsquo;s own
          board drawing. That change removed close to 3,500 lines.
        </li>
        <li>On 6 November the homepage, the glossary and the tutorials switched over to the saved board.</li>
      </BulletList>
    </Section>
  );
}

function PagesSection() {
  return (
    <Section title="The homepage, glossary and tutorials follow along">
      <Paragraph>
        These pages have no game of their own to choose a board, so they follow Arrakis Official. Edit it in the board
        editor and save, and the homepage table, the <PostLink to="/glossary">glossary</PostLink> lessons and the
        tutorial tables change with it.
      </Paragraph>
      <Paragraph>
        The board also comes with the page itself. The server puts it into the HTML, so the map is there as soon as the
        page loads. That adds about 200 KB to each of these pages before compression; the whole homepage still gzips to
        about 76 KB.
      </Paragraph>
      <Paragraph>
        The homepage table is a live room, the same kind a real game runs in. It reads the board when it starts and
        keeps it with the table. If that read fails, it tries again every ten minutes.
      </Paragraph>
      <Figure
        imageKey="/web/blog/editable-dune-board-arrakis/glossary-board.jpg"
        alt="The board section of the dune.zone glossary: entries for territory, sector and stronghold beside the Arrakis map, with one stronghold lit in red"
        aspect={853 / 2048}
        caption="The glossary teaches territories, sectors and strongholds on the saved board."
      />
    </Section>
  );
}

function GamesSection() {
  return (
    <Section title="Every game plays on its own board">
      <Paragraph>
        Real games work a little differently. A ruleset chooses its board, and every new game keeps the board its
        ruleset had when the game began. Games from before rulesets had boards play on a copy of Arrakis that ships with
        the site, the same data that is published as Arrakis Official, so no saved game lost its map.
      </Paragraph>
      <Paragraph>
        Which brings it back to homebrew. Arrakis is now one board among others, made with the same editor anyone with
        an account can use. If your group plays on a different map, you can draw it, give it to your ruleset, and light
        its territories on your own Spice cards and in your Rulebooks.
      </Paragraph>
      <Figure
        imageKey="/web/blog/editable-dune-board-arrakis/board-editor.jpg"
        alt="The dune.zone board editor with Arrakis loaded: every shared line shown with its points, the 18 storm sectors as dashed guides, and Arrakeen selected in the territory panel"
        aspect={1627 / 2048}
        caption="Arrakis in the board editor. Every dot is a point on a shared line, and the panel is editing Arrakeen."
      />
    </Section>
  );
}
