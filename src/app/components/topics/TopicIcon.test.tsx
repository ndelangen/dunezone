import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TopicIcon } from './TopicIcon';
import type { TopicIconTopic } from './TopicIcon';

const MASK_TOPICS: Array<[TopicIconTopic, string]> = [
  ['identity', '/vector/icon/eye.svg'],
  ['hero', '/vector/generic/ceasar.svg'],
  ['leaders', '/vector/icon/traitor.svg'],
  ['alliance', '/vector/icon/alliance.svg'],
  ['decals', '/vector/icon/alliance.svg'],
  ['troops', '/vector/troop/atreides.svg'],
  ['rules', '/vector/icon/balance.svg'],
  ['advantages', '/vector/icon/kwisatz.svg'],
  ['spice', '/vector/icon/spice.svg'],
  ['karama', '/vector/icon/karama.svg'],
  ['fate', '/vector/icon/fate.svg'],
];

const COMPONENT_TOPICS: TopicIconTopic[] = ['background', 'setup', 'rulesets'];

describe('TopicIcon', () => {
  it.each(MASK_TOPICS)('renders the %s asset as a current-color mask', (topic, src) => {
    const markup = renderToStaticMarkup(<TopicIcon topic={topic} />);

    expect(markup).toContain('<span');
    expect(markup).not.toContain('<img');
    expect(markup).toContain(`mask-image:url(${src})`);
    expect(markup).toContain('background-color:currentColor');
    expect(markup).toContain('aria-hidden="true"');
  });

  it.each(COMPONENT_TOPICS)('renders the %s component glyph', (topic) => {
    const markup = renderToStaticMarkup(<TopicIcon topic={topic} />);

    expect(markup).toContain('<svg');
    expect(markup).toContain('aria-hidden="true"');
  });
});
