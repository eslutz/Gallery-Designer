import type { ArtPiece, HookPoint } from '../types';

export function getHookPoints(piece: ArtPiece): HookPoint[] {
  if (!piece.hookSpec) {
    return [];
  }

  if (piece.hookSpec.count === 1) {
    return [
      {
        label: 'Hook',
        xIn: piece.hookSpec.leftOffsetIn,
        yIn: piece.hookSpec.topOffsetIn,
        reference: 'left',
      },
    ];
  }

  return [
    {
      label: 'Left hook',
      xIn: piece.hookSpec.leftSideOffsetIn,
      yIn: piece.hookSpec.leftTopOffsetIn,
      reference: 'left',
    },
    {
      label: 'Right hook',
      xIn: piece.widthIn - piece.hookSpec.rightSideOffsetIn,
      yIn: piece.hookSpec.rightTopOffsetIn,
      reference: 'right',
    },
  ];
}
