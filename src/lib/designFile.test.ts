import { describe, expect, it } from 'vitest';
import { parseDesignFile, serializeDesignFile } from './designFile';
import type {
  ArtPiece,
  AutoPlacementSettings,
  EditorFeatures,
  Placement,
  WallSection,
} from '../types';

describe('design JSON files', () => {
  it('round-trips wall sections, pieces, placements, unit, and selection', () => {
    const sections: WallSection[] = [
      {
        id: 'main',
        name: 'Main',
        widthIn: 96.25,
        heightIn: 84.5,
        cornerAfter: 'none',
        xIn: 0,
        yIn: 0,
      },
    ];
    const pieces: ArtPiece[] = [
      { id: 'piece-1', label: 'Piece 1', widthIn: 16.25, heightIn: 20.5 },
    ];
    const placements: Placement[] = [
      { pieceId: 'piece-1', sectionId: 'main', xIn: 12.375, yIn: 8.25 },
    ];
    const features: EditorFeatures = {
      snapToGrid: true,
      gridSizeIn: 2.5,
      snapToAlignment: false,
      showAlignmentGuides: false,
      alignmentToleranceIn: 1.5,
      wallEdgeBuffer: true,
      wallEdgeBufferGapIn: 3,
      artPieceBuffer: true,
      artPieceBufferGapIn: 4,
      measurementReferenceMode: 'absolute',
    };
    const autoPlacementSettings: AutoPlacementSettings = {
      wallSetupMode: 'full-wall-with-features',
      context: { kind: 'blank', viewingPosture: 'seated' },
      layoutPreference: 'row',
      wallFeatures: [
        {
          id: 'desk',
          type: 'file-cabinet',
          name: 'File cabinet',
          xIn: 8,
          yIn: 20,
          widthIn: 72,
          heightIn: 30,
          placed: true,
          clearanceOverrideIn: 10,
        },
        {
          id: 'lamp',
          type: 'lamp',
          name: 'Lamp',
          xIn: 0,
          yIn: 0,
          widthIn: 14,
          heightIn: 36,
          placed: false,
        },
      ],
    };

    const json = serializeDesignFile({
      unit: 'in',
      themeMode: 'dark',
      applicationTheme: 'slate',
      sections,
      pieces,
      placements,
      features,
      autoPlacementSettings,
      selectedPieceId: 'piece-1',
    });

    expect(parseDesignFile(json)).toEqual({
      unit: 'in',
      themeMode: 'dark',
      applicationTheme: 'slate',
      sections,
      pieces,
      placements,
      features,
      autoPlacementSettings,
      selectedPieceId: 'piece-1',
    });
  });

  it('rejects invalid design JSON with a clear error', () => {
    expect(() => parseDesignFile('{"unit":"yards"}')).toThrow('Design file is missing sections.');
  });

  it('defaults missing theme settings to system and slate', () => {
    const parsed = parseDesignFile(
      JSON.stringify({
        sections: [
          {
            id: 'section-1',
            name: 'Section 1',
            widthIn: 96,
            heightIn: 84,
            cornerAfter: 'none',
          },
        ],
        pieces: [{ id: 'piece-1', label: 'Piece 1', widthIn: 16, heightIn: 20 }],
        placements: [],
      }),
    );

    expect(parsed.themeMode).toBe('system');
    expect(parsed.applicationTheme).toBe('slate');
    expect(parsed.autoPlacementSettings).toEqual({
      wallSetupMode: 'available-sections',
      context: { kind: 'blank', viewingPosture: 'seated' },
      layoutPreference: 'auto',
      wallFeatures: [],
    });
    expect(parsed.features.measurementReferenceMode).toBe('relative');
    expect(parsed.features.showAlignmentGuides).toBe(true);
  });

  it('keeps legacy wall features valid when placement fields are missing', () => {
    const parsed = parseDesignFile(
      JSON.stringify({
        sections: [
          {
            id: 'section-1',
            name: 'Section 1',
            widthIn: 96,
            heightIn: 84,
            cornerAfter: 'none',
          },
        ],
        pieces: [{ id: 'piece-1', label: 'Piece 1', widthIn: 16, heightIn: 20 }],
        placements: [],
        autoPlacementSettings: {
          wallSetupMode: 'full-wall-with-features',
          context: { kind: 'blank', viewingPosture: 'seated' },
          layoutPreference: 'row',
          wallFeatures: [
            {
              id: 'sofa',
              type: 'sofa',
              name: 'Sofa',
              xIn: 12,
              widthIn: 84,
              heightIn: 30,
            },
          ],
        },
      }),
    );

    expect(parsed.autoPlacementSettings.wallFeatures[0]).toEqual({
      id: 'sofa',
      type: 'sofa',
      name: 'Sofa',
      xIn: 12,
      widthIn: 84,
      heightIn: 30,
    });
  });
});
