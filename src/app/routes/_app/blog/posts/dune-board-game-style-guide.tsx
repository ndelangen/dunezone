import { Anchor } from '@mantine/core';
import { Section } from '@ui/block/Section';

import { Lead, Paragraph, PostLink, WideFigure } from '../postContent';
import { DecalSheet, DecalStack } from './styleguide/DecalSheet';
import { FactionPalette } from './styleguide/FactionPalette';
import { FrameParts, PortraitWall, TextureLibrary } from './styleguide/library';
import { LogoSheet } from './styleguide/LogoSheet';
import { CardAnatomy, CardColours, GoldLettering } from './styleguide/pieces';
import { PortraitSpec, ReleaseStyles } from './styleguide/portraits';
import { TypeSpecimen } from './styleguide/TypeSpecimen';

const FONT_THREAD = 'https://boardgamegeek.com/thread/2370217/gf9-dune-font-graphics';

export default function Post() {
  return (
    <>
      <Lead>
        Whenever I rebuild a piece of the Gale Force Nine edition of Dune, I end up back on the same BoardGameGeek
        thread:{' '}
        <Anchor href={FONT_THREAD} target="_blank" rel="noreferrer">
          GF9 Dune Font Graphics
        </Anchor>
        , where Pkfod listed every font family in the game and where each one appears. This post is my attempt to be
        that page, with the fonts set in their own faces and the colours, textures and art beside them.
      </Lead>
      <Paragraph>
        The 2019 game and its Ixians &amp; Tleilaxu expansion were illustrated by Ilya Baranovsky. Solveig Reda drew
        CHOAM &amp; Richese, and Solveig and Lochen Reda drew Ecaz &amp; Moritani. Casey Davies and Victor Pesch did the
        graphic design. Everything below is drawn live by dune.zone, from the same fonts, colours and images the faction
        pages use.
      </Paragraph>
      <FontsSection />
      <ColoursSection />
      <EmblemsSection />
      <TexturesSection />
      <PortraitsSection />
      <ExpansionsSection />
    </>
  );
}

function FontsSection() {
  return (
    <Section title="The typefaces">
      <Paragraph>
        Seven typefaces do almost all of the work. Copperplate Gothic is the voice of the game: card names, territory
        names on the board and every title. Candara carries the rules text, and Caladea the longer reading in the
        rulebook and on the faction sheets. The three display faces are used sparingly: Busorama on the card backs,
        Desdemona for the names on the player shields, and Advokat Modern for nearly every number.
      </Paragraph>
      <WideFigure caption="The seven faces, each set in itself. Where they appear in the box follows Pkfod's list.">
        <TypeSpecimen />
      </WideFigure>
      <Paragraph>
        Three more appear only on the box and the Quick Start Guide: Helvetica for the copyright lines, Lato Black
        around the logo and Istok for the guide's body text. You may also recognise two of the faces from this site: the
        text you are reading is Candara, and the headings are Copperplate Gothic.
      </Paragraph>
      <WideFigure caption="The anatomy of a treachery card, a card back and a leader token: each part numbered, with its face, its size in the renderer's units and its colour.">
        <CardAnatomy />
      </WideFigure>
      <Paragraph>
        The shield is the one place Desdemona appears. Its letters share their pale gold gradient with the words on the
        card backs. In 2024 a reader on the same thread pointed out that the shield lettering changed with a later
        expansion and no longer matches Desdemona.
      </Paragraph>
      <WideFigure caption="The Atreides shield, and the gold gradient its name and the card backs' words are filled with, set in Desdemona and Busorama.">
        <GoldLettering />
      </WideFigure>
    </Section>
  );
}

function ColoursSection() {
  return (
    <Section title="The colours">
      <Paragraph>
        Every faction comes down to two colours: a darker one and a lighter one, mixed through a greyscale photograph so
        the surface looks printed rather than flat. I wrote about{' '}
        <PostLink to="/blog/$postSlug" params={{ postSlug: 'drawing-dune-tokens-and-cards' }}>
          how those layers stack
        </PostLink>{' '}
        in an earlier post. These are the values dune.zone uses to match each faction's printed pieces.
      </Paragraph>
      <WideFigure caption="Each faction's token, its two colours and the number of the texture between them. CHOAM's colours are split down the middle.">
        <FactionPalette />
      </WideFigure>
      <Paragraph>
        Treachery cards are colour-coded by what they do: red for weapons, blue for defences, olive for special cards
        and a dull tan for worthless ones. The colour sits in the band behind the card's name, over a concrete texture
        that every card shares. The cream of the emblems and rings, close to #E3DBB3, ties all of it together.
      </Paragraph>
      <WideFigure caption="One card from each treachery category, with the two colours of its title band, the stripes of its type symbol, and the inks every card shares.">
        <CardColours />
      </WideFigure>
    </Section>
  );
}

function EmblemsSection() {
  return (
    <Section title="Emblems and decals">
      <Paragraph>
        Each faction has one emblem, a solid heraldic silhouette with no outline and no inner shading: a hawk for the
        Atreides, a griffin for the Harkonnens, a lion for the Emperor, crossed crysknives for the Fremen, three rings
        for the Guild. Details are cut out of the shape as gaps rather than drawn in, so an emblem still reads at the
        size of a fingernail. On the tokens and shields they are printed in cream, close to #E3DBB3, over the faction's
        colours.
      </Paragraph>
      <WideFigure caption="The twelve faction emblems in cream on their own colours, and each one as the token wears it, on a dark ground and in ink on parchment.">
        <LogoSheet />
      </WideFigure>
      <Paragraph>
        The pictures on the treachery cards follow the same idea. Each one is a black silhouette on the gold panel of
        the card: a weapon, a tool or a figure caught mid-action, with highlights cut out of the black. A few cards,
        such as Weirding Way and Chemistry, add a second colour, a pale tan.
      </Paragraph>
      <WideFigure caption="One decal four ways, as the card renderer draws it, and every printed silhouette in ink on parchment.">
        <DecalSheet />
      </WideFigure>
      <Paragraph>
        Recreating them took two options on every decal. An outline puts a cream halo around the silhouette, which
        separates it from the panel and from any decal behind it. Muted draws the decal as a flat olive-tan shape,
        #847954, behind everything else, the way the printed cards push scenery into the background. With those two
        switches and a position and size for each decal, a card can stack several pictures the way the originals do.
      </Paragraph>
      <WideFigure caption="Two cards that stack decals, with the picture window and the decal slot drawn over them and each layer's settings beside.">
        <DecalStack />
      </WideFigure>
    </Section>
  );
}

function TexturesSection() {
  return (
    <Section title="Textures and frames">
      <Paragraph>
        Under the colours are photographs of stone, concrete, fabric and paper, stored in greyscale so any colour can be
        laid over them. Two of them appear on every card: a scratched concrete behind the titles and the backs, and a
        bold stripe inside the type symbols.
      </Paragraph>
      <WideFigure caption="The textures behind the cards and each faction, numbered as they are stored on dune.zone: the greyscale photograph on the left, and on the right the same photograph with its colours laid over it.">
        <TextureLibrary />
      </WideFigure>
      <Paragraph>
        A handful of parts are still bitmaps rather than code: the parchment, the card frame with its black corner
        circle, the gold panel behind a card's picture, the gold border and medallion of the card backs, and the frame
        of the player shields.
      </Paragraph>
      <WideFigure caption="The bitmap parts of the cards and shields, laid out flat with their pixel sizes.">
        <FrameParts />
      </WideFigure>
    </Section>
  );
}

function PortraitsSection() {
  return (
    <Section title="The leader portraits">
      <Paragraph>
        Every leader follows the same rules, whoever drew them: a bust in a circle, turned three-quarters, outlined in
        ink and lit softly from the front. The faction lives in the clothing. Atreides wear green with gold trim,
        Harkonnens black and orange, Fremen sand-coloured cloaks over stillsuit browns, and the Bene Gesserit blue and
        white. The portraits appear on the round leader tokens and again, larger, on the traitor cards.
      </Paragraph>
      <WideFigure caption="Paul Atreides with the token's circle over him, and the six rules every portrait follows.">
        <PortraitSpec />
      </WideFigure>
    </Section>
  );
}

function ExpansionsSection() {
  return (
    <Section title="How the art changed with the expansions">
      <Paragraph>
        The bust and the pose never changed, but the drawing did. Ixians &amp; Tleilaxu kept the illustrator and moved
        from hatched, marker-like colour to hard-edged blocks of shadow. CHOAM &amp; Richese brought a new artist and
        smooth digital shading with a thin outline. Ecaz &amp; Moritani added a heavier, brush-like line and far more
        ornament. Because the pose, the circle and the warm skin tones stayed the same, the new leaders still sit
        comfortably next to the old ones.
      </Paragraph>
      <WideFigure caption="Four leaders from each release, oldest first, with what each release changed in the drawing.">
        <ReleaseStyles />
      </WideFigure>
      <Paragraph>
        Together they make a cast of 68 leaders, all on dune.zone, ready for anyone building their own faction.
      </Paragraph>
      <WideFigure caption="Every official leader portrait on dune.zone, faction by faction, each ringed in its faction's colour.">
        <PortraitWall />
      </WideFigure>
    </Section>
  );
}
