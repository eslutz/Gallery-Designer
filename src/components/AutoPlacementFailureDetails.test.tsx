import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AutoPlacementFailureDetails } from './AutoPlacementFailureDetails';

describe('AutoPlacementFailureDetails', () => {
  it('renders nothing extra when there are no preserved placements or attempts', () => {
    const { container } = render(
      <AutoPlacementFailureDetails
        diagnostics={{
          resolvedGapIn: 2,
          resolvedOuterMarginIn: 3,
          wallWidthIn: 96,
          wallHeightIn: 48,
          preservedPlacementCount: 0,
          remainingPieceCount: 0,
          attempts: [],
        }}
        unit="in"
      />,
    );

    expect(container.querySelector('p')).toBeNull();
    expect(container.querySelector('ul')).toBeNull();
  });

  it('renders preserved-placement and attempt diagnostics', () => {
    render(
      <AutoPlacementFailureDetails
        diagnostics={{
          resolvedGapIn: 2,
          resolvedOuterMarginIn: 3,
          wallWidthIn: 96,
          wallHeightIn: 48,
          preservedPlacementCount: 1,
          remainingPieceCount: 2,
          attempts: [
            {
              family: 'grid',
              reason: 'Not enough space',
              requiredWidthIn: 100,
              requiredHeightIn: 50,
            },
          ],
        }}
        unit="in"
      />,
    );

    expect(screen.getByText(/1 fixed piece reduced the space/)).toBeInTheDocument();
    expect(screen.getByText(/2 remaining pieces/)).toBeInTheDocument();
    expect(screen.getByText('Grid:')).toBeInTheDocument();
    expect(screen.getByText(/Not enough space/)).toBeInTheDocument();
    expect(screen.getByText(/Needs .*wide x/)).toBeInTheDocument();
  });
});
