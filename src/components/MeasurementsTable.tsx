import { Ruler } from 'lucide-react';
import type { buildMeasurementInstructions } from '../lib/measurements';
import {
  buildMeasurementTableRows,
  formatHookLines,
  MEASUREMENT_TABLE_HEADERS,
} from '../lib/measurementTable';
import { CollapsiblePanel } from './CollapsiblePanel';

export function MeasurementsTable({
  instructions,
}: {
  instructions: ReturnType<typeof buildMeasurementInstructions>;
}) {
  const rows = buildMeasurementTableRows(instructions);
  return (
    <CollapsiblePanel
      icon={<Ruler size={18} />}
      title="Installation measurements"
      ariaLabel="Installation measurements"
      className="measurements-panel"
    >
      <table className="measurements-table" aria-label="Installation measurements">
        <thead>
          <tr>
            {MEASUREMENT_TABLE_HEADERS.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="empty-measurements">
                Place a piece on the wall to see installation measurements.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.order}-${row.pieceLabel}`}>
                <td>{row.order}</td>
                <td>
                  <strong>{row.pieceLabel}</strong>
                  <span className="measurement-secondary">{row.sectionName}</span>
                </td>
                <td>
                  <span>
                    <strong>Top:</strong> {row.topReference}
                  </span>
                  <span>
                    <strong>Side:</strong> {row.sideReference}
                  </span>
                </td>
                <td>
                  {row.hooks.length === 0 ? (
                    'No hook data'
                  ) : (
                    <>
                      {row.hooks.map((hookLine, index) => (
                        <span key={index}>
                          <strong>Hook {index + 1}:</strong> {hookLine}
                        </span>
                      ))}
                    </>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {rows.length > 0 ? (
        <div className="measurement-cards" aria-label="Installation measurements">
          {instructions.map((instruction) => (
            <article className="measurement-card" key={instruction.pieceId}>
              <h3>
                {instruction.order}. {instruction.pieceLabel}
              </h3>
              <p className="muted">{instruction.sectionName}</p>
              <dl>
                <div>
                  <dt>Top</dt>
                  <dd>
                    {instruction.topReference.formatted} from {instruction.topReference.label}
                  </dd>
                </div>
                <div>
                  <dt>Side</dt>
                  <dd>
                    {instruction.sideReference.formatted} from {instruction.sideReference.label}
                  </dd>
                </div>
                {instruction.hooks.length === 0 ? (
                  <div>
                    <dt>Hooks</dt>
                    <dd>No hook data</dd>
                  </div>
                ) : (
                  formatHookLines(instruction.hooks).map((hookLine, index) => (
                    <div key={index}>
                      <dt>Hook {index + 1}</dt>
                      <dd>{hookLine}</dd>
                    </div>
                  ))
                )}
              </dl>
            </article>
          ))}
        </div>
      ) : null}
    </CollapsiblePanel>
  );
}
