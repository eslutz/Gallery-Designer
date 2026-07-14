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
import { rectIsCoveredBySections, type Rect } from './placement';
import { getSectionOffsetX, getSectionOffsetY, getWallBounds, normalizeWallSections } from './wall';
import { resolveWallFeatureRule, type ResolvedWallFeatureRule } from './wallFeatures';
import { roundToPrecision } from './units';

const QUARTER_IN = 0.25;
const DEFAULT_MAX_PIECES = 50;
const DEFAULT_MAX_CANDIDATES_PER_FAMILY = 2_000;
const PACKING_BEAM_WIDTH = 24;
const PACKING_POSITIONS_PER_STATE = 64;
const PACKING_AXIS_CANDIDATE_LIMIT = 28;

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
  attempts: AutoPlacementAttemptDiagnostic[];
}

export interface AutoPlacementOptions {
  settings: AutoPlacementSettings;
  features?: EditorFeatures;
  maxCandidatesPerFamily?: number;
}

export type AutoPlacementResult =
  | {
      ok: true;
      layoutKind: AutoPlacementFamily;
      placements: Placement[];
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

  const oversizedPiece = pieces.find(
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

  const families = resolveFamilies(pieces, settings.layoutPreference);
  const familyResults = families.map((family) => ({
    family,
    candidates: generateFamilyCandidates(normalizedSections, pieces, family, settings, bounds),
  }));
  const candidates = familyResults.flatMap((result) => result.candidates);
  const best = candidates.sort((a, b) => a.score - b.score)[0];

  if (!best) {
    const requested =
      settings.layoutPreference === 'auto'
        ? 'a balanced layout'
        : `a ${settings.layoutPreference} layout`;
    return {
      ok: false,
      message: `Could not fit ${requested} on the available connected wall space with the current margin and spacing.`,
      diagnostics: buildFailureDiagnostics(pieces, families, familyResults, settings, bounds),
    };
  }

  const placements = best.placements.map((placement) =>
    toSectionPlacement(normalizedSections, placement),
  );

  return {
    ok: true,
    layoutKind: best.family,
    placements,
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
        ? settings.wallFeatures.map((feature) => ({
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
  pieces: ArtPiece[],
  family: AutoPlacementFamily,
  settings: ResolvedSettings,
  bounds: ReturnType<typeof getWallBounds>,
): LayoutCandidate[] {
  if (family === 'packed') {
    return generatePackedCandidates(sections, pieces, settings, bounds);
  }

  const shapes = generateIntrinsicShapes(pieces, family, settings.gapIn);
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
      const translatedGroup = groupForCandidatePlacements(pieces, translatedPlacements);
      if (
        !candidateFitsHardConstraints(
          sections,
          pieces,
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
          pieces,
          translatedPlacements,
          translatedGroup,
          bounds,
          settings,
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
}

function generatePackedCandidates(
  sections: WallSection[],
  pieces: ArtPiece[],
  settings: ResolvedSettings,
  bounds: ReturnType<typeof getWallBounds>,
): LayoutCandidate[] {
  const completeStates: PackingState[] = [];
  const beamWidth = Math.min(PACKING_BEAM_WIDTH, settings.maxCandidatesPerFamily);

  for (const ordering of packingPieceOrderings(pieces)) {
    let states: PackingState[] = [{ placements: [], score: 0 }];

    for (const piece of ordering) {
      const nextStates: PackingState[] = [];
      for (const state of states) {
        const viablePlacements = packingPositionCandidates(
          sections,
          piece,
          pieces,
          state.placements,
          settings,
        )
          .filter((placement) =>
            packingPlacementFits(
              sections,
              pieces,
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
              score: scorePartialPacking(pieces, placements, bounds, settings),
            };
          })
          .sort((first, second) => first.score - second.score)
          .slice(0, PACKING_POSITIONS_PER_STATE);
        nextStates.push(...viablePlacements);
      }

      states = deduplicatePackingStates(nextStates)
        .sort((first, second) => first.score - second.score)
        .slice(0, beamWidth);
      if (states.length === 0) {
        break;
      }
    }

    if (states[0]?.placements.length === pieces.length) {
      completeStates.push(...states);
    }
  }

  return deduplicatePackingStates(completeStates)
    .slice(0, settings.maxCandidatesPerFamily)
    .map((state) => {
      const group = groupForCandidatePlacements(pieces, state.placements);
      return {
        family: 'packed',
        placements: state.placements,
        group,
        score: scoreCandidate('packed', pieces, state.placements, group, bounds, settings),
      };
    });
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

  for (const placement of [...placements].reverse()) {
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

  const resolvedX = uniqueRounded(xCandidates).slice(0, PACKING_AXIS_CANDIDATE_LIMIT);
  const resolvedY = uniqueRounded(yCandidates).slice(0, PACKING_AXIS_CANDIDATE_LIMIT);
  return resolvedX.flatMap((x) => resolvedY.map((y) => ({ pieceId: piece.id, x, y })));
}

function scorePartialPacking(
  pieces: ArtPiece[],
  placements: CandidatePlacement[],
  bounds: ReturnType<typeof getWallBounds>,
  settings: ResolvedSettings,
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

  return (
    unusedArea / Math.max(pieceArea, 1) +
    groupWidth / Math.max(bounds.width, 1) +
    groupHeight / Math.max(bounds.height, 1) +
    Math.abs(centerX - targetX) / Math.max(bounds.width, 1) +
    Math.abs(centerY - targetY) / Math.max(bounds.height, 1)
  );
}

function deduplicatePackingStates(states: PackingState[]): PackingState[] {
  const byKey = new Map<string, PackingState>();
  for (const state of states) {
    const key = [...state.placements]
      .sort((a, b) => a.pieceId.localeCompare(b.pieceId))
      .map((placement) => `${placement.pieceId}:${placement.x}:${placement.y}`)
      .join('|');
    const existing = byKey.get(key);
    if (!existing || state.score < existing.score) {
      byKey.set(key, state);
    }
  }
  return [...byKey.values()];
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

function scoreCandidate(
  family: AutoPlacementFamily,
  pieces: ArtPiece[],
  placements: CandidatePlacement[],
  group: Rect,
  bounds: ReturnType<typeof getWallBounds>,
  settings: ResolvedSettings,
): number {
  const widthScore = scoreWidth(group, bounds, settings, family) * 30;
  const anchorScore = scoreAnchor(group, bounds, settings) * 25;
  const balanceScore = scoreBalance(pieces, placements, group) * 20;
  const alignmentScore = scoreAlignment(family, placements) * 15;
  const marginScore = scoreMargins(group, bounds, settings.outerMarginIn) * 10;
  const familyScore = scoreFamilyPreference(family, pieces, settings) * 20;
  return widthScore + anchorScore + balanceScore + alignmentScore + marginScore + familyScore;
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

function buildFailureDiagnostics(
  pieces: ArtPiece[],
  families: AutoPlacementFamily[],
  familyResults: Array<{ family: AutoPlacementFamily; candidates: LayoutCandidate[] }>,
  settings: ResolvedSettings,
  bounds: ReturnType<typeof getWallBounds>,
): AutoPlacementDiagnostics {
  return {
    resolvedGapIn: settings.gapIn,
    resolvedOuterMarginIn: settings.outerMarginIn,
    wallWidthIn: bounds.width,
    wallHeightIn: bounds.height,
    attempts: families.map((family) => {
      if (family === 'packed') {
        return {
          family,
          reason:
            'The mixed-size packing search could not place every piece inside the connected wall shape.',
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
  const top = bounds.maxY - wallFeature.feature.heightIn - wallFeature.rule.clearanceIn;
  return {
    left: wallFeature.feature.xIn,
    top,
    right: wallFeature.feature.xIn + wallFeature.feature.widthIn,
    bottom: bounds.maxY,
  };
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
