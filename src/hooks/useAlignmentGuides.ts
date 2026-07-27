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

  useEffect(() => {
    if (!showAlignmentGuidesFeature) {
      clearAlignmentGuideTimeout();
      setVisibleAlignmentGuides({ guides: [], isLingering: false });
    }
  }, [showAlignmentGuidesFeature]);

  return {
    visibleAlignmentGuides,
    showAlignmentGuides,
    lingerAlignmentGuides,
    clearAlignmentGuideTimeout,
  };
}
