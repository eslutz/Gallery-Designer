import { useEffect, useRef, useState } from 'react';
import type { AutoPlacementDiagnostics } from '../placement/autoPlace';
import type { MessageTone } from './galleryState';
import { formatMeasurement } from '../../shared/format/units';
import type { Unit } from '../../types';

export interface AutoPlacementFailure {
  message: string;
  diagnostics: AutoPlacementDiagnostics;
}

export interface UseStatusToastParams {
  message: string;
  messageTone: MessageTone;
  messageRevision: number;
  unit: Unit;
}

/**
 * Owns the status toast lifecycle (show on a new message revision, auto-hide after a
 * tone-dependent delay) and the auto-placement failure detail shown alongside it.
 * `autoPlacementFailure` itself is set from App.tsx's auto-placement handlers, which is
 * why `setAutoPlacementFailure` is part of the returned surface rather than kept private.
 */
export function useStatusToast({
  message,
  messageTone,
  messageRevision,
  unit,
}: UseStatusToastParams) {
  const [autoPlacementFailure, setAutoPlacementFailure] = useState<AutoPlacementFailure | null>(
    null,
  );

  // Tracks the revision already shown so the effect is idempotent: StrictMode
  // double-invokes effects on mount, and a boolean "first render" guard would be
  // consumed by the first invocation and let the second one raise a toast for the
  // initial message.
  const lastToastedRevision = useRef(messageRevision);
  const [toastVisible, setToastVisible] = useState(false);
  useEffect(() => {
    if (messageRevision === lastToastedRevision.current) {
      return;
    }
    lastToastedRevision.current = messageRevision;
    setToastVisible(true);
    const timeout = window.setTimeout(
      () => setToastVisible(false),
      messageTone === 'error' ? 6000 : 4000,
    );
    return () => window.clearTimeout(timeout);
  }, [messageRevision, messageTone]);

  // Announced alongside the toast message but not shown visually: the toast
  // stays scannable while assistive tech still gets the full failure detail.
  const toastDetails =
    autoPlacementFailure?.message === message
      ? `Tried ${autoPlacementFailure.diagnostics.attempts.length} layout strategies with ${formatMeasurement(
          autoPlacementFailure.diagnostics.resolvedGapIn,
          unit,
        )} spacing and a ${formatMeasurement(
          autoPlacementFailure.diagnostics.resolvedOuterMarginIn,
          unit,
        )} wall margin. ${autoPlacementFailure.diagnostics.attempts
          .map((attempt) => `${attempt.family}: ${attempt.reason}`)
          .join(' ')}`
      : undefined;

  function dismissToast() {
    setToastVisible(false);
  }

  return {
    autoPlacementFailure,
    setAutoPlacementFailure,
    toastVisible,
    toastDetails,
    dismissToast,
  };
}
