import { SectionedSurface } from './SectionedSurface';
import { SurfaceFiller } from './SurfaceFiller.stories.fixture';

export function rows(count: number, extra?: (index: number) => Record<string, unknown>) {
  return Array.from({ length: count }, (_, index) => (
    <SectionedSurface.Row key={index} {...(extra?.(index) ?? {})}>
      <SurfaceFiller height={20} />
    </SectionedSurface.Row>
  ));
}
