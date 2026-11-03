import type { GuideTask } from './TutorialGuide';

/* Each task keeps its own kind of baseline; the guide only hands it back. */
export const task = <Baseline>(definition: GuideTask<Baseline>) => definition as unknown as GuideTask;
