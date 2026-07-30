import '@testing-library/jest-dom/vitest';

// jsdom ships no PointerEvent, so `pointerType` is dropped from anything
// fireEvent constructs and every synthetic pointer looks like a mouse. The app
// branches on that value — touch input holds a staged card before dragging,
// while a mouse drags immediately — so without this the touch path is
// untestable. Minimal on purpose: only the fields the app actually reads.
if (typeof globalThis.PointerEvent === 'undefined') {
  class JsdomPointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    readonly width: number;
    readonly height: number;
    readonly pressure: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? '';
      this.isPrimary = init.isPrimary ?? false;
      this.width = init.width ?? 1;
      this.height = init.height ?? 1;
      this.pressure = init.pressure ?? 0;
    }
  }

  globalThis.PointerEvent = JsdomPointerEvent as unknown as typeof globalThis.PointerEvent;
}
