import { type ComponentProps, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Background, backgroundTreatment } from './Background';

type BackgroundProps = ComponentProps<typeof Background>;

describe('background studio renderer treatment', () => {
  it('maps invert and the full definition range to visibly different mask filters', () => {
    expect(backgroundTreatment({ invert: false, definition: 0, influence: 0.2 })).toEqual({
      patternFilter: 'grayscale(1) invert(0) contrast(0.65) blur(0.75px)',
      patternOpacity: 0.2,
    });
    expect(backgroundTreatment({ invert: true, definition: 1, influence: 0.9 })).toEqual({
      patternFilter: 'grayscale(1) invert(1) contrast(3.00) blur(0.00px)',
      patternOpacity: 0.9,
    });
  });

  const layerCases: Array<{
    name: string;
    colors: BackgroundProps['colors'];
    expected: string;
  }> = [
    {
      name: 'solid',
      colors: ['#112233', '#d7aa55'],
      expected: 'fill="#112233"',
    },
    {
      name: 'linear',
      colors: [
        '#112233',
        {
          type: 'linear',
          angle: 45,
          stops: [
            ['#000000', 0],
            ['#ffffff', 1],
          ],
        },
      ],
      expected: '<linearGradient',
    },
    {
      name: 'radial',
      colors: [
        {
          type: 'radial',
          x: 30,
          y: 40,
          r: 70,
          stops: [
            ['#000000', 0],
            ['#ffffff', 1],
          ],
        },
        '#d7aa55',
      ],
      expected: '<radialGradient',
    },
  ];

  it.each(layerCases)('renders $name layers through the same treated composite', ({
    colors,
    expected,
  }) => {
    const html = renderToStaticMarkup(
      createElement(Background, {
        image: '/image/texture/021.jpg',
        colors,
        invert: true,
        definition: 0.5,
        influence: 0.35,
      })
    );

    expect(html).toContain(expected);
    expect(html).toContain('grayscale(1) invert(1) contrast(1.83) blur(0.38px)');
    expect(html).toContain('opacity="0.35"');
  });
});
