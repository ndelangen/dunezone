import { Text } from '@mantine/core';
import preview from '@sb/preview';

import { PairedProofLayout } from './PairedProofLayout';
const meta = preview.meta({ component: PairedProofLayout });
export const Default = meta.story({
  render: () => (
    <PairedProofLayout>
      <PairedProofLayout.First>
        <Text>First proof</Text>
      </PairedProofLayout.First>
      <PairedProofLayout.Settings>
        <Text>Settings for both proofs</Text>
      </PairedProofLayout.Settings>
      <PairedProofLayout.Second>
        <Text>Second proof</Text>
      </PairedProofLayout.Second>
    </PairedProofLayout>
  ),
});
