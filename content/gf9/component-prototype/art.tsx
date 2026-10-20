import type { ComponentProps, ComponentType } from 'react';

import { LeaderToken } from '../../../src/game/assets/faction/leader/Leader';
import { Token } from '../../../src/game/assets/faction/token/Token';
import { Background, FactionRender } from '../../../src/shared/factions/schema';
import packageData from '../package.json';
import './art.css';

export const ART = {
  malina: '/art/malina-bust.png',
  ilban: '/art/ilban-bust.png',
  choamLogo: '/vector/logo/choam.svg',
  publisherMark: '/art/gf9-mark-original.png',
  rulesetTile: '/art/gf9-ruleset-tile.png',
} as const;

// Render-only source files. Persisted faction inputs must use registered media IDs.
const PrototypeLeader = LeaderToken as ComponentType<
  Omit<ComponentProps<typeof LeaderToken>, 'image'> & { image: string }
>;

const factionRecord = (key: string) =>
  packageData.items.find((item) => item.kind === 'faction' && item.key === key)!.data;
const horizontalSplit = (top: string, bottom: string) => ({
  type: 'linear' as const,
  angle: 270,
  stops: [
    [top, 0.5],
    [bottom, 0.5],
  ] as [string, number][],
});
export const choamBackground = Background.parse({
  ...FactionRender.token.parse(factionRecord('gf9-choam')).background,
  image: '/image/texture/082.jpg' as const,
  colors: [horizontalSplit('#EB0220', '#252527'), horizontalSplit('#B90010', '#0C0C0C')],
  influence: 0.65,
  invert: false,
  definition: 0.5,
});
export const richeseBackground = FactionRender.token.parse(factionRecord('gf9-richese')).background;
const heads = [
  {
    key: 'malina',
    name: 'Ur-Director Malina Aru',
    size: '227 × 215',
    bust: '150 × 150',
    face: '130 × 130',
    logo: ART.choamLogo,
    background: choamBackground,
  },
  {
    key: 'ilban',
    name: 'Count Ilban Richese',
    size: '226 × 214',
    bust: '162 × 162',
    face: '136 × 136',
    logo: '/vector/logo/richese.svg',
    background: richeseBackground,
  },
] as const;

function PortraitProof({ head, crop }: { head: (typeof heads)[number]; crop: 'bust' | 'face' }) {
  return (
    <div className="gf9-art-disc">
      <PrototypeLeader
        name={head.name}
        image={`/art/${head.key}-${crop}.png`}
        logo={head.logo}
        background={head.background}
      />
    </div>
  );
}

export function ArtReview({ variant = 'C' }: { variant?: 'A' | 'B' | 'C' }) {
  return (
    <div className="gf9-art-review" data-review-variant={variant}>
      <section>
        <h2>Official faction head artwork</h2>
        <p>
          The wider portrait crops are accepted. This revision recreates the original horizontal split backgrounds with
          the existing textured gradient controls for CHOAM only. Richese keeps its grey textured background without a
          split.
        </p>
        <p>
          The discs below use the existing LeaderToken renderer, which also renders the faction head on a shield. These
          faction heads have no battle strength. They are not added to the supporting leaders.
        </p>
        {heads.map((head) => (
          <article className="gf9-art-head" key={head.key}>
            <h3>{head.name}</h3>
            <div className="gf9-art-comparison">
              <figure>
                <img
                  className="gf9-art-original"
                  src={`/art/${head.key}-original.png`}
                  alt={`Unmodified official ${head.name} tile`}
                />
                <figcaption>Unmodified source, {head.size} pixels</figcaption>
              </figure>
              <figure>
                <PortraitProof head={head} crop="bust" />
                <figcaption>
                  Accepted wider crop, {head.bust} pixels. Retains the shoulders and more of the original portrait.
                </figcaption>
              </figure>
            </div>
          </article>
        ))}
        <p className="gf9-art-note">
          Disc previews use a 40 mm test diameter in the print proof. Browser zoom and screen calibration affect their
          apparent size on screen. The maintained renderer publishes a 600 × 600 image, but these sources contain only
          150 to 162 pixels in the selected wider crops. A larger output cannot recover detail.
        </p>
      </section>
      <section>
        <h2>Gale Force Nine ruleset image</h2>
        <p>
          The genuine publisher mark is pale yellow with transparency. The square below puts the complete mark on a dark
          background so the existing square cover crop cannot cut off the lettering.
        </p>
        <div className="gf9-art-comparison">
          <figure>
            <div className="gf9-art-logo-original">
              <img src={ART.publisherMark} alt="Unmodified Gale Force Nine publisher mark" />
            </div>
            <figcaption>Original, 313 × 142 pixels, shown at native size on dark backing.</figcaption>
          </figure>
          <figure>
            <img className="gf9-art-ruleset-tile" src={ART.rulesetTile} alt="Proposed GF9 ruleset thumbnail" />
            <figcaption>
              Square image at a 200-pixel catalogue preview size. The mark is centered without resampling in a 384 × 384
              file.
            </figcaption>
          </figure>
        </div>
        <p className="gf9-art-note">
          This image belongs to the GF9 Ruleset record and its GF9 Group. It is separate from the already approved book
          covers.
        </p>
      </section>
      <section>
        <h2>CHOAM is identified by its background</h2>
        <p>
          The empty CHOAM logo is intentional. Keep it empty. The horizontal red-over-black textured background is the
          identifying treatment, using existing gradient controls.
        </p>
        <div className="gf9-art-comparison">
          <figure>
            <img
              width="144"
              height="144"
              src="/art/choam-disc-original.png"
              alt="Original CHOAM background reference"
            />
            <figcaption>Original background reference, 144 by 144 pixels.</figcaption>
          </figure>
          <figure>
            <div className="gf9-art-token">
              <Token background={choamBackground} logo={ART.choamLogo} />
            </div>
            <figcaption>Existing Token renderer at a 25 mm test diameter, with no logo.</figcaption>
          </figure>
          <figure>
            <div className="gf9-art-sheet-logo">
              <Token background={choamBackground} logo={ART.choamLogo} />
            </div>
            <figcaption>Existing Token renderer at a 16 mm test diameter, with no logo.</figcaption>
          </figure>
        </div>
        <p className="gf9-art-note">
          Richese retains a grey textured background without a split. No CHOAM emblem, logo replacement or mask
          exception is required.
        </p>
      </section>
    </div>
  );
}
