import { legacyStoryParameters } from '@sb/legacyStoryParameters';
import preview from '@sb/preview';

import { ButtonGroup } from './ButtonGroup';

const meta = preview.meta({
  component: ButtonGroup,
  parameters: {
    ...legacyStoryParameters,
    layout: 'padded',
  },
});

export const Default = meta.story({
  args: {
    children: (
      <>
        <button type="button">Save</button>
        <button type="button">Cancel</button>
      </>
    ),
  },
});

export const SingleButton = meta.story({
  args: {
    children: <button type="button">Submit</button>,
  },
});

export const ManyButtons = meta.story({
  args: {
    children: (
      <>
        <button type="button">Create</button>
        <button type="button">Edit</button>
        <button type="button">Delete</button>
        <button type="button">Share</button>
      </>
    ),
  },
});
