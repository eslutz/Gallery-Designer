import { expect, test } from '@playwright/test';

test('MVP layout flow exports measurements', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Section 1 width').fill('120');
  await page.getByLabel('Section 1 height').fill('96');
  await page.getByLabel('Piece 1 width').fill('10');
  await page.getByLabel('Piece 1 height').fill('20');
  await expect(page.getByRole('region', { name: 'Art staging tray' })).toBeVisible();
  await expect(
    page.locator('.canvas-card').getByRole('region', { name: 'Art staging tray' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('button', { name: 'Drag Piece 1 from staging' })
      .getByTestId('staged-piece-preview'),
  ).toHaveCSS('width', '40px');
  await expect(
    page
      .getByRole('button', { name: 'Drag Piece 1 from staging' })
      .getByTestId('staged-piece-preview'),
  ).toHaveCSS('height', '80px');
  await expect(page.getByRole('button', { name: 'Drag Piece 1 from staging' })).toContainText(
    'Piece 1',
  );
  await expect(page.getByRole('button', { name: 'Drag Piece 1 from staging' })).toContainText(
    '10 in x 20 in',
  );
  await expect(page.getByRole('complementary', { name: 'Details and export' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place on first wall' })).toHaveCount(0);
  await page.getByLabel('Piece 1 label').fill('MCFN');
  await page.getByLabel('Piece 1 width').fill('2');
  await page.getByLabel('Piece 1 height').fill('6');
  await page.getByRole('button', { name: 'Add wall section' }).click();
  await page.getByLabel('Section 2 width').fill('72');
  await page.getByLabel('Section 2 height').fill('96');
  await page.getByRole('button', { name: 'Add art piece' }).click();
  await page.getByRole('button', { name: 'Add art piece' }).click();
  await page.getByRole('button', { name: 'Auto-place pieces' }).click();

  const labelY = await page.locator('.outside-piece-label').evaluate((label) => {
    const piece = document.querySelector('.piece rect[aria-label="Move MCFN"]');
    if (!piece) {
      throw new Error('MCFN piece was not rendered.');
    }
    return {
      text: label.textContent,
      labelY: Number(label.getAttribute('y')),
      pieceBottom: Number(piece.getAttribute('y')) + Number(piece.getAttribute('height')),
    };
  });
  expect(labelY.text).toContain('MCFN');
  expect(labelY.labelY).toBeGreaterThan(labelY.pieceBottom);

  await expect(page.getByRole('table', { name: 'Installation measurements' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeEnabled();
});

test('immediately picks up a piece placed from the staging tray without selecting text', async ({
  page,
}) => {
  await page.goto('/');

  const stagedPiece = page.getByRole('button', { name: 'Drag Piece 1 from staging' });
  const canvas = page.getByRole('img', { name: 'Scaled gallery wall layout' });
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error('Staged piece or canvas was not visible enough to drag.');
  }
  await pointerDrag(page, stagedPiece, canvasBox.x + 220, canvasBox.y + 180);

  const wallPiece = page.getByRole('button', { name: 'Move Piece 1', exact: true });
  await expect(wallPiece).toBeVisible();
  const before = await wallPiece.boundingBox();
  if (!before) {
    throw new Error('Placed art piece did not have a visible bounding box.');
  }

  await pointerDrag(
    page,
    wallPiece,
    before.x + before.width / 2 + 36,
    before.y + before.height / 2 + 24,
  );

  const after = await wallPiece.boundingBox();
  expect(after).not.toBeNull();
  expect(after?.x).not.toBe(before.x);
  await expect(page.locator('.piece.selected')).toHaveCount(1);
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
});

async function pointerDrag(
  page: import('@playwright/test').Page,
  source: import('@playwright/test').Locator,
  targetX: number,
  targetY: number,
) {
  const sourceBox = await source.boundingBox();
  if (!sourceBox) {
    throw new Error('Pointer drag source was not visible.');
  }
  const startX = sourceBox.x + sourceBox.width / 2;
  const startY = sourceBox.y + sourceBox.height / 2;

  await source.dispatchEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientX: startX,
    clientY: startY,
  });
  await page.evaluate(
    ({ x, y }) => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          buttons: 1,
          clientX: x,
          clientY: y,
        }),
      );
    },
    { x: targetX, y: targetY },
  );
  await page.evaluate(
    ({ x, y }) => {
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          buttons: 0,
          clientX: x,
          clientY: y,
        }),
      );
    },
    { x: targetX, y: targetY },
  );
}
