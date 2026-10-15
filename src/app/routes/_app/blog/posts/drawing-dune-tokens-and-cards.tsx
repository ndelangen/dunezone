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
        Every leader token and card on dune.zone is drawn in your browser, one layer at a time. A few of those layers
        are pictures I cut in GIMP in 2021, when I was still making assets for{' '}
        <Anchor
          renderRoot={(props) => <Link {...props} to="/blog/$postSlug" params={{ postSlug: 'tabletop-simulator' }} />}
        >
          Tabletop Simulator
        </Anchor>
        . The rest is SVG I kept rewriting for years. I dug through the git history of my old projects to see how it all
        got here.
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
        Our rule sets kept changing the cards. A number went up, an icon was added. I couldn't edit the printed art
        every time, so between May and November 2021 I rebuilt the parts I needed in GIMP as separate layers. Card
        frames, the gold disc and ornaments on the card backs, the parchment behind the pictures, the faction shields. I
        wanted them as close to the original as I could get, with every bit of text, icon and colour still mine to
        change.
      </Paragraph>
      <Paragraph>
        I didn't expect those files to last. Dune.zone draws its cards and shields from seven pictures, and six of them
        are byte for byte what I committed between October 2021 and January 2022. Everything around them has been
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
        In September 2021 I drew the first leader token in code instead of in GIMP. Most of today's token was already in
        it. The portrait in a disc, the name curving along the bottom, the big strength number, the faction emblem. It
        also had the mask that cuts a gap around the number and the emblem, so they never sit on the portrait. I still
        think that gap is what makes the tokens look right.
      </Paragraph>
      <Paragraph>
        After that the changes got small, and I couldn't stop making them. The faction symbol started out as a PNG, with
        its outline grown by a filter. In November 2021 it became a vector, and the mask got a thick-stroked copy of it
        to cut the gap. That is still how the gap is made. In 2024 the ring and lettering went white, and later they got
        the warm tint they have now. There was a bug too. Tokens on the same page shared their masks and drew each
        other&rsquo;s cut-outs, until I gave every token its own in January 2022.
      </Paragraph>
      <Figure
        imageKey="/web/blog/drawing-dune-tokens-and-cards/token-details.jpg"
        alt="Close-ups of Thufir Hawat's leader token from September 2021, November 2021, March 2024 and today, showing the strength number, the emblem, the name and the ring"
        aspect={1636 / 1900}
        caption="Thufir Hawat's token, drawn by the code of each period. I rendered the 2021 ones from the old source at those commits."
      />
    </Section>
  );
}

function NoiseSection() {
  return (
    <Section title="From generated noise to photographs">
      <Paragraph>
        The backgrounds started out as noise generated inside the SVG, lit from one side to look like rough paper. Every
        faction stored five numbers for it. It was cheap and it worked, but whatever I did with the numbers, it looked
        like crumpled paper.
      </Paragraph>
      <Paragraph>
        In March 2024 I switched to photographs. The renderer turns a texture photo grey, can invert and sharpen it, and
        uses it as a mask. The faction&rsquo;s second colour shows through wherever the photo is bright. There are 73
        textures now. Marble, sand ripples, scratches and stripes all come out of the same three settings. Try both
        below.
      </Paragraph>
      <NoiseComparison />
    </Section>
  );
}

function TokenSection() {
  return (
    <Section title="The token, pulled apart">
      <Paragraph>
        This is Thufir&rsquo;s token the way dune.zone draws it today. Every layer below is the site&rsquo;s own token
        code with the other layers hidden. Scroll it into view and it comes apart, or drag the slider.
      </Paragraph>
      <LeaderTokenLayers />
      <Paragraph>
        The mask was the hard part to show, because it is never drawn. It only decides where the portrait and the ring
        can appear. In the figure it is the pale sheet, shaped like the area it lets through, with holes where the gaps
        around the number and the emblem are.
      </Paragraph>
    </Section>
  );
}

function CardsSection() {
  return (
    <Section title="Cards">
      <Paragraph>
        Card fronts work the same way, with more layers. Two of the ten layers on a treachery card are 2021 GIMP files,
        the parchment behind the picture and the frame. The shade over the title band is a picture I added later.
        Everything else is vectors, textures and text, so a card&rsquo;s name, rules, colours and picture can change
        without anyone opening an image editor.
      </Paragraph>
      <Paragraph>
        Look at the round type symbol in the corner. The frame only has a dark hole there. The symbol brings its own
        background into that hole and draws its icon on top, so the icon can be bigger than the hole.
      </Paragraph>
      <CardFrontLayers />
    </Section>
  );
}

function PortraitSection() {
  return (
    <Section title="Improving the art">
      <Paragraph>
        I&rsquo;ve written before about tracing the icons and decals into vectors. The bitmaps needed work as well, the
        leader portraits most of all. The only source for them was the printed tokens, and on a token the number, the
        emblem, the name and the ring are all printed over the portrait.
      </Paragraph>
      <Paragraph>
        So I cut each portrait out of its token and filled in what those covered. The cape behind the number, the jacket
        under the emblem, the shoulders below the ring. I also swapped the printed background for a flat one. Because of
        that, dune.zone can draw the number, emblem and name itself, in any style, over a portrait with nothing missing.
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
        caption="Thufir on the printed token, and the portrait I made from it. Drag the slider to compare them."
      />
    </Section>
  );
}

function InconsistencySection() {
  return (
    <Section title="When the original art disagrees with itself">
      <Paragraph>
        The original art doesn&rsquo;t always agree with itself. Icons on the card backs come in different sizes and sit
        at different heights, and the pictures are placed differently from card to card. Every time, I had to pick. Copy
        the original exactly, and the renderer needs a setting for every quirk. Straighten it out, and it drifts from
        the printed game.
      </Paragraph>
      <Paragraph>
        Most of the time I picked the settings. Every card back stores its own icon scale and offset, so the storm icon
        can sit smaller and the alliance icon larger. Every decal on a card has its own size, position, outline and a
        muted option. Every background has its own definition and influence. Where an original was plain broken, I fixed
        the art instead, which is why all 410 vector decals went through a review.
      </Paragraph>
      <Paragraph>
        Here is where all of that ends up, the{' '}
        <Anchor
          renderRoot={(props) => <Link {...props} to="/factions/$factionId" params={{ factionId: 'house-atreides' }} />}
        >
          House Atreides
        </Anchor>{' '}
        leaders as they are on the site today.
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
