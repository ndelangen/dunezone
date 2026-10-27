import preview from '@sb/preview';
import { TokenImage } from '@ui/content/TokenImage';
import { expect, within } from 'storybook/test';

import { TallyList } from './TallyList';

const face = (width: number, height: number) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#4b4c0d"/></svg>`)}`;

const meta = preview.meta({
  component: TallyList,
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div style={{ maxWidth: '28rem' }}>{Story()}</div>],
  args: {
    items: [
      {
        key: 'board',
        figure: <TokenImage src={face(600, 600)} name="Arrakis" shape="round" />,
        title: 'Board',
        detail: 'Arrakis',
        count: '1',
        countLabel: '1 board',
      },
      {
        key: 'treachery',
        figure: <img src={face(400, 560)} alt="" style={{ display: 'block', width: '100%' }} />,
        figureShape: 'card' as const,
        title: 'Treachery deck',
        detail: 'Dreamrules treachery',
        count: '40+',
        countLabel: '40+ cards',
      },
      {
        key: 'tech',
        figure: <TokenImage src={face(600, 600)} name="Tech tokens" shape="gear" />,
        title: 'Tech tokens',
        detail: 'Ixian tech',
        count: '9',
        countLabel: '9 tokens',
      },
    ],
  },
});

/** Each thing ruled off, its picture first and its count large at the end; the count reads in words to assistive tech. */
export const Default = meta.story({
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3);
    await expect(canvas.getByLabelText('40+ cards')).toHaveTextContent('40+');
  },
});
