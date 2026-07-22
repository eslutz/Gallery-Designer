import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('downloads complete PNG and PDF installation sheets', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Auto-place pieces' }).click();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();

  const pngDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Export PNG' }).click();
  const pngDownload = await pngDownloadPromise;
  expect(pngDownload.suggestedFilename()).toBe('gallery-wall-layout.png');
  const pngPath = await pngDownload.path();
  expect(pngPath).not.toBeNull();
  const png = await readFile(pngPath!);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.readUInt32BE(16)).toBe(1600);
  expect(png.readUInt32BE(20)).toBeGreaterThan(900);
  const latestUpdate = page.getByRole('region', { name: 'Latest update' }).getByRole('status');
  await expect(latestUpdate).toContainText('PNG export generated.');

  const pdfDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const pdfDownload = await pdfDownloadPromise;
  expect(pdfDownload.suggestedFilename()).toBe('gallery-wall-layout.pdf');
  const pdfPath = await pdfDownload.path();
  expect(pdfPath).not.toBeNull();
  const pdf = await readFile(pdfPath!);
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.byteLength).toBeGreaterThan(10_000);
  await expect(latestUpdate).toContainText('PDF export generated.');
});

test('paginates eight installation instructions without a nearly empty trailing page', async ({
  page,
}) => {
  await page.goto('/');
  for (let index = 0; index < 7; index += 1) {
    await page.getByRole('button', { name: 'Add art piece' }).click();
  }
  await page.getByRole('button', { name: 'Auto-place pieces' }).click();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const pdf = await readFile(downloadPath!);
  const pageObjects = pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? [];

  expect(pageObjects).toHaveLength(2);
});

test('MVP layout flow exports measurements', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Section 1 width', { exact: true }).fill('120');
  await page.getByLabel('Section 1 height', { exact: true }).fill('96');
  await page.getByLabel('Piece 1 width', { exact: true }).fill('10');
  await page.getByLabel('Piece 1 height', { exact: true }).fill('20');
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
  await expect(page.getByRole('complementary', { name: 'Details and export' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Advanced' })).toContainText('Design files');
  await page.getByRole('button', { name: 'Close Advanced', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Place on first wall' })).toHaveCount(0);
  await page.getByLabel('Piece 1 label').fill('MCFN');
  await page.getByLabel('Piece 1 width', { exact: true }).fill('2');
  await page.getByLabel('Piece 1 height', { exact: true }).fill('6');
  await page.getByRole('button', { name: 'Add wall section' }).click();
  await page.getByLabel('Section 2 width', { exact: true }).fill('72');
  await page.getByLabel('Section 2 height', { exact: true }).fill('96');
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

test('places and returns staged furniture through the shared SVG display paths', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Auto-placement options', exact: true }).click();
  await page.getByLabel('Wall setup', { exact: true }).selectOption('full-wall-with-features');
  await page.getByRole('button', { name: /Add furniture or feature/i }).click();
  await page
    .getByRole('dialog', { name: 'Auto-placement settings' })
    .getByLabel('Close auto-placement settings')
    .click();

  const stagedFeature = page.getByRole('button', { name: 'Drag Sofa 1 from staging' });
  await expect(stagedFeature.locator('[data-render-profile="tray"]')).toBeVisible();

  const canvas = page.getByRole('img', { name: 'Scaled gallery wall layout' });
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error('Canvas was not visible enough to place the staged furniture.');
  }
  await pointerDrag(page, stagedFeature, canvasBox.x + 260, canvasBox.y + 280);

  const wallFeature = page.getByRole('button', { name: 'Move Sofa 1', exact: true });
  await expect(wallFeature).toBeVisible();
  await expect(page.locator('.wall-feature[data-render-profile="wall"]')).toHaveCount(1);

  const tray = page.getByRole('region', { name: 'Art staging tray' });
  const trayBox = await tray.boundingBox();
  if (!trayBox) {
    throw new Error('Staging tray was not visible enough to return the furniture.');
  }
  await pointerDrag(
    page,
    wallFeature,
    trayBox.x + trayBox.width / 2,
    trayBox.y + trayBox.height / 2,
  );

  await expect(stagedFeature).toBeVisible();
  await stagedFeature.hover();
  await page.getByRole('button', { name: 'Remove Sofa 1 from staging' }).click();
  await expect(stagedFeature).toHaveCount(0);
});

test('keeps the wall corner action visible and clickable after leaving the artwork', async ({
  page,
}) => {
  await page.goto('/');

  const stagedPiece = page.getByRole('button', { name: 'Drag Piece 1 from staging' });
  const canvas = page.getByRole('img', { name: 'Scaled gallery wall layout' });
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error('Canvas was not visible enough to place the staged artwork.');
  }
  await pointerDrag(page, stagedPiece, canvasBox.x + 220, canvasBox.y + 180);

  const wallPiece = page.getByRole('button', { name: 'Move Piece 1', exact: true });
  const removeButton = page.getByRole('button', { name: 'Return Piece 1 to staging', exact: true });
  const wallPieceBox = await wallPiece.boundingBox();
  const removeButtonBox = await removeButton.boundingBox();
  if (!wallPieceBox || !removeButtonBox) {
    throw new Error('Placed artwork or its wall remove control was not visible enough to measure.');
  }
  expect(
    Math.abs(removeButtonBox.x + removeButtonBox.width / 2 - (wallPieceBox.x + wallPieceBox.width)),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(removeButtonBox.y + removeButtonBox.height / 2 - wallPieceBox.y),
  ).toBeLessThanOrEqual(2);
  await wallPiece.hover();
  await expect(removeButton).toBeVisible();

  await removeButton.hover();
  await expect(removeButton).toBeVisible();
  await wallPiece.hover();
  await removeButton.hover();
  await expect(removeButton).toBeVisible();
  await removeButton.click();

  await expect(page.getByRole('button', { name: 'Drag Piece 1 from staging' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move Piece 1', exact: true })).toHaveCount(0);
});

test('shows an alignment guide while pointer dragging into a center snap', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({
        unit: 'in',
        themeMode: 'system',
        applicationTheme: 'slate',
        sections: [
          {
            id: 'wall',
            name: 'Wall',
            widthIn: 96,
            heightIn: 84,
            xIn: 0,
            yIn: 0,
          },
        ],
        pieces: [
          { id: 'moving', label: 'Moving', widthIn: 12, heightIn: 10 },
          { id: 'fixed', label: 'Fixed', widthIn: 20, heightIn: 16 },
        ],
        placements: [{ pieceId: 'fixed', sectionId: 'wall', xIn: 10, yIn: 10 }],
        features: {
          snapToGrid: false,
          gridSizeIn: 1,
          snapToAlignment: true,
          showAlignmentGuides: true,
          alignmentToleranceIn: 1,
          wallEdgeBuffer: false,
          wallEdgeBufferGapIn: 2,
          artPieceBuffer: false,
          artPieceBufferGapIn: 2,
          measurementReferenceMode: 'relative',
        },
        autoPlacementSettings: {
          wallSetupMode: 'available-sections',
          context: { kind: 'blank', viewingPosture: 'seated' },
          layoutPreference: 'auto',
          wallFeatures: [],
        },
        selectedPieceIds: ['moving'],
        message: 'Test design.',
      }),
    );
  });
  await page.goto('/');

  const canvas = page.getByRole('img', { name: 'Scaled gallery wall layout' });
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error('Canvas was not visible enough to drag.');
  }

  const target = await page.locator('.wall-canvas').evaluate((svg) => {
    const matrix = (svg as SVGSVGElement).getScreenCTM();
    if (!matrix) {
      throw new Error('Canvas screen matrix was not available.');
    }
    return {
      x: 20 * matrix.a + 18 * matrix.c + matrix.e,
      y: 20 * matrix.b + 18 * matrix.d + matrix.f,
    };
  });
  await pointerDragTo(
    page,
    page.getByRole('button', { name: 'Drag Moving from staging' }),
    target.x,
    target.y,
  );

  await expect(page.getByTestId('alignment-guide-x')).toHaveClass(/center/);
  await expect(page.getByTestId('alignment-guide-x')).toHaveAttribute('x1', '20');
});

test('modifier and marquee selection move placed art as a group', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add art piece' }).click();
  await page.getByRole('button', { name: 'Add art piece' }).click();
  await page.getByRole('button', { name: 'Auto-place pieces' }).click();

  const first = page.getByRole('button', { name: 'Move Piece 1', exact: true });
  const second = page.getByRole('button', { name: 'Move Piece 2', exact: true });
  await first.click();
  await second.click({ modifiers: ['Shift'] });
  await expect(page.locator('.piece.selected')).toHaveCount(2);

  const before = await piecePositions([first, second]);
  const firstBox = await first.boundingBox();
  if (!firstBox) {
    throw new Error('Selected art did not have a visible drag box.');
  }
  await pointerDrag(
    page,
    first,
    firstBox.x + firstBox.width / 2 + 30,
    firstBox.y + firstBox.height / 2 + 20,
  );
  const after = await piecePositions([first, second]);
  expect(after[0].x - before[0].x).toBeCloseTo(after[1].x - before[1].x, 5);
  expect(after[0].y - before[0].y).toBeCloseTo(after[1].y - before[1].y, 5);
  expect(after[0]).not.toEqual(before[0]);

  const placedPieces = [
    first,
    second,
    page.getByRole('button', { name: 'Move Piece 3', exact: true }),
  ];
  const pieceBoxes = await Promise.all(placedPieces.map((piece) => piece.boundingBox()));
  if (pieceBoxes.some((box) => !box)) {
    throw new Error('Placed art did not have visible boxes for marquee selection.');
  }
  const boxes = pieceBoxes as NonNullable<(typeof pieceBoxes)[number]>[];
  const start = {
    x: Math.min(...boxes.map((box) => box.x)) - 4,
    y: Math.min(...boxes.map((box) => box.y)) - 4,
  };
  const end = {
    x: Math.max(...boxes.map((box) => box.x + box.width)) + 4,
    y: Math.max(...boxes.map((box) => box.y + box.height)) + 4,
  };
  await page.locator('.wall-section').first().dispatchEvent('pointerdown', {
    pointerId: 12,
    pointerType: 'mouse',
    button: 0,
    clientX: start.x,
    clientY: start.y,
  });
  await dispatchWindowPointer(page, 'pointermove', end.x, end.y, 12);
  await expect(page.locator('.selection-marquee')).toBeVisible();
  await expect(page.locator('.piece.selected')).toHaveCount(3);
  await dispatchWindowPointer(page, 'pointerup', end.x, end.y, 12);
  await expect(page.locator('.selection-marquee')).toHaveCount(0);
});

test('auto-placement preserves manually positioned art while placing the remaining pieces', async ({
  page,
}) => {
  await page.goto('/');

  const canvas = page.getByRole('img', { name: 'Scaled gallery wall layout' });
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error('Canvas was not visible enough to place the fixed piece.');
  }
  await pointerDrag(
    page,
    page.getByRole('button', { name: 'Drag Piece 1 from staging' }),
    canvasBox.x + canvasBox.width / 2,
    canvasBox.y + canvasBox.height / 2,
  );

  const fixedPiece = page.getByRole('button', { name: 'Move Piece 1', exact: true });
  const fixedPosition = {
    x: await fixedPiece.getAttribute('x'),
    y: await fixedPiece.getAttribute('y'),
  };
  await page.getByRole('button', { name: 'Add art piece' }).click();
  await page.getByRole('button', { name: 'Add art piece' }).click();

  await page.getByRole('button', { name: 'Auto-place pieces' }).click();

  await expect(fixedPiece).toHaveAttribute('x', fixedPosition.x ?? '');
  await expect(fixedPiece).toHaveAttribute('y', fixedPosition.y ?? '');
  await expect(page.getByRole('button', { name: 'Move Piece 2', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move Piece 3', exact: true })).toBeVisible();
  await expect(
    page
      .locator('[role="status"]')
      .filter({
        hasText: 'Auto-placement placed 2 remaining pieces around 1 piece you positioned.',
      })
      .first(),
  ).toContainText('Auto-placement placed 2 remaining pieces around 1 piece you positioned.');
});

test('mobile staged pieces keep touch drags from becoming page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Drag Piece 1 from staging' })).toHaveCSS(
    'touch-action',
    'none',
  );
});

test('zoomed wall canvas supports wheel zoom and touchpad-style panning', async ({ page }) => {
  await page.goto('/');

  const canvas = page.getByRole('img', { name: 'Scaled gallery wall layout' });
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error('Canvas was not visible enough to pan.');
  }

  const initialViewBox = await readCanvasViewBox(page);
  await canvas.dispatchEvent('wheel', {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    deltaY: -160,
    clientX: canvasBox.x + 80,
    clientY: canvasBox.y + 80,
  });

  const zoomedViewBox = await readCanvasViewBox(page);
  expect(zoomedViewBox.width).toBeLessThan(initialViewBox.width);
  expect(zoomedViewBox.height).toBeLessThan(initialViewBox.height);

  await canvas.dispatchEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY: 120,
    clientX: canvasBox.x + canvasBox.width / 2,
    clientY: canvasBox.y + canvasBox.height / 2,
  });

  const wheelPannedViewBox = await readCanvasViewBox(page);
  expect(wheelPannedViewBox.y).toBeGreaterThan(zoomedViewBox.y);

  await canvas.dispatchEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaX: 80,
    deltaY: 0,
    clientX: canvasBox.x + canvasBox.width / 2,
    clientY: canvasBox.y + canvasBox.height / 2,
  });

  const horizontalPannedViewBox = await readCanvasViewBox(page);
  expect(horizontalPannedViewBox.x).toBeGreaterThan(wheelPannedViewBox.x);

  await page.evaluate(() => window.scrollTo(0, 80));
  const scrolledCanvasBox = await canvas.boundingBox();
  if (!scrolledCanvasBox) {
    throw new Error('Canvas was not visible enough to test scroll capture.');
  }
  const pageScrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.move(
    scrolledCanvasBox.x + scrolledCanvasBox.width / 2,
    scrolledCanvasBox.y + scrolledCanvasBox.height / 2,
  );
  await page.mouse.wheel(0, 120);

  expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);
});

test('keeps responsive workspace panels contained and switches mobile measurements to cards', async ({
  page,
}) => {
  const advancedDrawerLayer = page.locator(
    '.advanced-drawer-layer:not(.placement-settings-drawer-layer)',
  );
  const isAdvancedDrawerOpen = async () =>
    advancedDrawerLayer.evaluate((element) => {
      return element.classList.contains('is-open');
    });

  const closeAdvancedDrawer = async () => {
    if (await isAdvancedDrawerOpen()) {
      await advancedDrawerLayer.locator('.advanced-drawer-backdrop').evaluate((element) => {
        (element as HTMLButtonElement).click();
      });
      await expect.poll(async () => isAdvancedDrawerOpen()).toBe(false);
    }
  };

  const expectStatusMessageWithinPanel = async () => {
    if (!(await isAdvancedDrawerOpen())) {
      const advancedButton = page.getByRole('button', { name: 'Advanced', exact: true });
      await advancedButton.scrollIntoViewIfNeeded();
      await advancedButton.evaluate((element) => {
        (element as HTMLButtonElement).click();
      });
    }
    const statusTextBounds = await page.evaluate(() => {
      const panel = document.querySelector(
        '.advanced-drawer:not(.placement-settings-drawer) .status-panel',
      );
      const message = document.querySelector(
        '.advanced-drawer:not(.placement-settings-drawer) .status-message',
      );
      if (!panel || !message) {
        throw new Error('Could not find latest update panel content.');
      }
      const panelRect = panel.getBoundingClientRect();
      const messageRect = message.getBoundingClientRect();
      return {
        panel: {
          right: panelRect.right,
          bottom: panelRect.bottom,
        },
        message: {
          right: messageRect.right,
          bottom: messageRect.bottom,
        },
      };
    });
    const textTolerance = 1;

    expect(statusTextBounds.message.right).toBeLessThanOrEqual(
      statusTextBounds.panel.right + textTolerance,
    );
    expect(statusTextBounds.message.bottom).toBeLessThanOrEqual(
      statusTextBounds.panel.bottom + textTolerance,
    );
  };

  const expectAdvancedDrawerContained = async (viewportWidth: number, viewportHeight: number) => {
    const advancedDrawer = page.locator('.advanced-drawer:not(.placement-settings-drawer)');
    if (!(await isAdvancedDrawerOpen())) {
      await page.locator('.editor-column').evaluate((element) => {
        element.scrollTop = 0;
      });
      const advancedButton = page.getByRole('button', { name: 'Advanced', exact: true });
      await advancedButton.scrollIntoViewIfNeeded();
      await advancedButton.evaluate((element) => {
        (element as HTMLButtonElement).click();
      });
    }
    await expect(advancedDrawer).toContainText('Design files');
    await page.getByRole('button', { name: 'Export PNG' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Import JSON', exact: true })).toBeVisible();

    const drawerBounds = await page.evaluate(() => {
      const drawer = document.querySelector<HTMLElement>(
        '.advanced-drawer:not(.placement-settings-drawer)',
      );
      if (!drawer) {
        throw new Error('Could not find advanced drawer.');
      }
      const rect = drawer.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        top: rect.top,
      };
    });
    const tolerance = 1;

    expect(drawerBounds.left).toBeGreaterThanOrEqual(0);
    expect(drawerBounds.top).toBeGreaterThanOrEqual(0);
    expect(drawerBounds.right).toBeLessThanOrEqual(viewportWidth + tolerance);
    expect(drawerBounds.bottom).toBeLessThanOrEqual(viewportHeight + tolerance);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewportWidth,
    );
  };

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectStatusMessageWithinPanel();

  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/');
  const twoColumnDesktopLayout = await page.evaluate(() => {
    const getBox = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        throw new Error(`Could not find ${selector}`);
      }
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        top: rect.top,
      };
    };
    const workspace = document.querySelector<HTMLElement>('.workspace');
    if (!workspace) {
      throw new Error('Could not find .workspace');
    }

    return {
      canvasCard: getBox('.canvas-card'),
      editor: getBox('.editor-column'),
      stagingTray: getBox('.staging-tray'),
      workspaceColumnCount: getComputedStyle(workspace)
        .gridTemplateColumns.split(' ')
        .filter(Boolean).length,
    };
  });
  expect(twoColumnDesktopLayout.workspaceColumnCount).toBe(2);
  expect(twoColumnDesktopLayout.editor.clientHeight).toBeGreaterThan(0);
  expect(twoColumnDesktopLayout.stagingTray.bottom).toBeLessThanOrEqual(
    twoColumnDesktopLayout.canvasCard.bottom + 1,
  );
  expect(twoColumnDesktopLayout.canvasCard.scrollHeight).toBeLessThanOrEqual(
    twoColumnDesktopLayout.canvasCard.clientHeight + 1,
  );
  expect(twoColumnDesktopLayout.editor.scrollHeight).toBeGreaterThan(
    twoColumnDesktopLayout.editor.clientHeight,
  );

  await page.setViewportSize({ width: 2200, height: 900 });
  await page.goto('/');
  const wideDesktopLayout = await page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>('.workspace');
    const editor = document.querySelector<HTMLElement>('.editor-column');
    if (!workspace || !editor) {
      throw new Error('Could not find wide desktop layout elements.');
    }
    return {
      editorWidth: editor.getBoundingClientRect().width,
      workspaceColumnCount: getComputedStyle(workspace)
        .gridTemplateColumns.split(' ')
        .filter(Boolean).length,
    };
  });
  expect(wideDesktopLayout.workspaceColumnCount).toBe(2);
  expect(wideDesktopLayout.editorWidth).toBeLessThanOrEqual(1441);

  for (const width of [940, 1024, 1100, 1199]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Auto-place pieces' }).click();

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );

    const layout = await page.evaluate(() => {
      const getBox = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) {
          throw new Error(`Could not find ${selector}`);
        }
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      };
      const workspace = document.querySelector('.workspace');
      if (!workspace) {
        throw new Error('Could not find .workspace');
      }

      return {
        canvas: getBox('.canvas-card'),
        measurements: getBox('.measurements-panel'),
        documentOverflowY: getComputedStyle(document.documentElement).overflowY,
        editor: getBox('.editor-column'),
        setup: getBox('.setup-panel'),
        workspaceColumnCount: getComputedStyle(workspace)
          .gridTemplateColumns.split(' ')
          .filter(Boolean).length,
      };
    });
    const tolerance = 1;

    expect(layout.workspaceColumnCount).toBe(2);
    expect(layout.setup.top).toBeLessThanOrEqual(layout.editor.top + tolerance);
    expect(layout.canvas.bottom).toBeLessThanOrEqual(layout.measurements.top + tolerance);
    expect(layout.documentOverflowY).toBe('hidden');
    await page.evaluate(() => window.scrollTo(0, 200));
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }

  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto('/');
  const smallDesktopLayout = await page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>('.workspace');
    const setup = document.querySelector<HTMLElement>('.setup-panel');
    const editor = document.querySelector<HTMLElement>('.editor-column');
    if (!workspace || !setup || !editor) {
      throw new Error('Could not find small desktop layout elements.');
    }
    return {
      editorTop: editor.getBoundingClientRect().top,
      setupBottom: setup.getBoundingClientRect().bottom,
      workspaceColumnCount: getComputedStyle(workspace)
        .gridTemplateColumns.split(' ')
        .filter(Boolean).length,
    };
  });
  expect(smallDesktopLayout.workspaceColumnCount).toBe(1);
  expect(smallDesktopLayout.editorTop).toBeGreaterThanOrEqual(smallDesktopLayout.setupBottom - 1);
  await expectAdvancedDrawerContained(900, 900);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem(
      'gallery-designer-state-v1',
      JSON.stringify({
        unit: 'in',
        themeMode: 'system',
        applicationTheme: 'slate',
        sections: [{ id: 'wall', name: 'Wall', widthIn: 96, heightIn: 84, xIn: 0, yIn: 0 }],
        pieces: [{ id: 'piece-1', label: 'Piece 1', widthIn: 16, heightIn: 20 }],
        placements: [{ pieceId: 'piece-1', sectionId: 'wall', xIn: 20, yIn: 20 }],
      }),
    );
  });
  await page.goto('/');
  const editorBox = await page.locator('.editor-column').boundingBox();
  const setupBox = await page.locator('.setup-panel').boundingBox();
  expect(editorBox).not.toBeNull();
  expect(setupBox).not.toBeNull();
  expect(editorBox?.y).toBeLessThan(setupBox?.y ?? Number.POSITIVE_INFINITY);
  expect(setupBox?.height).toBeGreaterThan(0);
  await expect(page.locator('.right-panel')).toHaveCount(0);
  await expect(page.locator('.measurements-table')).toHaveCSS('display', 'none');
  await expectAdvancedDrawerContained(390, 844);
  await closeAdvancedDrawer();
  await expect(page.locator('.measurement-cards')).toHaveCSS('display', 'grid');
});

test('info tooltips stay inside a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const expectTooltipInsideViewport = async (label: string) => {
    const button = page.getByRole('button', { name: label });
    await button.scrollIntoViewIfNeeded();
    await button.hover();

    const tooltip = page.locator('.info-tooltip-open');
    await expect(tooltip).toBeVisible();
    const box = await tooltip.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);

    await page.mouse.move(0, 0);
    await expect(tooltip).toHaveCount(0);
  };

  const advancedButton = page.getByRole('button', { name: 'Advanced', exact: true });
  await advancedButton.scrollIntoViewIfNeeded();
  await advancedButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expectTooltipInsideViewport('Snap to alignment information');
  await expectTooltipInsideViewport('Print/export layout information');
});

async function piecePositions(locators: import('@playwright/test').Locator[]) {
  return Promise.all(
    locators.map(async (piece) => ({
      x: Number(await piece.getAttribute('x')),
      y: Number(await piece.getAttribute('y')),
    })),
  );
}

async function dispatchWindowPointer(
  page: import('@playwright/test').Page,
  type: 'pointermove' | 'pointerup',
  clientX: number,
  clientY: number,
  pointerId: number,
) {
  await page.evaluate(
    ({ eventType, x, y, id }) => {
      window.dispatchEvent(
        new PointerEvent(eventType, {
          bubbles: true,
          pointerId: id,
          pointerType: 'mouse',
          clientX: x,
          clientY: y,
        }),
      );
    },
    { eventType: type, x: clientX, y: clientY, id: pointerId },
  );
}

async function pointerDrag(
  page: import('@playwright/test').Page,
  source: import('@playwright/test').Locator,
  targetX: number,
  targetY: number,
) {
  await pointerDragTo(page, source, targetX, targetY);
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

async function pointerDragTo(
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
}

async function readCanvasViewBox(page: import('@playwright/test').Page) {
  return page.locator('.wall-canvas').evaluate((canvas) => {
    const viewBox = canvas.getAttribute('viewBox');
    if (!viewBox) {
      throw new Error('Expected a canvas viewBox.');
    }
    const [x, y, width, height] = viewBox.split(' ').map(Number);
    return { x, y, width, height };
  });
}
