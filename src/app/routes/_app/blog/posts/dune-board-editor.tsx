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
      <Figure
        imageKey="/web/blog/dune-board-editor/cut-unfinished.jpg"
        alt="The board editor with Hagga basin selected: a new line runs from its left border and stops halfway, and Hagga basin is still one territory"
        aspect={1034 / 2048}
        caption="Halfway through the cut, Hagga basin is still one territory. An unfinished line is allowed, and it shows on the board."
      />
      <Figure
        imageKey="/web/blog/dune-board-editor/cut-split.jpg"
        alt="The board editor after the cut reaches the other border: the lower half is selected and named Hagga basin 2"
        aspect={1034 / 2048}
        caption="Once the cut reaches the other border, there are two territories. The top keeps the name Hagga basin, and the bottom becomes Hagga basin 2."
      />
      <Figure
        imageKey="/web/blog/dune-board-editor/cut-merged.jpg"
        alt="The board editor after the new line is removed: Hagga basin is one territory again"
        aspect={1034 / 2048}
        caption="Remove the line, and it's one Hagga basin again."
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
    <Section title="Arrakis is a board like any other">
      <Paragraph>
        Arrakis Official is drawn in the same editor: 42 territories, with the enclosed strongholds, the Polar Sink and
        the curved borders of the printed map. Spice cards, Rulebook illustrations, the game table, the homepage, the
        glossary and the tutorials all draw this one board now. Save a change to it, and every Spice card on it is drawn
        again.
      </Paragraph>
      <FigureRow
        figures={[
          {
            imageKey: '/web/blog/dune-board-editor/old-arrakis-map.jpg',
            alt: 'The old hardcoded Arrakis map: sand and rock territories, strongholds and dashed sector lines',
            aspect: 1,
            caption: 'Before: the hardcoded Arrakis map.',
          },
          {
            imageKey: '/web/blog/dune-board-editor/arrakis-official.jpg',
            alt: 'The published Arrakis Official board: sand and rock territories, five strongholds with city and sietch decals, and the white Polar Sink in the middle',
            aspect: 1,
            caption: 'After: Arrakis Official, published from the board editor.',
          },
        ]}
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
