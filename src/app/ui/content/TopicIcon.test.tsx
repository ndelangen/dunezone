import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TOPIC_ICON_TOPICS, TopicIcon } from './TopicIcon';
import type { TopicIconTopic } from './TopicIcon';

const MASK_TOPICS: Array<[TopicIconTopic, string]> = [
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

const COMPONENT_TOPICS: TopicIconTopic[] = ['face', 'text', 'setup', 'rulesets'];

/*
 * The registry's own list, so a topic added there gets the render check below without anyone
 * extending anything. Only that check. The two lists above are written by hand and carry the sharper
 * assertions, and they do not follow the registry: today they omit the four complexity masks and the
 * identity, about and contents glyphs.
 */
const ALL_TOPICS = TOPIC_ICON_TOPICS;

describe('TopicIcon', () => {
  it.each(ALL_TOPICS)('renders the %s topic at all', (topic) => {
    const markup = renderToStaticMarkup(<TopicIcon topic={topic} />);
    expect(markup.length).toBeGreaterThan(0);
  });

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
