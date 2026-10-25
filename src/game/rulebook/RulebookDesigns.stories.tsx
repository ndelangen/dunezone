import preview from '@sb/preview';
import { rulebookDesignCatalogue, rulebookSizeCatalogue } from '@shared/rulebooks/settings';

import { DesignPages } from './RulebookDesigns.stories.fixture';

const meta = preview.meta({
  title: 'Document/Sizes and styles',
  component: DesignPages,
  args: { size: 'a4', design: 'illustrated' },
  argTypes: {
    size: { control: 'radio', options: rulebookSizeCatalogue.map(({ id }) => id) },
    design: { control: 'radio', options: rulebookDesignCatalogue.map(({ id }) => id) },
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ padding: '1rem' }}>
        <style>{`
          @media screen {
            [data-rulebook-design-example] .rulebookDocument {
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 2px;
              align-items: start;
            }
          }
        `}</style>
        <Story />
      </div>
    ),
  ],
});

export const SizeAndDesignMatrix = meta.story({
  render: () => (
    <div style={{ display: 'grid', gap: '2rem' }}>
      {rulebookSizeCatalogue.map((size) => (
        <section key={size.id}>
          <h2>{`${size.label}, ${size.widthMm} x ${size.heightMm} mm`}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '2rem' }}>
            {rulebookDesignCatalogue.map((design) => (
              <div key={design.id}>
                <h3>{design.label}</h3>
                <DesignPages size={size.id} design={design.id} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  ),
});
