import type { z } from 'zod';

import { backgroundPresets } from '../data/backgrounds';
import type { Treachery } from '../data/objects';

export type TreacheryCardData = z.infer<typeof Treachery>;

const card = (data: TreacheryCardData) => data;

/** Representative authored inputs shared by stories and live rulebook compositions. */
export const treacheryCardFixtures = {
  maulaPistol: card({
    head: backgroundPresets.weapon,
    icon: [backgroundPresets.stripedWeapon, '/vector/icon/projectile.svg'],
    name: 'Maula Pistol',
    decals: [
      {
        id: '/vector/decal/maula-pistol.svg',
        muted: false,
        offset: [0, 0],
        outline: true,
        scale: 1.2166,
      },
    ],
    text: "Play as part of your Battle Plan.\nKills opponent's leader before battle is resolved. Opponent may protect leader with a Shield.\nYou may keep this card if you win this battle.",
    subName: 'Weapon - Projectile',
  }),
  chaumas: card({
    head: backgroundPresets.weapon,
    icon: [backgroundPresets.stripedWeapon, '/vector/icon/poison.svg'],
    name: 'Chaumas',
    decals: [
      {
        id: '/vector/decal/chaumas.svg',
        muted: false,
        offset: [0, 0],
        outline: true,
        scale: 1.155,
      },
    ],
    text: "Play as part of your Battle Plan.\nKills opponent's leader before battle is resolved. Opponent may protect leader with a Snooper.\nYou may keep this card if you win this battle.",
    subName: 'Weapon - Poison',
  }),
  lasgun: card({
    head: backgroundPresets.weapon,
    icon: [backgroundPresets.stripedWeapon, '/vector/icon/lightning.svg'],
    name: 'Lasgun',
    decals: [
      {
        id: '/vector/decal/lasgun-extra.svg',
        muted: false,
        offset: [0, 100],
        outline: false,
        scale: 1.2166,
      },
      {
        id: '/vector/decal/lasgun.svg',
        muted: false,
        offset: [0, -50],
        outline: true,
        scale: 1.2166,
      },
    ],
    text: "Play as part of your Battle Plan.\nAutomatically kills opponent's leader regardless of defense card used.\nYou may keep this card if you win this battle.\nIf anyone plays a Shield in this battle, all forces, leaders and spice in the battle's territory die. Any spice dialed and in the battle's territory is lost. Both players lose this battle.",
    subName: 'Weapon - Special',
  }),
  weirdingWay: card({
    head: backgroundPresets.weapon,
    icon: [backgroundPresets.stripedWeapon, '/vector/icon/projectile.svg'],
    name: 'Weirding Way',
    decals: [
      {
        id: '/vector/decal/weirding-way-multicolor.svg',
        muted: false,
        offset: [0, 0],
        outline: false,
        scale: 1.7922,
      },
    ],
    text: 'Play as part of your Battle Plan.\nCounts as a projectile weapon, unless played with another weapon. In that case, it counts as a projectile defense.\nYou may keep this card if you win this battle.',
    subName: 'Weapon - Special',
  }),
  shield: card({
    head: backgroundPresets.defense,
    icon: [backgroundPresets.stripedDefense, '/vector/icon/shield.svg'],
    iconOffset: [0, 8],
    name: 'Shield',
    decals: [
      {
        id: '/vector/decal/shield.svg',
        muted: false,
        offset: [0, 0],
        outline: true,
        scale: 0.7071,
      },
    ],
    text: 'Play as part of your Battle Plan.\n\nProtects your leader from a projectile weapon in this battle.\n\nYou may keep this card if you win this battle.',
    subName: 'Defense - Projectile',
  }),
  chemistry: card({
    head: backgroundPresets.defense,
    icon: [backgroundPresets.stripedDefense, '/vector/icon/snooper.svg'],
    iconOffset: [0, 8],
    name: 'Chemistry',
    decals: [
      {
        id: '/vector/decal/chemistry-multicolor.svg',
        muted: false,
        offset: [0, 0],
        outline: false,
        scale: 1.7619,
      },
    ],
    text: 'Play as part of your Battle Plan.\n\nCounts as a poison defense, unless played with another defense. In that case, it counts as a poison weapon.\n\nYou may keep this card if you win this battle.',
    subName: 'Defense - Poison - Special',
  }),
  snooper: card({
    head: backgroundPresets.defense,
    icon: [backgroundPresets.stripedDefense, '/vector/icon/snooper.svg'],
    iconOffset: [0, 8],
    name: 'Snooper',
    decals: [
      {
        id: '/vector/decal/snooper.svg',
        muted: false,
        offset: [0, 0],
        outline: true,
        scale: 0.8684,
      },
    ],
    text: 'Play as part of your Battle Plan.\n\nProtects your leader from a poison weapon in this battle.\n\nYou may keep this card if you win this battle.',
    subName: 'Defense - Poison',
  }),
  cheapHero: card({
    head: backgroundPresets.special,
    icon: [backgroundPresets.stripedSpecial, '/vector/icon/hand-alt.svg'],
    iconOffset: [0, 2],
    name: 'Cheap Hero',
    decals: [
      {
        id: '/vector/decal/cheap-hero.svg',
        muted: false,
        offset: [0, 20],
        outline: true,
        scale: 0.9092,
      },
    ],
    text: 'Play as a leader with zero strength on your Battle Plan and discard after the battle.\n\nYou may also play a weapon and a defense. The cheap hero may be played in place of a leader or when you have no leaders available.',
    subName: 'Special - Leader',
  }),
  femaleCheapHero: card({
    head: backgroundPresets.special,
    icon: [backgroundPresets.stripedSpecial, '/vector/icon/hand-alt.svg'],
    iconOffset: [0, 2],
    name: 'Cheap Hero',
    decals: [
      {
        id: '/vector/decal/cheap-heroine.svg',
        muted: false,
        offset: [0, 20],
        outline: true,
        scale: 0.9,
      },
    ],
    text: 'Play as a leader with zero strength on your Battle Plan and discard after the battle.\n\nYou may also play a weapon and a defense. The cheap hero may be played in place of a leader or when you have no leaders available.',
    subName: 'Special - Leader',
  }),
  baliset: card({
    head: backgroundPresets.worthless,
    icon: [backgroundPresets.stripedWorthless, '/vector/icon/worthless.svg'],
    iconOffset: [0, 1],
    name: 'Baliset',
    decals: [
      {
        id: '/vector/decal/baliset.svg',
        muted: false,
        offset: [0, 0],
        outline: true,
        scale: 1.0428,
      },
    ],
    text: 'Play as part of your Battle Plan, in place of a weapon, defense, or both.\nThis card has no value in play, and you can discard it only by playing it in your Battle Plan.',
    subName: 'Worthless',
  }),
  supplies: card({
    head: backgroundPresets.special,
    icon: [backgroundPresets.stripedSpecial, '/vector/icon/hand-alt.svg'],
    iconOffset: [0, 2],
    name: 'Supplies!',
    decals: [
      {
        id: '/vector/decal/supplies.svg',
        muted: false,
        offset: [0, 0],
        outline: true,
        scale: 0.7,
      },
    ],
    text: 'Play in the Battle Phase, if in Battle before The Voice step.\n\nUntil the end of this Battle Phase, you get the Supplies! tokens. These may be used as treachery cards of corresponding types.',
    subName: 'Special - Instant',
  }),
  karama: card({
    head: backgroundPresets.special,
    icon: [backgroundPresets.stripedSpecial, '/vector/icon/hand-alt.svg'],
    iconOffset: [0, 2],
    name: 'Karama',
    decals: [
      {
        id: '/vector/icon/karama.svg',
        muted: false,
        offset: [0, 0],
        outline: true,
        scale: 0.906,
      },
    ],
    text: "Play this card to do one of the following:\n• Disable a faction advantage for the rest of the phase.\n• Pay Guild rates when you or your ally ships forces onto the planet.\n• If your hand is not full and it's your turn to bid, purchase the card up for bid without paying spice.",
    subName: 'Special - Instant',
  }),
  truthTrance: card({
    head: backgroundPresets.special,
    icon: [backgroundPresets.stripedSpecial, '/vector/icon/hand-alt.svg'],
    iconOffset: [0, 2],
    name: 'Truth Trance',
    decals: [
      {
        id: '/vector/decal/truth-trance.svg',
        muted: false,
        offset: [0, 0],
        outline: true,
        scale: 1.3655,
      },
    ],
    text: 'Play at any time.\nPublicly ask one other player a yes/no question that must be answered publicly. The game pauses until an answer is given.',
    subName: 'Special - Instant',
  }),
  weatherControl: card({
    head: backgroundPresets.special,
    icon: [backgroundPresets.stripedSpecial, '/vector/icon/hand-alt.svg'],
    iconOffset: [0, 2],
    name: 'Weather Control',
    decals: [
      {
        id: '/vector/decal/weather-control.svg',
        muted: false,
        offset: [0, 20],
        outline: true,
        scale: 1.3847,
      },
    ],
    text: 'After the first game turn, play during the Storm Phase after seeing how far the storm moves. You control the storm this turn instead.',
    subName: 'Special - Instant',
  }),
  familyAtomics: card({
    head: backgroundPresets.special,
    icon: [backgroundPresets.stripedSpecial, '/vector/icon/hand-alt.svg'],
    iconOffset: [0, 2],
    name: 'Family Atomics',
    decals: [
      {
        id: '/vector/decal/family-atomics-multicolor.svg',
        muted: false,
        offset: [0, 0],
        outline: false,
        scale: 1.5102,
      },
    ],
    text: 'Play after turn 1 when the storm has been calculated. All forces on the Shield Wall are killed and it no longer protects adjacent territories.',
    subName: 'Special - Storm phase',
  }),
  mercenaries: card({
    head: backgroundPresets.special,
    icon: [backgroundPresets.stripedSpecial, '/vector/icon/hand-alt.svg'],
    iconOffset: [0, 2],
    name: 'Mercenaries',
    decals: [
      {
        id: '/vector/decal/mercenaries.svg',
        muted: false,
        offset: [0, 0],
        outline: true,
        scale: 0.9,
      },
    ],
    text: 'Play in your Battle Plan. Does not take a weapon or defense slot. Add +1 to your number dialed and win ties regardless of Storm Order.',
    subName: 'Special - Battle',
  }),
  ernocSeed: card({
    head: backgroundPresets.weapon,
    icon: [backgroundPresets.stripedWeapon, '/vector/icon/poison.svg'],
    name: 'Ernoc Seed!',
    decals: [
      {
        id: '/vector/decal/flagella.svg',
        muted: false,
        offset: [0, 0],
        outline: true,
        scale: 0.9428,
      },
    ],
    text: "Play as part of your Battle Plan.\n\nKills opponent's leader before battle is resolved. Opponent may protect leader with a Snooper.\n\nReturn this card to the Supplies! cache after the Battle phase.",
    subName: 'Weapon - Poison',
  }),
  trishula: card({
    head: backgroundPresets.weapon,
    icon: [backgroundPresets.stripedWeapon, '/vector/icon/projectile.svg'],
    name: 'Trishula!',
    decals: [
      {
        id: '/vector/decal/thumper-alt.svg',
        muted: false,
        offset: [0, 0],
        outline: true,
        scale: 0.9139,
      },
    ],
    text: "Play as part of your Battle Plan.\n\nKills opponent's leader before battle is resolved. Opponent may protect leader with a Shield.\n\nReturn this card to the Supplies! cache after the Battle phase.",
    subName: 'Weapon - Projectile',
  }),
  phrinePen: card({
    head: backgroundPresets.defense,
    icon: [backgroundPresets.stripedDefense, '/vector/icon/poison.svg'],
    iconOffset: [0, 8],
    name: 'Phrine Pen!',
    decals: [
      {
        id: '/vector/decal/injection.svg',
        muted: false,
        offset: [0, 0],
        outline: true,
        scale: 0.8824,
      },
    ],
    text: 'Play as part of your Battle Plan.\n\nProtects your leader from a poison weapon.\n\nReturn this card to the Supplies! cache after the Battle phase.',
    subName: 'Defense - Poison',
  }),
  suppliesShield: card({
    head: backgroundPresets.defense,
    icon: [backgroundPresets.stripedDefense, '/vector/icon/shield.svg'],
    iconOffset: [0, 8],
    name: 'Shield!',
    decals: [
      { id: '/vector/decal/target.svg', muted: false, offset: [0, 0], outline: true, scale: 0.7 },
    ],
    text: 'Play as part of your Battle Plan.\n\nProtects your leader from a projectile weapon.\n\nReturn this card to the Supplies! cache after the Battle phase.',
    subName: 'Defense - Shield',
  }),
  richeseKarama: card({
    head: backgroundPresets.storm,
    icon: [backgroundPresets.stripedSpecial, '/vector/logo/richese.svg'],
    iconOffset: [0, -5],
    name: 'Richese Karama',
    decals: [
      {
        id: '/vector/icon/karama.svg',
        muted: false,
        offset: [0, 0],
        outline: true,
        scale: 0.604,
      },
    ],
    text: 'Play this card as a Karama card or use its Richese-specific special effect.',
    subName: 'Special - Instant',
  }),
  shaiHulud: card({
    head: backgroundPresets.spice,
    icon: [backgroundPresets.stripedSpice, '/vector/icon/shai-hulud.svg'],
    iconOffset: [0, 20],
    iconScale: 1.3,
    decals: [
      {
        id: '/vector/decal/shai-hulud-plus.svg',
        muted: false,
        outline: false,
        scale: 1.738,
        offset: [0, 0],
      },
      {
        id: '/vector/decal/shai-hulud.svg',
        muted: false,
        outline: true,
        scale: 0.9,
        offset: [-14, 0],
      },
    ],
    name: 'Shai-Hulud',
    subName: 'Event',
    text: 'Place a Shai-Hulud in the territory on top of this spice blow discard pile. At the end of the Spice Blow Phase, it kills all forces and destroys all spice in its territory.',
  }),
  noSnooper: card({
    head: backgroundPresets.beneGesserit,
    icon: [backgroundPresets.stripedDefense, '/vector/icon/snooper.svg'],
    iconOffset: [0, 8],
    decals: [
      {
        id: '/vector/decal/snooper.svg',
        muted: true,
        offset: [0, 0],
        outline: false,
        scale: 1.2158,
      },
      {
        id: '/vector/decal/block.svg',
        muted: false,
        offset: [0, 0],
        outline: true,
        scale: 0.7,
      },
    ],
    name: 'No Snooper',
    subName: 'Voice',
    text: 'You are not allowed to play a Snooper card in this battle. You may play any card that says “special” on it, including Chemistry.',
  }),
  layeredDecals: card({
    head: backgroundPresets.worthless,
    icon: [backgroundPresets.stripedWorthless, '/vector/icon/traitor.svg'],
    iconOffset: [0, 2],
    name: 'Layered Decals',
    decals: [
      {
        id: '/vector/decal/troll.svg',
        muted: true,
        offset: [165, 0],
        outline: false,
        scale: 0.9658,
      },
      {
        id: '/vector/icon/traitor.svg',
        muted: false,
        offset: [0, 0],
        outline: true,
        scale: 0.5,
      },
    ],
    text: 'This representative case demonstrates muted artwork, outlines, offsets, and multiple layered decals.',
    subName: 'Composition example',
  }),
};
