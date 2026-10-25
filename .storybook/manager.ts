import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';

import { coreColors } from '../src/shared/uiPalette';
import './playDebugger/manager';

addons.setConfig({
  theme: create({
    base: 'dark',
    appPreviewBg: coreColors.ground,
  }),
});
