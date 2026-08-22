import { Tooltip } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { ShieldCheck } from 'lucide-react';
import { useId } from 'react';
import type { SVGProps } from 'react';
import { FaRedditAlien } from 'react-icons/fa6';
import { SiBoardgamegeek } from 'react-icons/si';

import styles from './AppFooter.module.css';

/* Traced from `storybookjs/brand` (MIT), whose icon is two-tone: a cover with the `S` and the
   bookmark painted over it in white. The cover becomes the glyph and the other two become holes,
   so the band shows through them the way it does for the other brand marks in this row. */
const STORYBOOK_COVER =
  'M50.2729096,2.92285771 C50.2769973,2.98759391 50.2790429,3.05244063 50.2790429,3.11730315 L50.2790429,58.8828028 C50.2790429,60.6043831 48.8689636,62 47.1295431,62 C47.0824212,62 47.0353056,61.9989534 46.9882313,61.9968606 L4.94876437,60.1280997 C3.31149338,60.0553189 2.00425692,58.751918 1.94279175,57.1309472 L0.0022554267,5.95476663 C-0.0618328758,4.26461814 1.24754196,2.83223697 2.95307926,2.72673418 L37.427,0.594 L37.1272753,7.62078766 C37.1238721,7.70179664 37.1419373,7.78178731 37.179031,7.85305525 L37.2223772,7.92113026 C37.3791917,8.12573637 37.6738999,8.16578288 37.880626,8.0105767 L37.880626,8.0105767 L40.6382617,5.94019678 L42.9673936,7.75618537 C43.0546693,7.82423279 43.1634862,7.85946584 43.2745216,7.85562813 C43.5338374,7.84666553 43.7367132,7.6313391 43.7276576,7.37468316 L43.7276576,7.37468316 L43.467,0.22 L46.9330824,0.00617628491 C48.6691159,-0.10121296 50.1644074,1.2046298 50.2729096,2.92285771 Z';
const STORYBOOK_LETTER =
  'M29.4029796,23.368648 C29.4029796,24.58142 37.6567008,24.00017 38.7646901,23.1482813 C38.7646901,14.8895929 34.2873503,10.5497821 26.0885852,10.5497821 C17.88982,10.5497821 13.2961856,14.9571143 13.2961856,21.5681161 C13.2961856,33.0822778 28.9959487,33.3026444 28.9959487,39.5830962 C28.9959487,41.3460299 28.1237396,42.3927719 26.2048797,42.3927719 C23.7045471,42.3927719 22.7160434,41.1289316 22.832338,36.8317805 C22.832338,35.8995698 13.2961856,35.6089448 13.0054493,36.8317805 C12.2651161,47.2453073 18.8201763,50.248968 26.3211742,50.248968 C33.5895831,50.248968 39.2880157,46.4144645 39.2880157,39.4729126 C39.2880157,27.132376 23.3556634,27.4629261 23.3556634,21.3477494 C23.3556634,18.8686237 25.2163761,18.5380737 26.3211742,18.5380737 C27.4841196,18.5380737 29.5774214,18.7409467 29.4029796,23.368648 Z';

/**
 * Storybook's own icon, standing in for `react-icons`' `SiStorybook`.
 * That one redraws the mark with a lighter letterform and a squarer cover, which reads as an imitation next to the real thing.
 * The artwork is portrait, so `size` sets the height and the width follows the 52:64 box;
 * that keeps its ink the same height as the square marks beside it instead of the same width.
 */
function StorybookMark({ size, ...props }: { size: number } & SVGProps<SVGSVGElement>) {
  /* Autodocs renders several footers into one document, and a shared mask id would let the first
     instance's mask win for all of them. */
  const maskId = useId();

  return (
    <svg height={size} viewBox="0 0 52 64" width={(size * 52) / 64} {...props}>
      <mask id={maskId}>
        <g transform="translate(1,1)">
          <path d={STORYBOOK_COVER} fill="#fff" />
          <path d={STORYBOOK_LETTER} fill="#000" />
        </g>
      </mask>
      <rect fill="currentColor" height="64" mask={`url(#${maskId})`} width="52" />
    </svg>
  );
}

/* From `primer/octicons` (MIT), GitHub's own mark. */
const GITHUB_MARK =
  'M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943';

/**
 * GitHub's own mark, standing in for `react-icons`' `SiGithub`.
 * That one stretches the octocat to the full width of its box, squaring off both shoulders where the silhouette should curve;
 * this one carries half a unit of margin on every side, so nothing meets an edge.
 */
function GithubMark({ size, ...props }: { size: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg height={size} viewBox="0 0 24 24" width={size} {...props}>
      <path d={GITHUB_MARK} fill="currentColor" />
    </svg>
  );
}

/* From Discord's own brand pack (`Discord-Symbol-White.svg`). */
const DISCORD_MARK =
  'M81.15,0c-1.2376,2.1973-2.3489,4.4704-3.3591,6.794-9.5975-1.4396-19.3718-1.4396-28.9945,0-.985-2.3236-2.1216-4.5967-3.3591-6.794-9.0166,1.5407-17.8059,4.2431-26.1405,8.0568C2.779,32.5304-1.6914,56.3725.5312,79.8863c9.6732,7.1476,20.5083,12.603,32.0505,16.0884,2.6014-3.4854,4.8998-7.1981,6.8698-11.0623-3.738-1.3891-7.3497-3.1318-10.8098-5.1523.9092-.6567,1.7932-1.3386,2.6519-1.9953,20.281,9.547,43.7696,9.547,64.0758,0,.8587.7072,1.7427,1.3891,2.6519,1.9953-3.4601,2.0457-7.0718,3.7632-10.835,5.1776,1.97,3.8642,4.2683,7.5769,6.8698,11.0623,11.5419-3.4854,22.3769-8.9156,32.0509-16.0631,2.626-27.2771-4.496-50.9172-18.817-71.8548C98.9811,4.2684,90.1918,1.5659,81.1752.0505l-.0252-.0505ZM42.2802,65.4144c-6.2383,0-11.4159-5.6575-11.4159-12.6535s4.9755-12.6788,11.3907-12.6788,11.5169,5.708,11.4159,12.6788c-.101,6.9708-5.026,12.6535-11.3907,12.6535ZM84.3576,65.4144c-6.2637,0-11.3907-5.6575-11.3907-12.6535s4.9755-12.6788,11.3907-12.6788,11.4917,5.708,11.3906,12.6788c-.101,6.9708-5.026,12.6535-11.3906,12.6535Z';

/**
 * Discord's own Clyde symbol, standing in for `react-icons`' `SiDiscord`.
 * That one is the older mark: no mouth, and smaller eyes.
 * The flat left and right sides are authentic to Clyde and are not a crop;
 * Discord's file has them too.
 * `size` therefore sets the width and the height follows the landscape 126.644:96 box.
 */
function DiscordMark({ size, ...props }: { size: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg height={(size * 96) / 126.644} viewBox="0 0 126.644 96" width={size} {...props}>
      <path d={DISCORD_MARK} fill="currentColor" />
    </svg>
  );
}

/* Two icon families meet in this row, and they disagree about padding: lucide insets its glyphs
   by ~2 units inside the 24-unit box, while the brand-logo sets draw edge-to-edge. Sizing them
   identically would leave the logos flush with the circle's rim, reading as cropped, so each
   entry names the family it belongs to and the brand marks render smaller for equal ink. */
const LINE_GLYPH = 20;
const BRAND_GLYPH = 16;

/* Each mark wears its owner's colour, taken from that owner's published brand material rather
   than sampled from artwork. GitHub's is `#181717`, which would disappear into this band; their
   guidelines offer white as the alternative on dark, so that is what it gets. The privacy shield
   belongs to us, not to a brand, so it stays on the site accent. */
const STORYBOOK_CORAL = '#FF4785';
const GITHUB_ON_DARK = '#FFFFFF';
const DISCORD_BLURPLE = '#5865F2';
const REDDIT_ORANGERED = '#FF4500';
const BGG_ORANGE = '#FF5100';
const SITE_ACCENT = 'var(--color-accent)';

/* `to` marks a routed page; `href` is a destination outside the router: the static Storybook
   build, or an external site (opened in a new tab). */
const footerLinks = [
  {
    href: '/__storybook/',
    icon: StorybookMark,
    size: BRAND_GLYPH,
    tint: STORYBOOK_CORAL,
    label: 'Component library',
  },
  {
    href: 'https://github.com/ndelangen/dunezone',
    icon: GithubMark,
    size: BRAND_GLYPH,
    tint: GITHUB_ON_DARK,
    label: 'Source code',
  },
  {
    to: '/privacy',
    icon: ShieldCheck,
    size: LINE_GLYPH,
    tint: SITE_ACCENT,
    label: 'Privacy policy',
  },
  {
    href: 'https://discord.com/invite/dune-tabletop-624609341886169117',
    icon: DiscordMark,
    size: BRAND_GLYPH,
    tint: DISCORD_BLURPLE,
    label: 'Dune Discord server',
  },
  {
    href: 'https://www.reddit.com/r/DuneBoardGame/',
    icon: FaRedditAlien,
    size: BRAND_GLYPH,
    tint: REDDIT_ORANGERED,
    label: 'r/DuneBoardGame on Reddit',
  },
  {
    href: 'https://boardgamegeek.com/boardgame/283355/dune/forums/69',
    icon: SiBoardgamegeek,
    size: BRAND_GLYPH,
    tint: BGG_ORANGE,
    label: 'Dune forums on BoardGameGeek',
  },
] as const;

/**
 * Public waypoints to the project's component catalogue, source, policies, and community homes.
 * The waypoints are icon-only circles;
 * one `label` per entry fans out to the accessible name and the
 * `Tooltip`, so the two cannot come apart.
 */
export function AppFooter() {
  return (
    <div className={styles.waypoints}>
      <p className={styles.eyebrow}>Continue exploring</p>
      <nav aria-label="Footer">
        {footerLinks.map((entry) => {
          const { icon: Icon, label, size, tint } = entry;
          const glyph = <Icon aria-hidden size={size} strokeWidth={1.8} />;
          /* One declaration drives both halves of the waypoint: the glyph paints with
             `currentColor` and the ring is mixed down from the same value. */
          const tinted = { color: tint };

          return (
            <Tooltip key={label} label={label}>
              {'to' in entry ? (
                <Link aria-label={label} className={styles.waypointLink} style={tinted} to={entry.to}>
                  {glyph}
                </Link>
              ) : (
                <a
                  aria-label={label}
                  className={styles.waypointLink}
                  href={entry.href}
                  style={tinted}
                  {...(entry.href.startsWith('https://')
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : undefined)}
                >
                  {glyph}
                </a>
              )}
            </Tooltip>
          );
        })}
      </nav>
    </div>
  );
}
