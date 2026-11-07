import { Section } from '@ui/block/Section';

import { BulletList, Figure, FigureRow, Lead, Paragraph } from '../postContent';

export default function Post() {
  return (
    <>
      <Lead>
        Until now, the Dune board on dune.zone was hardcoded. Arrakis was baked into the site, and every Spice card,
        Rulebook illustration and game table drew its own copy of it. That works fine as long as everyone plays on
        Arrakis.
      </Lead>
      <Paragraph>
        Now dune.zone has a board editor. You can draw a board of your own, and Arrakis itself is just a saved board
        made with it. The whole site is ready for the craziest of homebrews.
      </Paragraph>
      <Figure
        imageKey="/web/blog/dune-board-editor/board-editor.jpg"
        alt="The dune.zone board editor with Arrakis loaded: every shared line shown with its points, the 18 storm sectors as dashed guides, and Arrakeen selected in the territory panel"
        aspect={1627 / 2048}
        caption="Arrakis in the board editor. Every dot is a point on a line, and the panel is editing Arrakeen."
      />
      <DrawingSection />
      <NamesSection />
      <ArrakisSection />
      <NextSection />
    </>
  );
}

function DrawingSection() {
  return (
    <Section title="Drawing a board with shared lines">
      <Paragraph>
        A board starts as a circle. You draw lines across it, and every closed area between the lines and the rim
        becomes a territory. Each line is the border of the territories on both sides, so two neighbours can never
        disagree about where one ends and the other begins.
      </Paragraph>
      <Paragraph>
        Then you give each territory a name and a type: sand, rock, stronghold or polar. The type sets its colour and
        outline. You can add an inset line, and decals such as a city or a sietch that you place, scale and turn. An
        optional guide shows the 18 storm sectors, and points can snap to it. Straight lines, curves and arcs are all
        there.
      </Paragraph>
      <Paragraph>Here is a cut through Hagga basin on Arrakis.</Paragraph>
      <FigureRow
        figures={[
          {
            imageKey: '/web/blog/dune-board-editor/cut-unfinished.jpg',
            alt: 'The board editor with Hagga basin selected: a new line runs from its left border and stops halfway, and Hagga basin is still one territory',
            aspect: 1040 / 1120,
            caption:
              'Halfway through, Hagga basin is still one territory. An unfinished line is allowed, and it shows on the board.',
          },
          {
            imageKey: '/web/blog/dune-board-editor/cut-split.jpg',
            alt: 'The board editor after the cut reaches the other border: the lower half is selected and named Hagga basin 2',
            aspect: 1040 / 1120,
            caption:
              'Once the cut reaches the other border, the top keeps the name Hagga basin and the bottom becomes Hagga basin 2.',
          },
        ]}
      />
    </Section>
  );
}

function NamesSection() {
  return (
    <Section title="Names that stay put">
      <Paragraph>
        Spice cards and Rulebooks point at territories by name, so the names follow a few simple rules.
      </Paragraph>
      <BulletList>
        <li>
          Every territory has a readable name, and the site makes an id from it: Hagga basin becomes{' '}
          <code>hagga_basin</code>.
        </li>
        <li>A cut always leaves the original name on the same side, so the same edit gives the same result.</li>
        <li>
          Renaming a territory never rewrites anyone&rsquo;s cards. A card that points at a name the board no longer has
          simply doesn&rsquo;t light it, and its page tells you.
        </li>
      </BulletList>
      <Paragraph>
        A board and the cards that use it can belong to different people, and editing your board should never quietly
        change someone else&rsquo;s card.
      </Paragraph>
    </Section>
  );
}

function ArrakisSection() {
  return (
    <Section title="One board, everywhere">
      <Paragraph>
        Arrakis Official is drawn in the same editor: 42 territories, with the enclosed strongholds, the Polar Sink and
        the curved borders of the printed map. Every place on dune.zone that shows Arrakis now draws this one saved
        board.
      </Paragraph>
      <Figure
        imageKey="/web/blog/dune-board-editor/spice-cards.jpg"
        alt="Twelve Spice cards from dune.zone, each with a small Arrakis map and its territory lit: The Great Flat, Hagga Basin, Gaia Kulon, Cielago West and more"
        aspect={924 / 2048}
        caption="Spice cards light their territories on it. Save a change to the board, and every card on it is drawn again."
      />
      <FigureRow
        figures={[
          {
            imageKey: '/web/blog/dune-board-editor/rulebook-route.jpg',
            alt: 'A page of the Dune core rules on dune.zone, Check the whole route: two maps of the saved board with a blocked route through the storm and a detour through the Polar Sink',
            aspect: 1190 / 1600,
            caption: 'Rulebooks draw routes and markers on it.',
          },
          {
            imageKey: '/web/blog/dune-board-editor/tutorial-table.jpg',
            alt: 'A dune.zone tutorial chapter, What goes where: the practice table on the saved Arrakis board with faction tokens, troops and the storm',
            aspect: 1440 / 2048,
            caption: 'The tutorials teach on it.',
          },
        ]}
      />
      <Figure
        imageKey="/web/blog/dune-board-editor/glossary-board.jpg"
        alt="The board section of the dune.zone glossary: entries for territory, sector and stronghold beside the Arrakis map, with one stronghold lit in red"
        aspect={853 / 2048}
        caption="The glossary explains territories, sectors and strongholds on it."
      />
    </Section>
  );
}

function NextSection() {
  return (
    <Section title="Your board, your game">
      <Paragraph>
        A ruleset chooses its board, and every new game keeps the board its ruleset had when the game began. So a
        homebrew can move a border, add a territory, or start from a blank circle and draw a different planet
        altogether. And who says a game has to stop at one board?
      </Paragraph>
      <Paragraph>
        Anyone with an account can open the board editor and start drawing. A tutorial for the board editor is coming
        soon.
      </Paragraph>
      <Figure
        imageKey="/web/blog/dune-board-editor/homepage-table.jpg"
        alt="The homepage game table on dune.zone: the Arrakis board with troops, faction tokens and another player's hand"
        aspect={606 / 2048}
        caption="The table on the homepage, playing on the saved Arrakis board."
      />
    </Section>
  );
}
