import { resolveAsset } from '@shared/media/resolveAsset';
import { Section } from '@ui/block/Section';

import { Figure, Lead, Paragraph, PostLink } from '../postContent';
import { BeforeAfter } from './assets/BeforeAfter';
import { CardBackLayers, CardFrontLayers, LeaderTokenLayers } from './assets/figures';
import { NoiseComparison } from './assets/NoiseComparison';

export default function Post() {
  return (
    <>
      <Lead>
        Every leader token and card on dune.zone is drawn in your browser, one layer at a time. A few of those layers
        are images I cut out in GIMP in 2021, when I was still making assets for{' '}
        <PostLink to="/blog/$postSlug" params={{ postSlug: 'tabletop-simulator' }}>
          Tabletop Simulator
        </PostLink>
        . The SVG code around them has changed many times since then.
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
        As{' '}
        <PostLink to="/rulesets/$rulesetSlug" params={{ rulesetSlug: 'dreamrules' }}>
          Dreamrules
        </PostLink>{' '}
        evolved, the artwork had to keep up. A leader's strength would go up or an icon would change, and I couldn't
        keep editing the images by hand every time. So in 2021, I used GIMP to separate out the parts I needed: card
        frames, the gold disc and ornaments on the card backs, the parchment behind the pictures, and the faction
        shields. I wanted them to look as close to the printed game as possible, with text, icons and colours I could
        change independently.
      </Paragraph>
      <Paragraph>
        I didn't expect those files to last this long. Today, dune.zone draws its cards and shields from seven images.
        Six are still identical, byte for byte, to the files I committed between October 2021 and January 2022, even
        though I've rewritten the code around them several times.
      </Paragraph>
      <CardBackLayers />
    </Section>
  );
}

function FirstTokenSection() {
  return (
    <Section title="The first leader token in code">
      <Paragraph>
        In 2021, I drew my first leader token in SVG instead of GIMP. It already had most of what you see today: a
        portrait inside a disc, a name curving along the bottom, a large strength number and a faction emblem. I used a
        mask to cut a gap around the number and emblem, keeping them clear of the portrait. That gap is essential to
        making the token look right.
      </Paragraph>
      <Paragraph>
        The faction emblem started out as a PNG, with a filter expanding its outline to make the gap. Later that year, I
        replaced it with a vector and used a copy with a thick outline to cut the gap in the mask.
      </Paragraph>
      <Paragraph>
        There were bugs along the way. Tokens on the same page shared masks and drew each other's cut-outs until I gave
        every token its own mask in 2022. Scaling them dynamically also required nesting one SVG inside another, a
        limitation I finally removed in 2024.
      </Paragraph>
      <Figure
        imageKey="/web/blog/drawing-dune-tokens-and-cards/token-details.jpg"
        alt="Close-ups of Thufir Hawat's leader token from September 2021, November 2021, March 2024 and today, showing changes to the strength number, emblem, name and ring"
        aspect={1636 / 1900}
        caption="Thufir Hawat's token at four stages of development."
      />
    </Section>
  );
}

function NoiseSection() {
  return (
    <Section title="From generated noise to photographs">
      <Paragraph>
        The backgrounds started as noise generated inside the SVG, lit from one side to look like rough paper. Each
        faction needed just five numbers to control the effect. It worked, but no matter how I adjusted those settings,
        the result always looked like crumpled paper.
      </Paragraph>
      <Paragraph>
        In 2024, I switched to greyscale texture images. The renderer can invert and sharpen each image before using it
        as a mask. The faction's second colour shows through wherever the image is bright. There are now 73 textures,
        including marble, sand ripples, scratches and stripes, all controlled by the same three settings. Try the old
        and new approaches below.
      </Paragraph>
      <NoiseComparison />
    </Section>
  );
}

function TokenSection() {
  return (
    <Section title="The token, pulled apart">
      <Paragraph>
        Here's how those parts fit together in Thufir's token today. Each layer below is drawn by the site's own token
        code, with the other layers hidden. Scroll the token into view to watch it come apart, or drag the slider to
        control it.
      </Paragraph>
      <LeaderTokenLayers />
      <Paragraph>
        The mask was the hardest part to show because you never see it on the finished token. It controls where the
        portrait and ring can appear. In this figure, I've shown it as a pale sheet with holes for the gaps around the
        number and emblem.
      </Paragraph>
    </Section>
  );
}

function CardsSection() {
  return (
    <Section title="Building the cards">
      <Paragraph>
        Card fronts work the same way, with ten layers in a treachery card. Two still use the 2021 GIMP files: the
        parchment behind the picture and the frame. The shading over the title band is another image, added later.
        Vectors, textures and text make up the rest, so a card's name, rules, colours and picture can change without
        anyone opening an image editor.
      </Paragraph>
      <Paragraph>
        Look at the round type symbol in the corner. The frame leaves a dark hole for it, but the symbol supplies its
        own background and draws the icon on top. That lets the icon extend beyond the hole.
      </Paragraph>
      <CardFrontLayers />
    </Section>
  );
}

function PortraitSection() {
  return (
    <Section title="Improving the art">
      <Paragraph>
        I've written before about tracing the icons and decals into vectors. The leader portraits needed work too. On
        the printed tokens, the number, emblem, name and ring cover parts of the portrait. The traitor cards gave me a
        second source for those portraits.
      </Paragraph>
      <Paragraph>
        I combined the token and traitor-card artwork and used upscaling tools to produce the portraits you see today. I
        also replaced the printed backgrounds with flat ones. With the portraits separated from the other artwork,
        dune.zone can draw its own numbers, emblems and names over them in any style.
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
        caption="Thufir's printed token and the finished portrait. Drag the slider to compare them."
      />
    </Section>
  );
}

function InconsistencySection() {
  return (
    <Section title="When the original art disagrees with itself">
      <Paragraph>
        Recreating the art also meant deciding what to do with its inconsistencies. Icons on the card backs vary in size
        and height, and pictures shift position from one card to the next. Each difference left me with a choice. Should
        I reproduce it faithfully, or tidy it up and lose some of the resemblance to the printed game?
      </Paragraph>
      <Paragraph>
        Keeping those quirks meant giving the renderer a way to reproduce them. Each card ended up with its own settings
        for the icon's size and offset, the decal's position and outline, and whether the decal is muted.
      </Paragraph>
      <Paragraph>
        Those layers and adjustments come together in the{' '}
        <PostLink to="/factions/$factionId" params={{ factionId: 'house-atreides' }}>
          House Atreides
        </PostLink>{' '}
        leaders shown below.
      </Paragraph>
      <Figure
        imageKey="/web/blog/drawing-dune-tokens-and-cards/atreides-leaders.jpg"
        alt="The House Atreides leader tokens on dune.zone: Lady Jessica, Thufir Hawat, Paul Atreides, Gurney Halleck, Duncan Idaho and Doctor Yueh"
        aspect={620 / 2400}
        caption="House Atreides on dune.zone today."
      />
    </Section>
  );
}
