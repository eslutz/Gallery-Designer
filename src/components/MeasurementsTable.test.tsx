import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MeasurementInstruction } from '../types';
import { MeasurementsTable } from './MeasurementsTable';

const instructions: MeasurementInstruction[] = [
  {
    order: 1,
    pieceId: 'piece-1',
    pieceLabel: 'Sunset',
    sectionName: 'Section 1',
    pieceDimensions: { widthIn: 16, heightIn: 20, formatted: '16 x 20 in' },
    topReference: { label: 'the floor', distanceIn: 60, formatted: '60 in' },
    sideReference: { label: 'the left wall', distanceIn: 10, formatted: '10 in', anchor: 'left' },
    hooks: [
      {
        label: 'Hook',
        topReference: { label: 'the floor', distanceIn: 62, formatted: '62 in' },
        sideReference: { label: 'the left wall', distanceIn: 18, formatted: '18 in' },
      },
    ],
  },
];

describe('MeasurementsTable', () => {
  it('shows an empty-state row when there are no instructions', () => {
    render(<MeasurementsTable instructions={[]} />);

    expect(
      screen.getByText('Place a piece on the wall to see installation measurements.'),
    ).toBeInTheDocument();
  });

  it('renders a table row and a matching card for each instruction', () => {
    render(<MeasurementsTable instructions={instructions} />);

    expect(screen.getAllByText('Sunset').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/60 in.*from.*the floor/).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/62 in from the floor; 18 in from the left wall/).length,
    ).toBeGreaterThan(0);
  });
});
