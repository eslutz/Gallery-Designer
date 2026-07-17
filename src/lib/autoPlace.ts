import type {
  ArtPiece,
  AutoPlacementContext,
  AutoPlacementLayoutPreference,
  AutoPlacementSettings,
  EditorFeatures,
  Placement,
  WallFeature,
  WallSection,
} from '../types';
import { getAutoPlacementIssues, rectIsCoveredBySections, type Rect } from './placement';
import { getSectionOffsetX, getSectionOffsetY, getWallBounds, normalizeWallSections } from './wall';
import { resolveWallFeatureRule, type ResolvedWallFeatureRule } from './wallFeatures';
import { roundToPrecision } from './units';

const QUARTER_IN = 0.25;
const DEFAULT_MAX_PIECES = 50;
const DEFAULT_MAX_CANDIDATES_PER_FAMILY = 2_000;
const PACKING_BEAM_WIDTH = 24;
const SEEDED_PACKING_BEAM_WIDTH = 48;
const PACKING_POSITIONS_PER_STATE = 64;
const SEEDED_PACKING_POSITIONS_PER_STATE = 128;
const PACKING_AXIS_CANDIDATE_LIMIT = 28;
const SEEDED_PACKING_AXIS_CANDIDATE_LIMIT = 40;

export type AutoPlacementFamily = 'grid' | 'row' | 'stack' | 'salon' | 'packed';

export interface AutoPlacementAttemptDiagnostic {
  family: AutoPlacementFamily;
  reason: string;
  requiredWidthIn?: number;
  requiredHeightIn?: number;
}

export interface AutoPlacementDiagnostics {
  resolvedGapIn: number;
  resolvedOuterMarginIn: number;
  wallWidthIn: number;
  wallHeightIn: number;
  preservedPlacementCount: number;
  remainingPieceCount: number;
  attempts: AutoPlacementAttemptDiagnostic[];
}

export interface AutoPlacementOptions {
  settings: AutoPlacementSettings;
  features?: EditorFeatures;
  existingPlacements?: Placement[];
  maxCandidatesPerFamily?: number;
}

export type AutoPlacementResult =
  | {
      ok: true;
      layoutKind: AutoPlacementFamily;
      placements: Placement[];
      preservedPlacementCount: number;
      newPlacementCount: number;
      resolvedGapIn?: number;
      resolvedOuterMarginIn?: number;
      explanation?: string;
    }
  | {
      ok: false;
      message: string;
      diagnostics?: AutoPlacementDiagnostics;
    };

interface CandidatePlacement {
  pieceId: string;
  x: number;
  y: number;
}

interface LayoutCandidate {
  family: AutoPlacementFamily;
  placements: CandidatePlacement[];
  group: Rect;
  score: number;
}

interface ResolvedSettings {
  context: AutoPlacementContext;
  layoutPreference: AutoPlacementLayoutPreference;
  wallSetupMode: AutoPlacementSettings['wallSetupMode'];
  wallFeatures: ResolvedWallFeature[];
  gapIn: number;
  outerMarginIn: number;
  maxCandidatesPerFamily: number;
}

interface ResolvedWallFeature {
  feature: WallFeature;
  rule: ResolvedWallFeatureRule;
}

interface FixedPlacementPattern {
  placements: CandidatePlacement[];
  pieceIds: Set<string>;
  rects: Rect[];
  verticalGuides: number[];
  horizontalGuides: number[];
  verticalCenters: number[];
  horizontalCenters: number[];
  preferredHorizontalGapIn: number;
  preferredVerticalGapIn: number;
}

function buildFixedPlacementPattern(
  pieces: ArtPiece[],
  placements: CandidatePlacement[],
  minimumGapIn: number,
): FixedPlacementPattern {
  const rects = placements.map((placement) =>
    rectForCandidate(placement, pieceById(pieces, placement.pieceId)),
  );
  const verticalCenters = uniqueRounded(rects.map((rect) => (rect.left + rect.right) / 2));
  const horizontalCenters = uniqueRounded(rects.map((rect) => (rect.top + rect.bottom) / 2));
  return {
    placements,
    pieceIds: new Set(placements.map((placement) => placement.pieceId)),
    rects,
    verticalGuides: uniqueRounded(
      rects.flatMap((rect) => [rect.left, (rect.left + rect.right) / 2, rect.right]),
    ),
    horizontalGuides: uniqueRounded(
      rects.flatMap((rect) => [rect.top, (rect.top + rect.bottom) / 2, rect.bottom]),
    ),
    verticalCenters,
    horizontalCenters,
    preferredHorizontalGapIn: Math.max(
      minimumGapIn,
      median(nearestProjectedGaps(rects, 'horizontal')) ?? minimumGapIn,
    ),
    preferredVerticalGapIn: Math.max(
      minimumGapIn,
      median(nearestProjectedGaps(rects, 'vertical')) ?? minimumGapIn,
    ),
  };
}

function nearestProjectedGaps(rects: Rect[], axis: 'horizontal' | 'vertical'): number[] {
  return rects.flatMap((rect, index) => {
    let nearest = Number.POSITIVE_INFINITY;
    rects.forEach((other, otherIndex) => {
      if (index === otherIndex) return;
      const projectionsOverlap =
        axis === 'horizontal'
          ? Math.max(rect.top, other.top) < Math.min(rect.bottom, other.bottom)
          : Math.max(rect.left, other.left) < Math.min(rect.right, other.right);
      if (!projectionsOverlap) return;

      const gap =
        axis === 'horizontal'
          ? rect.right <= other.left
            ? other.left - rect.right
            : other.right <= rect.left
              ? rect.left - other.right
              : 0
          : rect.bottom <= other.top
            ? other.top - rect.bottom
            : other.bottom <= rect.top
              ? rect.top - other.bottom
              : 0;
      if (gap > 0) {
        nearest = Math.min(nearest, gap);
      }
    });
    return Number.isFinite(nearest) ? [nearest] : [];
  });
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return roundToPrecision(value, QUARTER_IN);
}

export function autoPlacePieces(
  sections: WallSection[],
  pieces: ArtPiece[],
  options: AutoPlacementOptions,
): AutoPlacementResult {
  if (pieces.length === 0) {
    return {
      ok: true,
      layoutKind: 'grid',
      placements: [],
      preservedPlacementCount: 0,
      newPlacementCount: 0,
      resolvedGapIn: resolveGap(options.settings, options.features),
      resolvedOuterMarginIn: resolveOuterMargin(options.settings, options.features),
      explanation: 'No art pieces need placement.',
    };
  }

  if (sections.length === 0) {
    return { ok: false, message: 'Add at least one wall section before auto-placing pieces.' };
  }

  if (pieces.length > DEFAULT_MAX_PIECES) {
    return {
      ok: false,
      message: `Auto-placement supports up to ${DEFAULT_MAX_PIECES} pieces at a time.`,
    };
  }

  const normalizedSections = normalizeWallSections(sections);
  const settings = resolveSettings(options);
  const bounds = getWallBounds(normalizedSections);
  const existingPlacements = options.existingPlacements ?? [];
  const existingIssue = getExistingPlacementIssue(normalizedSections, pieces, existingPlacements);
  const existingPieceIds = new Set(existingPlacements.map((placement) => placement.pieceId));
  const remainingPieces = pieces.filter((piece) => !existingPieceIds.has(piece.id));

  if (existingIssue) {
    return {
      ok: false,
      message: `Auto-placement stopped because existing placements need attention: ${existingIssue}`,
      diagnostics: buildBaseDiagnostics(
        settings,
        bounds,
        existingPlacements.length,
        remainingPieces.length,
      ),
    };
  }

  if (remainingPieces.length === 0) {
    return {
      ok: true,
      layoutKind: 'packed',
      placements: existingPlacements,
      preservedPlacementCount: existingPlacements.length,
      newPlacementCount: 0,
      resolvedGapIn: settings.gapIn,
      resolvedOuterMarginIn: settings.outerMarginIn,
      explanation: 'All art pieces are already placed. Auto-placement made no changes.',
    };
  }

  const oversizedPiece = remainingPieces.find(
    (piece) =>
      !rectCanFitSomewhere(
        normalizedSections,
        piece.widthIn,
        piece.heightIn,
        settings.outerMarginIn,
      ),
  );

  if (oversizedPiece) {
    return {
      ok: false,
      message: `${oversizedPiece.label} cannot fit within the wall margin.`,
    };
  }

  const fixedCandidates = existingPlacements.map((placement) =>
    toCandidatePlacement(normalizedSections, placement),
  );
  const fixedPattern =
    fixedCandidates.length > 0
      ? buildFixedPlacementPattern(pieces, fixedCandidates, settings.gapIn)
      : undefined;
  const families =
    existingPlacements.length > 0
      ? (['packed'] as AutoPlacementFamily[])
      : resolveFamilies(remainingPieces, settings.layoutPreference);
  const familyResults = families.map((family) => ({
    family,
    candidates: generateFamilyCandidates(
      normalizedSections,
      pieces,
      remainingPieces,
      fixedCandidates,
      fixedPattern,
      family,
      settings,
      bounds,
    ),
  }));
  const candidates = familyResults.flatMap((result) => result.candidates);
  const best = candidates.sort((a, b) => a.score - b.score)[0];

  if (!best) {
    const requested =
      settings.layoutPreference === 'auto'
        ? 'a balanced layout'
        : `a ${settings.layoutPreference} layout`;
    const message =
      existingPlacements.length > 0
        ? `Kept ${formatPieceCount(existingPlacements.length, 'placed piece')} in position, but could not fit the ${formatPieceCount(remainingPieces.length, 'remaining piece')}.`
        : `Could not fit ${requested} on the available connected wall space with the current margin and spacing.`;
    return {
      ok: false,
      message,
      diagnostics: buildFailureDiagnostics(
        remainingPieces,
        families,
        familyResults,
        settings,
        bounds,
        existingPlacements.length,
      ),
    };
  }

  const placements = [
    ...existingPlacements,
    ...best.placements
      .filter((placement) => !existingPieceIds.has(placement.pieceId))
      .map((placement) => toSectionPlacement(normalizedSections, placement)),
  ];

  return {
    ok: true,
    layoutKind: best.family,
    placements,
    preservedPlacementCount: existingPlacements.length,
    newPlacementCount: remainingPieces.length,
    resolvedGapIn: settings.gapIn,
    resolvedOuterMarginIn: settings.outerMarginIn,
    explanation: describePlacement(best.family, settings),
  };
}

function resolveSettings(options: AutoPlacementOptions): ResolvedSettings {
  const settings = options.settings;
  return {
    context: settings.context,
    layoutPreference: settings.layoutPreference,
    wallSetupMode: settings.wallSetupMode,
    wallFeatures:
      settings.wallSetupMode === 'full-wall-with-features'
        ? settings.wallFeatures.filter(isPlacedWallFeature).map((feature) => ({
            feature,
            rule: resolveWallFeatureRule(feature),
          }))
        : [],
    gapIn: resolveGap(settings, options.features),
    outerMarginIn: resolveOuterMargin(settings, options.features),
    maxCandidatesPerFamily: options.maxCandidatesPerFamily ?? DEFAULT_MAX_CANDIDATES_PER_FAMILY,
  };
}

function resolveGap(settings: AutoPlacementSettings, features: EditorFeatures | undefined): number {
  if (features && features.artPieceBufferGapIn > 0) {
    return roundToPrecision(features.artPieceBufferGapIn, QUARTER_IN);
  }

  const layoutPreference = settings.layoutPreference;
  if (layoutPreference === 'grid') {
    return 2;
  }
  if (layoutPreference === 'salon') {
    return 3;
  }
  return 2;
}

function resolveOuterMargin(
  settings: AutoPlacementSettings,
  features: EditorFeatures | undefined,
): number {
  if (features && features.wallEdgeBufferGapIn > 0) {
    return roundToPrecision(features.wallEdgeBufferGapIn, QUARTER_IN);
  }
  return Math.max(5, resolveGap(settings, features) * 2);
}

function resolveFamilies(
  pieces: ArtPiece[],
  layoutPreference: AutoPlacementLayoutPreference,
): AutoPlacementFamily[] {
  if (layoutPreference !== 'auto') {
    return [layoutPreference];
  }

  const families: AutoPlacementFamily[] = [];
  if (allSameSize(pieces)) {
    families.push('grid');
  }
  families.push('row', 'stack', 'salon');
  if (!allSameSize(pieces)) {
    families.push('packed');
  }
  return families;
}

function generateFamilyCandidates(
  sections: WallSection[],
  allPieces: ArtPiece[],
  piecesToPlace: ArtPiece[],
  fixedPlacements: CandidatePlacement[],
  fixedPattern: FixedPlacementPattern | undefined,
  family: AutoPlacementFamily,
  settings: ResolvedSettings,
  bounds: ReturnType<typeof getWallBounds>,
): LayoutCandidate[] {
  if (family === 'packed') {
    return generatePackedCandidates(
      sections,
      allPieces,
      piecesToPlace,
      fixedPlacements,
      fixedPattern,
      settings,
      bounds,
    );
  }

  const shapes = generateIntrinsicShapes(piecesToPlace, family, settings.gapIn);
  const candidates: LayoutCandidate[] = [];

  for (const shape of shapes) {
    const translations = translationCandidates(
      shape.group,
      bounds,
      settings,
      settings.outerMarginIn,
    );
    for (const translation of translations) {
      if (candidates.length >= settings.maxCandidatesPerFamily) {
        break;
      }

      const translatedPlacements = shape.placements.map((placement) => ({
        pieceId: placement.pieceId,
        x: roundToPrecision(placement.x + translation.x, QUARTER_IN),
        y: roundToPrecision(placement.y + translation.y, QUARTER_IN),
      }));
      const translatedGroup = groupForCandidatePlacements(allPieces, translatedPlacements);
      if (
        !candidateFitsHardConstraints(
          sections,
          allPieces,
          translatedPlacements,
          settings.gapIn,
          settings.outerMarginIn,
          settings.wallFeatures,
          bounds,
        )
      ) {
        continue;
      }

      candidates.push({
        family,
        placements: translatedPlacements,
        group: translatedGroup,
        score: scoreCandidate(
          family,
          allPieces,
          translatedPlacements,
          translatedGroup,
          bounds,
          settings,
          fixedPattern,
        ),
      });
    }
  }

  return candidates;
}

function generateIntrinsicShapes(
  pieces: ArtPiece[],
  family: AutoPlacementFamily,
  gapIn: number,
): Array<{ placements: CandidatePlacement[]; group: Rect }> {
  if (family === 'grid') {
    return generateGridShapes(pieces, gapIn);
  }
  if (family === 'row') {
    return [generateRowShape(pieces, gapIn)];
  }
  if (family === 'stack') {
    return [generateStackShape(pieces, gapIn)];
  }
  if (family === 'packed') {
    return [];
  }
  return generateSalonShapes(pieces, gapIn);
}

interface PackingState {
  placements: CandidatePlacement[];
  score: number;
  geometryScore: number;
}

function generatePackedCandidates(
  sections: WallSection[],
  allPieces: ArtPiece[],
  piecesToPlace: ArtPiece[],
  fixedPlacements: CandidatePlacement[],
  fixedPattern: FixedPlacementPattern | undefined,
  settings: ResolvedSettings,
  bounds: ReturnType<typeof getWallBounds>,
): LayoutCandidate[] {
  const completeStates: PackingState[] = [];
  const beamWidth = Math.min(
    fixedPattern ? SEEDED_PACKING_BEAM_WIDTH : PACKING_BEAM_WIDTH,
    settings.maxCandidatesPerFamily,
  );

  for (const ordering of packingPieceOrderings(piecesToPlace)) {
    let states: PackingState[] = [{ placements: fixedPlacements, score: 0, geometryScore: 0 }];

    for (const piece of ordering) {
      const nextStates: PackingState[] = [];
      for (const state of states) {
        const viablePlacements = packingPositionCandidates(
          sections,
          piece,
          allPieces,
          state.placements,
          settings,
          fixedPattern,
        )
          .filter((placement) =>
            packingPlacementFits(
              sections,
              allPieces,
              piece,
              placement,
              state.placements,
              settings,
              bounds,
            ),
          )
          .map((placement) => {
            const placements = [...state.placements, placement];
            return {
              placements,
              score: scorePartialPacking(allPieces, placements, bounds, settings, fixedPattern),
              geometryScore: scorePartialPacking(
                allPieces,
                placements,
                bounds,
                settings,
                undefined,
              ),
            };
          });
        const selectedPlacements = selectPackingBeam(
          viablePlacements,
          fixedPattern ? SEEDED_PACKING_POSITIONS_PER_STATE : PACKING_POSITIONS_PER_STATE,
          Boolean(fixedPattern),
        );
        nextStates.push(...selectedPlacements);
      }

      states = selectPackingBeam(nextStates, beamWidth, Boolean(fixedPattern));
      if (states.length === 0) {
        break;
      }
    }

    if (states[0]?.placements.length === allPieces.length) {
      completeStates.push(...states);
    }
  }

  return deduplicatePackingStates(completeStates)
    .slice(0, settings.maxCandidatesPerFamily)
    .map((state) => {
      const group = groupForCandidatePlacements(allPieces, state.placements);
      return {
        family: 'packed',
        placements: state.placements,
        group,
        score: scoreCandidate(
          'packed',
          allPieces,
          state.placements,
          group,
          bounds,
          settings,
          fixedPattern,
        ),
      };
    });
}

function selectPackingBeam(
  states: PackingState[],
  beamWidth: number,
  preserveGeometryDiversity: boolean,
): PackingState[] {
  const unique = deduplicatePackingStates(states);
  if (!preserveGeometryDiversity) {
    return unique.sort((first, second) => first.score - second.score).slice(0, beamWidth);
  }

  const patternCount = Math.ceil(beamWidth / 2);
  const selected = unique
    .sort((first, second) => first.score - second.score)
    .slice(0, patternCount);
  const selectedKeys = new Set(selected.map(packingStateKey));
  const geometryStates = [...unique]
    .sort((first, second) => first.geometryScore - second.geometryScore)
    .filter((state) => !selectedKeys.has(packingStateKey(state)))
    .slice(0, beamWidth - selected.length);
  return [...selected, ...geometryStates];
}

function packingPlacementFits(
  sections: WallSection[],
  pieces: ArtPiece[],
  piece: ArtPiece,
  placement: CandidatePlacement,
  existingPlacements: CandidatePlacement[],
  settings: ResolvedSettings,
  bounds: ReturnType<typeof getWallBounds>,
): boolean {
  const rect = rectForCandidate(placement, piece);
  if (!rectIsCoveredBySections(expandRect(rect, settings.outerMarginIn), sections)) {
    return false;
  }
  if (
    settings.wallFeatures.some(
      (feature) =>
        feature.rule.blocksPlacement && rectsOverlap(rect, featureBlockRect(feature, bounds)),
    )
  ) {
    return false;
  }

  const expanded = expandRect(rect, settings.gapIn / 2);
  return existingPlacements.every((existing) => {
    const existingPiece = pieceById(pieces, existing.pieceId);
    return !rectsOverlap(
      expanded,
      expandRect(rectForCandidate(existing, existingPiece), settings.gapIn / 2),
    );
  });
}

function packingPieceOrderings(pieces: ArtPiece[]): ArtPiece[][] {
  const orderings = [
    [...pieces].sort((a, b) => b.heightIn - a.heightIn || b.widthIn - a.widthIn),
    [...pieces].sort(
      (a, b) => b.widthIn * b.heightIn - a.widthIn * a.heightIn || b.heightIn - a.heightIn,
    ),
    [...pieces].sort((a, b) => b.widthIn - a.widthIn || b.heightIn - a.heightIn),
    [...pieces].sort((a, b) => a.heightIn - b.heightIn || b.widthIn - a.widthIn),
    [...pieces],
  ];
  const seen = new Set<string>();
  return orderings.filter((ordering) => {
    const key = ordering.map((piece) => piece.id).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function packingPositionCandidates(
  sections: WallSection[],
  piece: ArtPiece,
  pieces: ArtPiece[],
  placements: CandidatePlacement[],
  settings: ResolvedSettings,
  fixedPattern: FixedPlacementPattern | undefined,
): CandidatePlacement[] {
  const xCandidates: number[] = [];
  const yCandidates: number[] = [];

  for (const section of sections) {
    const left = getSectionOffsetX(sections, section.id);
    const top = getSectionOffsetY(sections, section.id);
    xCandidates.push(
      left + settings.outerMarginIn,
      left + section.widthIn - settings.outerMarginIn - piece.widthIn,
    );
    yCandidates.push(
      top + settings.outerMarginIn,
      top + section.heightIn - settings.outerMarginIn - piece.heightIn,
    );
  }

  if (fixedPattern) {
    for (const placement of fixedPattern.placements) {
      const placedPiece = pieceById(pieces, placement.pieceId);
      const horizontalGaps = uniqueRounded([settings.gapIn, fixedPattern.preferredHorizontalGapIn]);
      const verticalGaps = uniqueRounded([settings.gapIn, fixedPattern.preferredVerticalGapIn]);
      xCandidates.push(
        placement.x,
        placement.x + (placedPiece.widthIn - piece.widthIn) / 2,
        placement.x + placedPiece.widthIn - piece.widthIn,
        ...horizontalGaps.flatMap((gap) => [
          placement.x + placedPiece.widthIn + gap,
          placement.x - gap - piece.widthIn,
        ]),
      );
      yCandidates.push(
        placement.y,
        placement.y + (placedPiece.heightIn - piece.heightIn) / 2,
        placement.y + placedPiece.heightIn - piece.heightIn,
        ...verticalGaps.flatMap((gap) => [
          placement.y + placedPiece.heightIn + gap,
          placement.y - gap - piece.heightIn,
        ]),
      );
    }
  }

  for (const placement of [...placements]
    .filter((candidate) => !fixedPattern?.pieceIds.has(candidate.pieceId))
    .reverse()) {
    const placedPiece = pieceById(pieces, placement.pieceId);
    xCandidates.push(
      placement.x,
      placement.x + placedPiece.widthIn + settings.gapIn,
      placement.x - settings.gapIn - piece.widthIn,
      placement.x + (placedPiece.widthIn - piece.widthIn) / 2,
    );
    yCandidates.push(
      placement.y,
      placement.y + placedPiece.heightIn + settings.gapIn,
      placement.y - settings.gapIn - piece.heightIn,
      placement.y + (placedPiece.heightIn - piece.heightIn) / 2,
    );
  }

  const axisLimit = fixedPattern
    ? SEEDED_PACKING_AXIS_CANDIDATE_LIMIT
    : PACKING_AXIS_CANDIDATE_LIMIT;
  const resolvedX = uniqueRounded(xCandidates).slice(0, axisLimit);
  const resolvedY = uniqueRounded(yCandidates).slice(0, axisLimit);
  return resolvedX.flatMap((x) => resolvedY.map((y) => ({ pieceId: piece.id, x, y })));
}

function scorePartialPacking(
  pieces: ArtPiece[],
  placements: CandidatePlacement[],
  bounds: ReturnType<typeof getWallBounds>,
  settings: ResolvedSettings,
  fixedPattern: FixedPlacementPattern | undefined,
): number {
  const group = groupForCandidatePlacements(pieces, placements);
  const groupWidth = group.right - group.left;
  const groupHeight = group.bottom - group.top;
  const pieceArea = placements.reduce((sum, placement) => {
    const piece = pieceById(pieces, placement.pieceId);
    return sum + piece.widthIn * piece.heightIn;
  }, 0);
  const unusedArea = groupWidth * groupHeight - pieceArea;
  const targetX = bounds.minX + bounds.width / 2;
  const targetY = targetCenterLine(settings.context, bounds);
  const centerX = (group.left + group.right) / 2;
  const centerY = (group.top + group.bottom) / 2;

  const fixedPatternScore = fixedPattern
    ? scoreFixedPattern(pieces, placements, settings, fixedPattern) * 35
    : 0;

  return (
    unusedArea / Math.max(pieceArea, 1) +
    groupWidth / Math.max(bounds.width, 1) +
    groupHeight / Math.max(bounds.height, 1) +
    Math.abs(centerX - targetX) / Math.max(bounds.width, 1) +
    Math.abs(centerY - targetY) / Math.max(bounds.height, 1) +
    fixedPatternScore
  );
}

function deduplicatePackingStates(states: PackingState[]): PackingState[] {
  const byKey = new Map<string, PackingState>();
  for (const state of states) {
    const key = packingStateKey(state);
    const existing = byKey.get(key);
    if (!existing || state.score < existing.score) {
      byKey.set(key, state);
    }
  }
  return [...byKey.values()];
}

function packingStateKey(state: PackingState): string {
  return [...state.placements]
    .sort((a, b) => a.pieceId.localeCompare(b.pieceId))
    .map((placement) => `${placement.pieceId}:${placement.x}:${placement.y}`)
    .join('|');
}

function generateGridShapes(
  pieces: ArtPiece[],
  gapIn: number,
): Array<{ placements: CandidatePlacement[]; group: Rect }> {
  if (!allSameSize(pieces)) {
    return [];
  }

  const [piece] = pieces;
  const shapes: Array<{ placements: CandidatePlacement[]; group: Rect }> = [];

  for (let columns = 1; columns <= pieces.length; columns += 1) {
    const placements = pieces.map((current, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        pieceId: current.id,
        x: column * (piece.widthIn + gapIn),
        y: row * (piece.heightIn + gapIn),
      };
    });
    shapes.push({ placements, group: groupForCandidatePlacements(pieces, placements) });
  }

  return shapes;
}

function generateRowShape(
  pieces: ArtPiece[],
  gapIn: number,
): { placements: CandidatePlacement[]; group: Rect } {
  const maxHeight = Math.max(...pieces.map((piece) => piece.heightIn));
  let x = 0;
  const placements = pieces.map((piece) => {
    const placement = {
      pieceId: piece.id,
      x,
      y: roundToPrecision((maxHeight - piece.heightIn) / 2, QUARTER_IN),
    };
    x += piece.widthIn + gapIn;
    return placement;
  });
  return { placements, group: groupForCandidatePlacements(pieces, placements) };
}

function generateStackShape(
  pieces: ArtPiece[],
  gapIn: number,
): { placements: CandidatePlacement[]; group: Rect } {
  const maxWidth = Math.max(...pieces.map((piece) => piece.widthIn));
  let y = 0;
  const placements = pieces.map((piece) => {
    const placement = {
      pieceId: piece.id,
      x: roundToPrecision((maxWidth - piece.widthIn) / 2, QUARTER_IN),
      y,
    };
    y += piece.heightIn + gapIn;
    return placement;
  });
  return { placements, group: groupForCandidatePlacements(pieces, placements) };
}

function generateSalonShapes(
  pieces: ArtPiece[],
  gapIn: number,
): Array<{ placements: CandidatePlacement[]; group: Rect }> {
  if (pieces.length === 1) {
    return [generateRowShape(pieces, gapIn)];
  }

  const byArea = [...pieces].sort((a, b) => b.widthIn * b.heightIn - a.widthIn * a.heightIn);
  const primary = byArea[0];
  const secondary = byArea[1];
  const placements: CandidatePlacement[] = [{ pieceId: primary.id, x: 0, y: 0 }];

  if (secondary) {
    placements.push({ pieceId: secondary.id, x: primary.widthIn + gapIn, y: 0 });
  }

  byArea.slice(2).forEach((piece, index) => {
    if (index % 2 === 0) {
      placements.push({
        pieceId: piece.id,
        x: 0,
        y: primary.heightIn + gapIn + Math.floor(index / 2) * (piece.heightIn + gapIn),
      });
      return;
    }

    placements.push({
      pieceId: piece.id,
      x: primary.widthIn + gapIn,
      y:
        (secondary?.heightIn ?? primary.heightIn) +
        gapIn +
        Math.floor(index / 2) * (piece.heightIn + gapIn),
    });
  });

  const normalized = normalizeCandidatePlacements(pieces, placements);
  const mirrored = mirrorHorizontally(pieces, normalized);
  return [
    { placements: normalized, group: groupForCandidatePlacmentsCached(pieces, normalized) },
    { placements: mirrored, group: groupForCandidatePlacmentsCached(pieces, mirrored) },
  ];
}

function normalizeCandidatePlacements(
  pieces: ArtPiece[],
  placements: CandidatePlacement[],
): CandidatePlacement[] {
  const group = groupForCandidatePlacements(pieces, placements);
  return placements.map((placement) => ({
    ...placement,
    x: roundToPrecision(placement.x - group.left, QUARTER_IN),
    y: roundToPrecision(placement.y - group.top, QUARTER_IN),
  }));
}

function mirrorHorizontally(
  pieces: ArtPiece[],
  placements: CandidatePlacement[],
): CandidatePlacement[] {
  const group = groupForCandidatePlacements(pieces, placements);
  return placements.map((placement) => {
    const piece = pieceById(pieces, placement.pieceId);
    return {
      ...placement,
      x: roundToPrecision(group.right - (placement.x + piece.widthIn), QUARTER_IN),
    };
  });
}

function groupForCandidatePlacmentsCached(
  pieces: ArtPiece[],
  placements: CandidatePlacement[],
): Rect {
  return groupForCandidatePlacements(pieces, placements);
}

function translationCandidates(
  group: Rect,
  bounds: ReturnType<typeof getWallBounds>,
  settings: ResolvedSettings,
  outerMarginIn: number,
): Array<{ x: number; y: number }> {
  const groupWidth = group.right - group.left;
  const groupHeight = group.bottom - group.top;
  const wallCenterX = bounds.minX + bounds.width / 2;
  const anchor = preferredAnchorFeature(settings.wallFeatures);
  const anchorRect = anchor ? featureBlockRect(anchor, bounds) : undefined;
  const targetCenterX = anchor ? anchor.feature.xIn + anchor.feature.widthIn / 2 : wallCenterX;
  const targetCenterY = targetCenterLine(settings.context, bounds);
  const targetBottom = anchorRect?.top;
  const featureTopCandidates = settings.wallFeatures.map(
    (feature) => featureBlockRect(feature, bounds).top - groupHeight - group.top,
  );

  const xCandidates = uniqueRounded([
    targetCenterX - groupWidth / 2 - group.left,
    wallCenterX - groupWidth / 2 - group.left,
    bounds.minX + outerMarginIn - group.left,
    bounds.maxX - outerMarginIn - groupWidth - group.left,
  ]);
  const yCandidates = uniqueRounded([
    targetBottom === undefined
      ? targetCenterY - groupHeight / 2 - group.top
      : targetBottom - groupHeight - group.top,
    bounds.minY + outerMarginIn - group.top,
    bounds.maxY - outerMarginIn - groupHeight - group.top,
    bounds.minY + bounds.height / 2 - groupHeight / 2 - group.top,
    ...featureTopCandidates,
  ]);

  return xCandidates.flatMap((x) => yCandidates.map((y) => ({ x, y })));
}

function uniqueRounded(values: number[]): number[] {
  return [
    ...new Set(values.filter(Number.isFinite).map((value) => roundToPrecision(value, QUARTER_IN))),
  ];
}

function candidateFitsHardConstraints(
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: CandidatePlacement[],
  gapIn: number,
  outerMarginIn: number,
  wallFeatures: ResolvedWallFeature[],
  bounds: ReturnType<typeof getWallBounds>,
): boolean {
  for (const placement of placements) {
    const piece = pieceById(pieces, placement.pieceId);
    const rect = rectForCandidate(placement, piece);
    const expanded = expandRect(rect, outerMarginIn);
    if (!rectIsCoveredBySections(expanded, sections)) {
      return false;
    }

    if (
      wallFeatures.some(
        (feature) =>
          feature.rule.blocksPlacement && rectsOverlap(rect, featureBlockRect(feature, bounds)),
      )
    ) {
      return false;
    }
  }

  for (let index = 0; index < placements.length; index += 1) {
    const first = placements[index];
    const firstPiece = pieceById(pieces, first.pieceId);
    const firstRect = expandRect(rectForCandidate(first, firstPiece), gapIn / 2);

    for (let otherIndex = index + 1; otherIndex < placements.length; otherIndex += 1) {
      const second = placements[otherIndex];
      const secondPiece = pieceById(pieces, second.pieceId);
      const secondRect = expandRect(rectForCandidate(second, secondPiece), gapIn / 2);
      if (rectsOverlap(firstRect, secondRect)) {
        return false;
      }
    }
  }

  return true;
}

function scoreFixedPattern(
  pieces: ArtPiece[],
  placements: CandidatePlacement[],
  settings: ResolvedSettings,
  pattern: FixedPlacementPattern,
): number {
  const generated = placements.filter((placement) => !pattern.pieceIds.has(placement.pieceId));
  if (generated.length === 0) return 0;

  const scores = generated.map((placement) => {
    const rect = rectForCandidate(placement, pieceById(pieces, placement.pieceId));
    const centerX = (rect.left + rect.right) / 2;
    const centerY = (rect.top + rect.bottom) / 2;
    const xAlignment = minimumGuideDistance(
      [rect.left, centerX, rect.right],
      pattern.verticalGuides,
      settings.gapIn,
    );
    const yAlignment = minimumGuideDistance(
      [rect.top, centerY, rect.bottom],
      pattern.horizontalGuides,
      settings.gapIn,
    );
    const centerXAlignment = minimumGuideDistance(
      [centerX],
      pattern.verticalCenters,
      settings.gapIn,
    );
    const centerYAlignment = minimumGuideDistance(
      [centerY],
      pattern.horizontalCenters,
      settings.gapIn,
    );
    const horizontalGap = scoreGapRhythm(
      rect,
      pattern.rects,
      'horizontal',
      pattern.preferredHorizontalGapIn,
      pattern.preferredHorizontalGapIn,
    );
    const verticalGap = scoreGapRhythm(
      rect,
      pattern.rects,
      'vertical',
      pattern.preferredVerticalGapIn,
      pattern.preferredVerticalGapIn,
    );

    if (settings.layoutPreference === 'row') {
      return centerYAlignment * 0.65 + horizontalGap * 0.35;
    }
    if (settings.layoutPreference === 'stack') {
      return centerXAlignment * 0.65 + verticalGap * 0.35;
    }
    if (settings.layoutPreference === 'grid') {
      return (xAlignment + yAlignment) * 0.4 + Math.min(horizontalGap, verticalGap) * 0.2;
    }
    return Math.min(xAlignment, yAlignment) * 0.65 + Math.min(horizontalGap, verticalGap) * 0.35;
  });

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function minimumGuideDistance(values: number[], guides: number[], scale: number): number {
  return (
    Math.min(...values.flatMap((value) => guides.map((guide) => Math.abs(value - guide)))) /
    Math.max(Math.min(scale, 24), 1)
  );
}

function scoreGapRhythm(
  rect: Rect,
  fixedRects: Rect[],
  axis: 'horizontal' | 'vertical',
  preferredGapIn: number,
  scale: number,
): number {
  const gaps = fixedRects.flatMap((fixed) => {
    const projectionsOverlap =
      axis === 'horizontal'
        ? Math.max(rect.top, fixed.top) < Math.min(rect.bottom, fixed.bottom)
        : Math.max(rect.left, fixed.left) < Math.min(rect.right, fixed.right);
    if (!projectionsOverlap) return [];

    if (axis === 'horizontal') {
      if (rect.right <= fixed.left) return [fixed.left - rect.right];
      if (fixed.right <= rect.left) return [rect.left - fixed.right];
      return [];
    }
    if (rect.bottom <= fixed.top) return [fixed.top - rect.bottom];
    if (fixed.bottom <= rect.top) return [rect.top - fixed.bottom];
    return [];
  });
  if (gaps.length === 0) return 1;
  return (
    Math.min(...gaps.map((gap) => Math.abs(gap - preferredGapIn))) /
    Math.max(Math.min(scale, 24), 1)
  );
}

function scoreCandidate(
  family: AutoPlacementFamily,
  pieces: ArtPiece[],
  placements: CandidatePlacement[],
  group: Rect,
  bounds: ReturnType<typeof getWallBounds>,
  settings: ResolvedSettings,
  fixedPattern?: FixedPlacementPattern,
): number {
  const widthScore = scoreWidth(group, bounds, settings, family) * 30;
  const anchorScore = scoreAnchor(group, bounds, settings) * 25;
  const balanceScore = scoreBalance(pieces, placements, group) * 20;
  const alignmentScore = scoreAlignment(family, placements) * 15;
  const marginScore = scoreMargins(group, bounds, settings.outerMarginIn) * 10;
  const familyScore = scoreFamilyPreference(family, pieces, settings) * 20;
  const fixedPatternScore = fixedPattern
    ? scoreFixedPattern(pieces, placements, settings, fixedPattern) * 35
    : 0;
  return (
    widthScore +
    anchorScore +
    balanceScore +
    alignmentScore +
    marginScore +
    familyScore +
    fixedPatternScore
  );
}

function scoreWidth(
  group: Rect,
  bounds: ReturnType<typeof getWallBounds>,
  settings: ResolvedSettings,
  family: AutoPlacementFamily,
): number {
  const width = group.right - group.left;
  const anchor = preferredAnchorFeature(settings.wallFeatures);
  if (anchor?.rule.targetGroupWidthRatio) {
    const target = anchor.feature.widthIn * anchor.rule.targetGroupWidthRatio.ideal;
    return Math.abs(width - target) / Math.max(anchor.feature.widthIn, 1);
  }

  const targetRatio = family === 'grid' ? 0.25 : family === 'stack' ? 0.28 : 0.65;
  return Math.abs(width / Math.max(bounds.width, 1) - targetRatio);
}

function scoreAnchor(
  group: Rect,
  bounds: ReturnType<typeof getWallBounds>,
  settings: ResolvedSettings,
): number {
  const centerX = (group.left + group.right) / 2;
  const centerY = (group.top + group.bottom) / 2;
  const anchor = preferredAnchorFeature(settings.wallFeatures);
  const anchorRect = anchor ? featureBlockRect(anchor, bounds) : undefined;
  const targetCenterX = anchor
    ? anchor.feature.xIn + anchor.feature.widthIn / 2
    : bounds.minX + bounds.width / 2;
  const xScore = Math.abs(centerX - targetCenterX) / Math.max(bounds.width, 1);

  if (anchorRect) {
    return xScore + Math.abs(group.bottom - anchorRect.top) / Math.max(bounds.height, 1);
  }

  return (
    xScore +
    Math.abs(centerY - targetCenterLine(settings.context, bounds)) / Math.max(bounds.height, 1)
  );
}

function scoreBalance(pieces: ArtPiece[], placements: CandidatePlacement[], group: Rect): number {
  const totalArea = pieces.reduce((sum, piece) => sum + piece.widthIn * piece.heightIn, 0);
  const weightedX = placements.reduce((sum, placement) => {
    const piece = pieceById(pieces, placement.pieceId);
    return sum + (placement.x + piece.widthIn / 2) * piece.widthIn * piece.heightIn;
  }, 0);
  const weightedY = placements.reduce((sum, placement) => {
    const piece = pieceById(pieces, placement.pieceId);
    return sum + (placement.y + piece.heightIn / 2) * piece.widthIn * piece.heightIn;
  }, 0);
  const groupCenterX = (group.left + group.right) / 2;
  const groupCenterY = (group.top + group.bottom) / 2;
  return (
    Math.abs(weightedX / totalArea - groupCenterX) / Math.max(group.right - group.left, 1) +
    Math.abs(weightedY / totalArea - groupCenterY) / Math.max(group.bottom - group.top, 1)
  );
}

function scoreAlignment(family: AutoPlacementFamily, placements: CandidatePlacement[]): number {
  if (family === 'grid' || family === 'row' || family === 'stack') {
    return 0;
  }
  const distinctRows = new Set(placements.map((placement) => placement.y)).size;
  const distinctColumns = new Set(placements.map((placement) => placement.x)).size;
  return Math.min(distinctRows, distinctColumns) / Math.max(placements.length, 1);
}

function scoreMargins(
  group: Rect,
  bounds: ReturnType<typeof getWallBounds>,
  outerMarginIn: number,
): number {
  const margin = Math.min(
    group.left - bounds.minX,
    bounds.maxX - group.right,
    group.top - bounds.minY,
    bounds.maxY - group.bottom,
  );
  if (margin >= 6 && margin <= 12) {
    return 0;
  }
  return Math.abs(margin - Math.max(outerMarginIn, 6)) / Math.max(bounds.width, bounds.height, 1);
}

function scoreFamilyPreference(
  family: AutoPlacementFamily,
  pieces: ArtPiece[],
  settings: ResolvedSettings,
): number {
  const anchor = preferredAnchorFeature(settings.wallFeatures);
  if (anchor) {
    if (family === 'packed') {
      return 1;
    }
    const preferredIndex = anchor.rule.preferredFamilies.indexOf(family);
    if (preferredIndex >= 0) {
      return preferredIndex * 0.25;
    }
    return 1.5;
  }
  if (settings.context.kind === 'hallway') {
    return family === 'row' ? 0 : family === 'stack' ? 0.2 : 0.7;
  }
  if (allSameSize(pieces)) {
    return family === 'grid' ? 0 : 0.5;
  }
  return family === 'salon' ? 0 : family === 'packed' ? 0.75 : family === 'row' ? 2 : 2.5;
}

function targetCenterLine(
  context: AutoPlacementContext,
  bounds: ReturnType<typeof getWallBounds>,
): number {
  if (context.kind === 'blank') {
    return bounds.maxY - (context.viewingPosture === 'seated' ? 58 : 60);
  }
  if (context.kind === 'hallway') {
    return bounds.maxY - 60;
  }
  return bounds.maxY - 60;
}

function toSectionPlacement(sections: WallSection[], placement: CandidatePlacement): Placement {
  const section =
    sections.find((candidate) => {
      const left = getSectionOffsetX(sections, candidate.id);
      const top = getSectionOffsetY(sections, candidate.id);
      return (
        placement.x >= left &&
        placement.x <= left + candidate.widthIn &&
        placement.y >= top &&
        placement.y <= top + candidate.heightIn
      );
    }) ?? sections[0];

  return {
    pieceId: placement.pieceId,
    sectionId: section.id,
    xIn: roundToPrecision(placement.x - getSectionOffsetX(sections, section.id), QUARTER_IN),
    yIn: roundToPrecision(placement.y - getSectionOffsetY(sections, section.id), QUARTER_IN),
  };
}

function toCandidatePlacement(sections: WallSection[], placement: Placement): CandidatePlacement {
  return {
    pieceId: placement.pieceId,
    x: getSectionOffsetX(sections, placement.sectionId) + placement.xIn,
    y: getSectionOffsetY(sections, placement.sectionId) + placement.yIn,
  };
}

function getExistingPlacementIssue(
  sections: WallSection[],
  pieces: ArtPiece[],
  placements: Placement[],
): string | undefined {
  const pieceIds = new Set(pieces.map((piece) => piece.id));
  const sectionIds = new Set(sections.map((section) => section.id));
  const placedPieceIds = new Set<string>();

  for (const placement of placements) {
    if (!pieceIds.has(placement.pieceId)) {
      return `A placed item references missing piece ${placement.pieceId}.`;
    }
    if (!sectionIds.has(placement.sectionId)) {
      return `A placed item references missing wall section ${placement.sectionId}.`;
    }
    if (placedPieceIds.has(placement.pieceId)) {
      const piece = pieceById(pieces, placement.pieceId);
      return `${piece.label} has more than one existing placement.`;
    }
    placedPieceIds.add(placement.pieceId);
  }

  return getAutoPlacementIssues(sections, pieces, placements)[0];
}

function formatPieceCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function buildBaseDiagnostics(
  settings: ResolvedSettings,
  bounds: ReturnType<typeof getWallBounds>,
  preservedPlacementCount: number,
  remainingPieceCount: number,
): AutoPlacementDiagnostics {
  return {
    resolvedGapIn: settings.gapIn,
    resolvedOuterMarginIn: settings.outerMarginIn,
    wallWidthIn: bounds.width,
    wallHeightIn: bounds.height,
    preservedPlacementCount,
    remainingPieceCount,
    attempts: [],
  };
}

function buildFailureDiagnostics(
  pieces: ArtPiece[],
  families: AutoPlacementFamily[],
  familyResults: Array<{ family: AutoPlacementFamily; candidates: LayoutCandidate[] }>,
  settings: ResolvedSettings,
  bounds: ReturnType<typeof getWallBounds>,
  preservedPlacementCount = 0,
): AutoPlacementDiagnostics {
  return {
    resolvedGapIn: settings.gapIn,
    resolvedOuterMarginIn: settings.outerMarginIn,
    wallWidthIn: bounds.width,
    wallHeightIn: bounds.height,
    preservedPlacementCount,
    remainingPieceCount: pieces.length,
    attempts: families.map((family) => {
      if (family === 'packed') {
        return {
          family,
          reason:
            preservedPlacementCount > 0
              ? 'The seeded packing search could not place every remaining piece around the fixed artwork inside the connected wall shape.'
              : 'The mixed-size packing search could not place every piece inside the connected wall shape.',
        };
      }

      const shapes = generateIntrinsicShapes(pieces, family, settings.gapIn);
      if (shapes.length === 0) {
        return {
          family,
          reason: 'This layout is not available for pieces with different dimensions.',
        };
      }

      const smallest = [...shapes].sort((first, second) => {
        const firstArea =
          (first.group.right - first.group.left) * (first.group.bottom - first.group.top);
        const secondArea =
          (second.group.right - second.group.left) * (second.group.bottom - second.group.top);
        return firstArea - secondArea;
      })[0];
      const requiredWidthIn =
        smallest.group.right - smallest.group.left + settings.outerMarginIn * 2;
      const requiredHeightIn =
        smallest.group.bottom - smallest.group.top + settings.outerMarginIn * 2;
      const tooWide = requiredWidthIn > bounds.width;
      const tooTall = requiredHeightIn > bounds.height;
      let reason =
        'The overall dimensions fit the wall bounds, but the layout does not fit the connected wall shape after margins.';
      if (tooWide && tooTall) {
        reason = 'The layout is wider and taller than the available wall bounds after margins.';
      } else if (tooWide) {
        reason = 'The layout is wider than the available wall bounds after margins.';
      } else if (tooTall) {
        reason = 'The layout is taller than the available wall bounds after margins.';
      } else if (familyResults.find((result) => result.family === family)?.candidates.length) {
        reason = 'Valid candidates were generated but did not produce a selectable result.';
      }

      return {
        family,
        reason,
        requiredWidthIn,
        requiredHeightIn,
      };
    }),
  };
}

function describePlacement(family: AutoPlacementFamily, settings: ResolvedSettings): string {
  if (settings.wallSetupMode === 'full-wall-with-features') {
    return `Auto-placement created a ${family} layout for the full wall with furniture and features.`;
  }
  if (settings.context.kind === 'hallway') {
    return `Auto-placement created a ${family} layout for a hallway viewing path.`;
  }
  return `Auto-placement created a ${family} layout for a ${settings.context.viewingPosture} viewing height.`;
}

function preferredAnchorFeature(
  wallFeatures: ResolvedWallFeature[],
): ResolvedWallFeature | undefined {
  return wallFeatures.find(
    (feature) => feature.rule.blocksPlacement && feature.rule.preferredAnchor !== 'none',
  );
}

function featureBlockRect(
  wallFeature: ResolvedWallFeature,
  bounds: ReturnType<typeof getWallBounds>,
): Rect {
  if (typeof wallFeature.feature.yIn !== 'number') {
    const top = bounds.maxY - wallFeature.feature.heightIn - wallFeature.rule.clearanceIn;
    return {
      left: wallFeature.feature.xIn,
      top,
      right: wallFeature.feature.xIn + wallFeature.feature.widthIn,
      bottom: bounds.maxY,
    };
  }

  const top = Math.max(bounds.minY, wallFeature.feature.yIn - wallFeature.rule.clearanceIn);
  return {
    left: wallFeature.feature.xIn,
    top,
    right: wallFeature.feature.xIn + wallFeature.feature.widthIn,
    bottom: wallFeature.feature.yIn + wallFeature.feature.heightIn,
  };
}

function isPlacedWallFeature(feature: WallFeature): boolean {
  return feature.placed !== false;
}

function rectCanFitSomewhere(
  sections: WallSection[],
  widthIn: number,
  heightIn: number,
  marginIn: number,
): boolean {
  return sections.some((section) => {
    const x = getSectionOffsetX(sections, section.id) + marginIn;
    const y = getSectionOffsetY(sections, section.id) + marginIn;
    return rectIsCoveredBySections(
      {
        left: x - marginIn,
        top: y - marginIn,
        right: x + widthIn + marginIn,
        bottom: y + heightIn + marginIn,
      },
      sections,
    );
  });
}

function groupForCandidatePlacements(pieces: ArtPiece[], placements: CandidatePlacement[]): Rect {
  const rects = placements.map((placement) =>
    rectForCandidate(placement, pieceById(pieces, placement.pieceId)),
  );
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

function rectForCandidate(placement: CandidatePlacement, piece: ArtPiece): Rect {
  return {
    left: placement.x,
    top: placement.y,
    right: placement.x + piece.widthIn,
    bottom: placement.y + piece.heightIn,
  };
}

function expandRect(rect: Rect, amount: number): Rect {
  return {
    left: rect.left - amount,
    top: rect.top - amount,
    right: rect.right + amount,
    bottom: rect.bottom + amount,
  };
}

function rectsOverlap(first: Rect, second: Rect): boolean {
  return !(
    first.right <= second.left ||
    second.right <= first.left ||
    first.bottom <= second.top ||
    second.bottom <= first.top
  );
}

function pieceById(pieces: ArtPiece[], pieceId: string): ArtPiece {
  const piece = pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) {
    throw new Error(`Missing piece ${pieceId}`);
  }
  return piece;
}

function allSameSize(pieces: ArtPiece[]): boolean {
  const [first] = pieces;
  return pieces.every(
    (piece) => piece.widthIn === first.widthIn && piece.heightIn === first.heightIn,
  );
}
