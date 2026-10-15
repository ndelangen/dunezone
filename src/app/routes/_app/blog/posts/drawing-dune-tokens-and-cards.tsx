import { Anchor } from '@mantine/core';
import { resolveAsset } from '@shared/media/resolveAsset';
import { Link } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';

import { Figure, Lead, Paragraph } from '../postContent';
import { BLOG_POST_META } from '../posts';
import { BeforeAfter } from './assets/BeforeAfter';
import { CardBackLayers, CardFrontLayers, LeaderTokenLayers } from './assets/figures';
import { NoiseComparison } from './assets/NoiseComparison';

const meta = BLOG_POST_META['drawing-dune-tokens-and-cards'];

export default function Post() {
  return (
    <>
      <Lead>
        Every leader token and card on dune.zone is drawn in your browser, one layer on top of the next. Some of those
        layers are pictures I cut out in GIMP in 2021, back when I was making assets for{' '}
        <Anchor
          renderRoot={(props) => <Link {...props} to="/blog/$postSlug" params={{ postSlug: 'tabletop-simulator' }} />}
        >
          Tabletop Simulator
        </Anchor>
        . Others are SVG paths and masks I kept reworking for years. I went back through the git history of my old
        projects to see how they got to where they are now.
      </Lead>
      <GimpSection />
      <FirstTokenSection />
      <NoiseSection />
      <TokenSection />
      <CardsSection />
      <PortraitSection />
      <InconsistencySection />
    </>
  );
}

function GimpSection() {
  return (
    <Section title="Layers cut in GIMP">
      <Paragraph>
        Our rule sets kept changing the cards: a different number here, an extra icon there. Editing the printed art
        each time was not an option, so between May and November 2021 I rebuilt the parts I needed in GIMP, as separate
        layers: the card frames, the gold disc and ornaments on the card backs, the parchment behind the pictures, the
        faction shields. The aim was to get as close to the original art as I could, while being able to change any
        text, icon or colour on top.
      </Paragraph>
      <Paragraph>
        Those files turned out to be durable. Of the seven card and shield pictures dune.zone draws with today, six are,
        byte for byte, the files I committed between October 2021 and January 2022. Everything else around them has been
        rewritten several times.
      </Paragraph>
      <CardBackLayers />
    </Section>
  );
}

function FirstTokenSection() {
  return (
    <Section title="The first leader token in code">
      <Paragraph>
        In September 2021 I drew the first leader token in code instead of in GIMP. Most of what you see on a token
        today was already there: the portrait in a disc, the name curving along the bottom, the strength in large
        digits, and the faction emblem. It also had its most important trick: a mask that cuts a gap around the number
        and the emblem, so they never collide with the portrait.
      </Paragraph>
      <Paragraph>
        Since then the changes have been small, and I kept making them. The faction symbol started as a PNG with an
        outline grown by a filter. In November 2021 it became a vector, and the mask took a thick-stroked copy of it to
        cut the gap around it, which is still how that gap is made. In 2024 the ring and lettering went white, and later
        they took on the warm tint they have now. And a bug: when many tokens shared a page, they shared their masks
        too, and drew each other&rsquo;s cut-outs, until I gave every token its own in January 2022.
      </Paragraph>
      <Figure
        imageKey="/web/blog/drawing-dune-tokens-and-cards/token-details.jpg"
        alt="Close-ups of Thufir Hawat's leader token from September 2021, November 2021, March 2024 and today, showing the strength number, the emblem, the name and the ring"
        aspect={1636 / 1900}
        caption="Thufir Hawat's token, drawn by the code of each period. The 2021 versions are rendered from the old source at those commits."
      />
    </Section>
  );
}

function NoiseSection() {
  return (
    <Section title="From generated noise to photographs">
      <Paragraph>
        The backgrounds started as noise generated inside the SVG, lit from one side so it looks like rough paper. Every
        faction stored five numbers for it. It was cheap and it worked, but whatever the numbers, it still looked like
        crumpled paper.
      </Paragraph>
      <Paragraph>
        In March 2024 I switched to photographs. The renderer turns a texture photo grey, inverts and sharpens it if
        asked, and uses it as a mask: the faction&rsquo;s second colour shows through wherever the photo is bright.
        There are 73 textures to choose from now, and marble, sand ripples, scratches and stripes all come out of the
        same three settings. Try both below.
      </Paragraph>
      <NoiseComparison />
    </Section>
  );
}

function TokenSection() {
  return (
    <Section title="The token, pulled apart">
      <Paragraph>
        Here is Thufir&rsquo;s token as dune.zone draws it today, layer by layer. Each layer is the site&rsquo;s own
        token code, with everything else hidden. Scroll it into view to take it apart, or use the slider.
      </Paragraph>
      <LeaderTokenLayers />
      <Paragraph>
        The mask is the part that is hard to show. It is never drawn; it only decides where the portrait and the ring
        may appear. In the figure I drew it as a pale sheet in the shape it lets through. The holes in it are the gaps
        around the number and the emblem.
      </Paragraph>
    </Section>
  );
}

function CardsSection() {
  return (
    <Section title="Cards">
      <Paragraph>
        Card fronts are built the same way, with more layers. Two of the ten layers on a treachery card are GIMP files
        from 2021: the parchment behind the picture and the frame. The rest are vectors, textures, text and one later
        picture, the shade over the title band, so a card&rsquo;s name, rules, colours and picture can all change
        without anyone opening an image editor.
      </Paragraph>
      <Paragraph>
        One detail is easy to miss. The frame has only a dark hole where the type symbol sits. The symbol brings its own
        background into that hole, and its icon is drawn on top of both, so the icon can be larger than the hole.
      </Paragraph>
      <CardFrontLayers />
    </Section>
  );
}

function PortraitSection() {
  return (
    <Section title="Improving the art">
      <Paragraph>
        Redrawing the icons and decals as vectors is only half of it. The bitmaps needed work too, and the leader
        portraits needed the most. The only source for them was the printed tokens, and on a token the number, the
        emblem, the name and the ring all sit on top of the portrait.
      </Paragraph>
      <Paragraph>
        So I cut each portrait out of its token and filled in what those covered: the cape behind the number, the jacket
        under the emblem, the shoulders below the ring. I also replaced the printed background with a clean, flat one.
        That is what lets dune.zone draw the number, emblem and name itself, in any style, on top of an uncovered
        portrait.
      </Paragraph>
      <BeforeAfter
        before={{
          src: resolveAsset('/web/blog/drawing-dune-tokens-and-cards/thufir-token-photo.jpg', 'small'),
          alt: "Thufir Hawat's printed leader token",
        }}
        after={{
          src: resolveAsset('/image/leader/official/thufir.png', 'large'),
          alt: "Thufir Hawat's cleaned-up portrait",
        }}
        aspect={745 / 741}
        caption="Thufir on the printed token, and the portrait I made from it. Drag the slider to compare."
      />
    </Section>
  );
}

function InconsistencySection() {
  return (
    <Section title="When the original art disagrees with itself">
      <Paragraph>
        The original art is not perfectly consistent. Icons on the card backs come at different sizes and sit at
        different heights, and the pictures sit differently from card to card. Each time I had to choose between copying
        the original exactly, which means the renderer needs a setting for every quirk, or straightening it out and
        drifting from the printed game.
      </Paragraph>
      <Paragraph>
        Mostly I chose flexibility. Every card back stores its own icon scale and offset, so the storm icon can sit
        smaller and the alliance icon larger. Every decal on a card has its own size, position, outline and a muted
        option. Every background has its own definition and influence. Where an original was simply broken, I fixed the
        art itself instead: the vector decals went through a review of all 410 of them.
      </Paragraph>
      <Paragraph>
        All of that adds up to the tokens below, which you can find on the{' '}
        <Anchor
          renderRoot={(props) => <Link {...props} to="/factions/$factionId" params={{ factionId: 'house-atreides' }} />}
        >
          House Atreides
        </Anchor>{' '}
        page.
      </Paragraph>
      <Figure
        imageKey={meta.cover.key}
        alt={meta.cover.alt}
        aspect={meta.cover.aspect}
        caption="House Atreides on dune.zone today."
      />
    </Section>
  );
}
