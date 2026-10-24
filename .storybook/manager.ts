import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';

import { coreColors } from '../src/shared/uiPalette';

addons.setConfig({
  theme: create({
    base: 'dark',
    appPreviewBg: coreColors.ground,
  }),
});
