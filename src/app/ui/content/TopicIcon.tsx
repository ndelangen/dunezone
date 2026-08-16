import { BookOpen, Image as ImageIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const TOPIC_ICON_DEFINITIONS = {
  identity: { kind: 'mask', src: '/vector/icon/eye.svg' },
  background: { kind: 'component', component: ImageIcon },
  hero: { kind: 'mask', src: '/vector/generic/ceasar.svg' },
  leaders: { kind: 'mask', src: '/vector/icon/traitor.svg' },
  alliance: { kind: 'mask', src: '/vector/icon/alliance.svg' },
  decals: { kind: 'mask', src: '/vector/icon/alliance.svg' },
  troops: { kind: 'mask', src: '/vector/troop/atreides.svg' },
  rules: { kind: 'mask', src: '/vector/icon/balance.svg' },
  advantages: { kind: 'mask', src: '/vector/icon/kwisatz.svg' },
  spice: { kind: 'mask', src: '/vector/icon/spice.svg' },
  complexityNovice: { kind: 'mask', src: '/vector/icon/faction-complexity-1.svg' },
  complexityIntermediate: { kind: 'mask', src: '/vector/icon/faction-complexity-2.svg' },
  complexityExpert: { kind: 'mask', src: '/vector/icon/faction-complexity-3.svg' },
  complexityMaster: { kind: 'mask', src: '/vector/icon/faction-complexity-4.svg' },
  setup: { kind: 'component', component: BookOpen },
  karama: { kind: 'mask', src: '/vector/icon/karama.svg' },
  rulesets: { kind: 'component', component: BookOpen },
  fate: { kind: 'mask', src: '/vector/icon/fate.svg' },
} as const satisfies Record<string, { kind: 'mask'; src: string } | { kind: 'component'; component: LucideIcon }>;

export type TopicIconTopic = keyof typeof TOPIC_ICON_DEFINITIONS;

export const TOPIC_ICON_TOPICS = Object.keys(TOPIC_ICON_DEFINITIONS) as TopicIconTopic[];

export interface TopicIconProps {
  topic: TopicIconTopic;
  size?: number;
  className?: string;
}

/**
 * The canonical, decorative icon for a recurring application topic.
 * The surrounding heading or label owns the accessible name.
 */
export function TopicIcon({ topic, size = 16, className }: TopicIconProps) {
  const definition = TOPIC_ICON_DEFINITIONS[topic];

  if (definition.kind === 'component') {
    const Icon = definition.component;
    return <Icon className={className} size={size} aria-hidden />;
  }

  return (
    <span
      className={className}
      aria-hidden
      style={{
        display: 'block',
        flex: '0 0 auto',
        width: size,
        height: size,
        backgroundColor: 'currentColor',
        maskImage: `url(${definition.src})`,
        maskPosition: 'center',
        maskRepeat: 'no-repeat',
        maskSize: 'contain',
        WebkitMaskImage: `url(${definition.src})`,
        WebkitMaskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
      }}
    />
  );
}
