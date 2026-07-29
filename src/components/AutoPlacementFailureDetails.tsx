import type { AutoPlacementDiagnostics } from '../lib/autoPlace';
import { formatCount } from '../lib/formatCount';
import { formatMeasurement } from '../lib/units';
import type { Unit } from '../types';

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function AutoPlacementFailureDetails({
  diagnostics,
  unit,
}: {
  diagnostics: AutoPlacementDiagnostics;
  unit: Unit;
}) {
  return (
    <div className="auto-placement-diagnostics">
      {diagnostics.preservedPlacementCount > 0 ? (
        <p>
          {formatCount(diagnostics.preservedPlacementCount, 'fixed piece')} reduced the space
          available for {formatCount(diagnostics.remainingPieceCount, 'remaining piece')}.
        </p>
      ) : null}
      {diagnostics.attempts.length > 0 ? (
        <>
          <p>
            Tried {diagnostics.attempts.length} layout strategies with{' '}
            {formatMeasurement(diagnostics.resolvedGapIn, unit)} spacing and a{' '}
            {formatMeasurement(diagnostics.resolvedOuterMarginIn, unit)} wall margin.
          </p>
          <ul>
            {diagnostics.attempts.map((attempt) => (
              <li key={attempt.family}>
                <strong>{capitalize(attempt.family)}:</strong> {attempt.reason}
                {attempt.requiredWidthIn !== undefined && attempt.requiredHeightIn !== undefined ? (
                  <span>
                    {' '}
                    Needs {formatMeasurement(attempt.requiredWidthIn, unit)} wide x{' '}
                    {formatMeasurement(attempt.requiredHeightIn, unit)} tall including margins; wall
                    bounds are {formatMeasurement(diagnostics.wallWidthIn, unit)} x{' '}
                    {formatMeasurement(diagnostics.wallHeightIn, unit)}.
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
