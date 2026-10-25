import { createElement } from 'react';
import { addons, types } from 'storybook/manager-api';

import { PLAY_DEBUGGER_ADDON, PLAY_DEBUGGER_PANEL, PLAY_DEBUGGER_PARAMETER } from './events';
import { PlayDebuggerPanel } from './PlayDebuggerPanel';
import { listenForPlay } from './store';

/* The Play debugger: a panel beside game page stories showing the game's state, its history and the controls to move it. */
addons.register(PLAY_DEBUGGER_ADDON, () => {
  listenForPlay();
  addons.add(PLAY_DEBUGGER_PANEL, {
    type: types.PANEL,
    title: 'Play debugger',
    paramKey: PLAY_DEBUGGER_PARAMETER,
    /* The panel is opt-in: Storybook's paramKey only hides it when the parameter says `disable`. */
    disabled: (parameters?: Record<string, unknown>) => !parameters?.[PLAY_DEBUGGER_PARAMETER],
    render: ({ active }) => createElement(PlayDebuggerPanel, { active: !!active }),
  });
});
