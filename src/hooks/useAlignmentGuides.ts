import { useEffect, useRef, useState } from 'react';
import type { VisibleAlignmentGuides } from '../components/WallCanvas';
import type { AlignmentGuide } from '../lib/snapping';

/**
 * Owns the transient "alignment guide" overlay state shown while dragging pieces or
 * features around the wall: which guide lines are visible, and whether they should
 * keep lingering on screen for a moment after the drag settles.
 */
export function useAlignmentGuides(showAlignmentGuidesFeature: boolean) {
  const [visibleAlignmentGuides, setVisibleAlignmentGuides] = useState<VisibleAlignmentGuides>({
    guides: [],
    isLingering: false,
  });
  const alignmentGuideTimeoutRef = useRef<number | null>(null);

  function clearAlignmentGuideTimeout() {
    if (alignmentGuideTimeoutRef.current !== null) {
      window.clearTimeout(alignmentGuideTimeoutRef.current);
      alignmentGuideTimeoutRef.current = null;
    }
  }

  function showAlignmentGuides(guides: AlignmentGuide[]) {
    clearAlignmentGuideTimeout();
    setVisibleAlignmentGuides({
      guides: guides.slice(0, 2),
      isLingering: false,
    });
  }

  function lingerAlignmentGuides() {
    clearAlignmentGuideTimeout();
    setVisibleAlignmentGuides((current) => {
      if (current.guides.length === 0) {
        return current;
      }
      return { ...current, isLingering: true };
    });
    alignmentGuideTimeoutRef.current = window.setTimeout(() => {
      alignmentGuideTimeoutRef.current = null;
      setVisibleAlignmentGuides({ guides: [], isLingering: false });
    }, 1000);
  }

  useEffect(() => () => clearAlignmentGuideTimeout(), []);

  // Clearing the pending timeout is a real effect (it touches a ref), but
  // resetting the guide state itself doesn't need to be: it's adjusted
  // directly during render, mirroring React's "adjusting state when a prop
  // changes" pattern, which keeps the reset synchronous with the prop flip
  // instead of trailing it by an extra render.
  useEffect(() => {
    if (!showAlignmentGuidesFeature) {
      clearAlignmentGuideTimeout();
    }
  }, [showAlignmentGuidesFeature]);

  const [prevShowAlignmentGuidesFeature, setPrevShowAlignmentGuidesFeature] = useState(
    showAlignmentGuidesFeature,
  );
  if (showAlignmentGuidesFeature !== prevShowAlignmentGuidesFeature) {
    setPrevShowAlignmentGuidesFeature(showAlignmentGuidesFeature);
    if (!showAlignmentGuidesFeature) {
      setVisibleAlignmentGuides({ guides: [], isLingering: false });
    }
  }

  return {
    visibleAlignmentGuides,
    showAlignmentGuides,
    lingerAlignmentGuides,
    clearAlignmentGuideTimeout,
  };
}
