import { Box } from '@mantine/core';
import { useState } from 'react';
import type { ComponentType } from 'react';
import { fn } from 'storybook/test';

import { CoverEdit, CoverFooterEdit } from './rulebookControlRegionEditors';

function createControlRegionEditorStory<Value>(
  Editor: ComponentType<{ value: Value; onChange: (nextValue: Value) => void }>,
  reportChange: (nextValue: Value) => void
) {
  return function ControlRegionEditorStory({ initialValue }: { initialValue: Value }) {
    const [value, setValue] = useState(initialValue);
    return (
      <Box w="min(35rem, calc(100vw - 2rem))">
        <Editor
          value={value}
          onChange={(nextValue) => {
            reportChange(nextValue);
            setValue(nextValue);
          }}
        />
      </Box>
    );
  };
}

export const coverChange = fn();

export const CoverStory = createControlRegionEditorStory(CoverEdit, coverChange);

export const coverFooterChange = fn();

export const CoverFooterStory = createControlRegionEditorStory(CoverFooterEdit, coverFooterChange);
