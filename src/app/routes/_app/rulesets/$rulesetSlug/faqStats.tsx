import { TopicIcon } from '@ui/content/TopicIcon';
import type { StatsItem } from '@ui/list/Stats';
import { CheckCircle2 } from 'lucide-react';

/**
 * A ruleset's two FAQ counts as header stats: its questions and how many have an accepted answer.
 * The ruleset page and its FAQ page both show them, so they read the same in both bands.
 */
export function rulesetFaqStats({ questions, answered }: { questions: number; answered: number }): StatsItem[] {
  return [
    {
      key: 'questions',
      icon: <TopicIcon topic="faq" size={17} />,
      value: questions,
      label: `${questions} ${questions === 1 ? 'question' : 'questions'}`,
    },
    {
      key: 'answered',
      icon: <CheckCircle2 size={17} aria-hidden />,
      value: answered,
      label: `${answered} answered ${answered === 1 ? 'question' : 'questions'}`,
    },
  ];
}
