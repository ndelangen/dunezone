/*
 * Written descriptions of the leader portrait style, read off the official portraits on dune.zone.
 * `PORTRAIT_RULES` holds what every release shares; `RELEASE_STYLES` holds what each release changed.
 */

export type StyleRow = { label: string; value: string };

/** What every official leader portrait has in common, from the base game to Ecaz & Moritani. */
export const PORTRAIT_RULES: readonly StyleRow[] = [
  {
    label: 'Crop',
    value:
      'Head and shoulders, cut off by the lower edge of a circle. The head sits in the upper half, with the crown of the head or hair touching the top edge or close to it.',
  },
  {
    label: 'Pose',
    value:
      'Turned three-quarters to the left or right, eyes level or glancing aside, mouth closed. Expressions are calm and serious; nobody smiles broadly.',
  },
  {
    label: 'Line',
    value:
      'A dark brown to black ink outline around every shape, with a few interior lines for the nose, cheekbones, eye sockets and folds of cloth.',
  },
  {
    label: 'Light',
    value: 'One soft light from the front and slightly above, so the far side of the face falls into a warm shadow.',
  },
  {
    label: 'Skin',
    value: 'Warm tones: peach, tan and brown, shaded with deeper orange-brown rather than grey.',
  },
  {
    label: 'Clothing',
    value:
      'High collars and fitted tunics, uniforms, robes or hoods. Gold trim, buttons and diamond-shaped insignia are common, and the clothing carries the faction colour.',
  },
];

export type ReleaseStyle = {
  year: string;
  name: string;
  artists: string;
  rows: readonly StyleRow[];
};

/** How each release draws its leaders, oldest first. */
export const RELEASE_STYLES: readonly ReleaseStyle[] = [
  {
    year: '2019',
    name: 'Dune',
    artists: 'Ilya Baranovsky',
    rows: [
      {
        label: 'Line',
        value:
          'Fine ink lines that vary in weight, with short hatching strokes on the cheeks, brow and around the mouth to model the face.',
      },
      {
        label: 'Colour',
        value:
          'Soft, slightly streaky gradients, like marker or watercolour on paper, with the paper grain showing in the lighter areas.',
      },
      {
        label: 'Hair',
        value: 'Drawn in clumps, each outlined, with dark strands inked through them.',
      },
      {
        label: 'Eyes',
        value: 'Pale blue or grey irises with a small white highlight; the Fremen have deep blue irises.',
      },
      {
        label: 'Palette',
        value: 'Muted and earthy: olive and forest green, rust, ochre, sand, slate blue, with gold for trim.',
      },
    ],
  },
  {
    year: '2020',
    name: 'Ixians & Tleilaxu',
    artists: 'Ilya Baranovsky',
    rows: [
      {
        label: 'Line',
        value: 'Bolder outlines and far fewer interior lines; the hatching on the faces is mostly gone.',
      },
      {
        label: 'Colour',
        value:
          'Hard-edged blocks of shadow and light laid over a flat mid-tone, closer to gouache or cel painting than to marker.',
      },
      {
        label: 'Faces',
        value: 'Planes of the face are cut sharply, with strong orange shadows down one side and under the jaw.',
      },
      {
        label: 'Clothing',
        value: 'Simple, heavy shapes: hoods, scarves, padded caps and helmets, with bright edging in white or gold.',
      },
      {
        label: 'Palette',
        value: 'Warmer and more saturated than the base game: brick red, teal, deep green, black, with orange skin.',
      },
    ],
  },
  {
    year: '2022',
    name: 'CHOAM & Richese',
    artists: 'Solveig Reda',
    rows: [
      {
        label: 'Line',
        value: 'A thin, even dark outline drawn digitally, with almost no hatching.',
      },
      {
        label: 'Colour',
        value: 'Smooth digital shading with low contrast: soft-edged shadows that fade into flat colour.',
      },
      {
        label: 'Crop',
        value:
          'Tighter on the face: the head fills more of the circle and only the collar and top of the shoulders show.',
      },
      {
        label: 'Eyes',
        value: 'Often glancing sideways, with dark pupils, pale olive irises and a heavy upper lid line.',
      },
      {
        label: 'Palette',
        value:
          'Courtly colours: crimson, magenta, black, white and grey, with gold piping and buttons; spectacles and pillbox hats as props.',
      },
    ],
  },
  {
    year: '2023',
    name: 'Ecaz & Moritani',
    artists: 'Solveig Reda and Lochen Reda',
    rows: [
      {
        label: 'Line',
        value: 'A thicker, brush-like dark outline that swells and tapers, with clear strand lines in the hair.',
      },
      {
        label: 'Colour',
        value: 'Cel shading in two or three tones per surface, with brighter highlights than CHOAM & Richese.',
      },
      {
        label: 'Detail',
        value:
          'Ornament is drawn out in full: pearl strings, embroidered filigree, hair jewellery, forehead marks and earrings.',
      },
      {
        label: 'Crop',
        value: 'Back to the base game framing, with the shoulders and chest filling the bottom of the circle.',
      },
      {
        label: 'Palette',
        value:
          'Ecaz in rose, pink and magenta with cream pearls; Moritani in maroon, gold and royal blue; travellers in olive and brown.',
      },
    ],
  },
];
