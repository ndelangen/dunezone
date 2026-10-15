import { Section } from '@ui/block/Section';

import { Lead, Paragraph } from '../postContent';
import { CardBackLayers, CardFrontLayers, LeaderTokenLayers } from './assets/figures';
import { NoiseComparison } from './assets/NoiseComparison';

export default function Post() {
  return (
    <>
      <Lead>Draft.</Lead>
      <Section title="The token, pulled apart">
        <Paragraph>Draft.</Paragraph>
        <LeaderTokenLayers />
      </Section>
      <Section title="Noise">
        <NoiseComparison />
      </Section>
      <Section title="Cards">
        <CardBackLayers />
        <CardFrontLayers />
      </Section>
    </>
  );
}
