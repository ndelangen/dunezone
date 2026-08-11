import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { Toolbar } from './Toolbar';

const meta = preview.meta({
  component: Toolbar,
  parameters: {
    ...legacyStoryParameters,
    layout: 'padded',
  },
});

export const Default = meta.story({
  args: {
    children: [
      <Toolbar.Left key="left">
        <button type="button">Back</button>
      </Toolbar.Left>,
      <Toolbar.Center key="center">
        <strong>Ruleset</strong>
      </Toolbar.Center>,
      <Toolbar.Right key="right">
        <button type="button">Share</button>
        <button type="button">Edit</button>
      </Toolbar.Right>,
    ],
  },
});

export const LeftAndRightOnly = meta.story({
  args: {
    children: [
      <Toolbar.Left key="left">
        <button type="button">Cancel</button>
      </Toolbar.Left>,
      <Toolbar.Right key="right">
        <button type="button">Save</button>
      </Toolbar.Right>,
    ],
  },
});

export const CenterOnly = meta.story({
  args: {
    children: [
      <Toolbar.Center key="center">
        <span>Centered title</span>
      </Toolbar.Center>,
    ],
  },
});

export const IgnoresOtherChildren = meta.story({
  args: {
    children: [
      <Toolbar.Left key="left">
        <span>Visible left</span>
      </Toolbar.Left>,
      <div key="div">This plain div is ignored</div>,
      <Toolbar.Center key="center">
        <span>Visible center</span>
      </Toolbar.Center>,
      'raw text is ignored',
      <Toolbar.Right key="right">
        <span>Visible right</span>
      </Toolbar.Right>,
    ],
  },
});
