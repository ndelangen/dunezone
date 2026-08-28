import { Badge, Button } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@ui/layout/PageLayout';
import { Toolbar } from '@ui/surface/Toolbar';
import { useState } from 'react';

import { SortableHierarchyPrototype } from './edit/-sortableHierarchyPrototype';

type PreviewFit = 'height' | 'width';

export const Route = createFileRoute('/_app/rulesets/$rulesetSlug/rulebooks/$rulebookSlug/edit')({
  component: RulebookEditorPage,
});

function RulebookEditorPage() {
  const [fit, setFit] = useState<PreviewFit>('height');

  return (
    <PageLayout>
      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Badge variant="light" color="yellow">
              Sorting prototype
            </Badge>
          </Toolbar.Left>
          <Toolbar.Right>
            <Button variant="default" onClick={() => setFit((current) => (current === 'height' ? 'width' : 'height'))}>
              Fit {fit === 'height' ? 'width' : 'height'}
            </Button>
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>
      <PageLayout.Content width="viewport">
        <SortableHierarchyPrototype fit={fit} />
      </PageLayout.Content>
    </PageLayout>
  );
}
