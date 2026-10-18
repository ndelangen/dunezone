import styles from './TypeSpecimen.module.css';

type Face = {
  name: string;
  /** The family dune.zone loads the face under. */
  family: string;
  /** The weight and case the game sets it in. */
  cut: string;
  /** The two glyphs shown large. */
  glyphs: string;
  sample: string;
  uppercase?: boolean;
  /** Where the printed game uses it, after Pkfod's list on BoardGameGeek. */
  printed: string;
  /** Where dune.zone draws with it. */
  site: string;
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789';
const CAPITALS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789';

const FACES: readonly Face[] = [
  {
    name: 'Copperplate Gothic',
    family: 'C_Copperplate_Gothic',
    cut: 'Bold. Small capitals by design, so it is never lowercase',
    glyphs: 'Aa',
    sample: 'Thufir Hawat',
    printed:
      'Card headers, board territories, leader token names, titles in the rulebook and faction sheets, the storm marker',
    site: 'Card titles, leader token names, faction sheet headers, every heading on this site',
  },
  {
    name: 'Candara',
    family: 'C_Candara',
    cut: 'Regular, mixed case, left aligned',
    glyphs: 'Aa',
    sample: 'Play as part of your battle plan.',
    printed: 'Card rules text, battle wheel text',
    site: 'Card rules text, storm cards, the text you are reading now',
  },
  {
    name: 'Trebuchet',
    family: 'C_Trebuchet',
    cut: 'Bold, title case',
    glyphs: 'Aa',
    sample: 'Weapon - Projectile',
    printed: 'Card title text',
    site: 'The type line under a card title, rulebook body text',
  },
  {
    name: 'Caladea',
    family: 'Caladea',
    cut: 'Regular, mixed case',
    glyphs: 'Aa',
    sample: 'At start of game, you may predict a winner.',
    printed:
      'Rulebook and faction sheet body text, the back of the player shields, storm card and Kwisatz Haderach numerals',
    site: 'Faction sheet text, traitor card names, rulebook body text',
  },
  {
    name: 'Busorama',
    family: 'C_Busorama',
    cut: 'Capitals only, filled with the gold gradient',
    glyphs: 'TR',
    sample: 'Treachery',
    uppercase: true,
    printed: 'The words on the card backs, the Kwisatz Haderach token',
    site: 'Card backs, filled with a gold gradient',
  },
  {
    name: 'Desdemona',
    family: 'C_Desdemona',
    cut: 'Black, capitals only, filled with the gold gradient',
    glyphs: 'AT',
    sample: 'Atreides',
    uppercase: true,
    printed: 'The faction name on the front of the player shields',
    site: 'Shield names, page titles',
  },
  {
    name: 'Advokat Modern',
    family: 'C_Advokat_Modern',
    cut: 'Regular. Numerals only; the words beside them are set in Copperplate',
    glyphs: '57',
    sample: '0 1 2 3 4 5 6 7 8 9',
    printed:
      'Numbers: the turn track, spice blow amounts, battle wheels, spice tokens, leader strengths, prediction cards',
    site: 'Leader strengths, spice card amounts, battle wheel numbers, the turn tracker',
  },
];

/** Each typeface of the printed game set in itself on a specimen sheet, with its cut and where the game and dune.zone use it. */
export function TypeSpecimen() {
  return (
    <div className={styles.grid}>
      {FACES.map((face, index) => {
        const font = {
          fontFamily: `"${face.family}"`,
          textTransform: face.uppercase ? 'uppercase' : undefined,
        } as const;
        return (
          <article key={face.name} className={styles.sheet}>
            <header className={styles.head}>
              <span className={styles.index}>{String(index + 1).padStart(2, '0')}</span>
              <span className={styles.name}>{face.name}</span>
            </header>
            <p className={styles.glyphs} style={font} aria-hidden>
              {face.glyphs}
            </p>
            <p className={styles.sample} style={font}>
              {face.sample}
            </p>
            <p className={styles.alphabet} style={font} aria-hidden>
              {face.uppercase ? CAPITALS : ALPHABET}
            </p>
            <dl className={styles.uses}>
              <dt>Cut</dt>
              <dd>{face.cut}</dd>
              <dt>In the box</dt>
              <dd>{face.printed}</dd>
              <dt>On dune.zone</dt>
              <dd>{face.site}</dd>
            </dl>
          </article>
        );
      })}
    </div>
  );
}
