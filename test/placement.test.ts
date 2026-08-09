import { describe, expect, it } from 'vitest';
import { placePanel, type Box, type Size } from '../src/client/placement';

const VIEWPORT: Size = { width: 1440, height: 900 };
/** Roughly the real panel: fixed width, and tall once an element has findings. */
const PANEL: Size = { width: 420, height: 560 };
const MARGIN = 12;

function box(left: number, top: number, width: number, height: number): Box {
  return { left, top, right: left + width, bottom: top + height };
}

/** Every placement must satisfy this, whatever else it does. */
function assertOnScreen(placement: { left: number; top: number }, panel = PANEL, viewport = VIEWPORT) {
  expect(placement.left).toBeGreaterThanOrEqual(MARGIN);
  expect(placement.top).toBeGreaterThanOrEqual(MARGIN);
  expect(placement.left + panel.width).toBeLessThanOrEqual(viewport.width - MARGIN);
  expect(placement.top + panel.height).toBeLessThanOrEqual(viewport.height - MARGIN);
}

describe('placePanel', () => {
  it('sits immediately to the right of a narrow element', () => {
    const target = box(100, 200, 120, 40);
    const p = placePanel(target, PANEL, VIEWPORT, MARGIN);
    expect(p.side).toBe('right');
    expect(p.fitted).toBe(true);
    // Touching distance, not parked at the far edge.
    expect(p.left).toBe(target.right + MARGIN);
    expect(p.top).toBe(target.top);
  });

  it('flips to the left when the right is cramped', () => {
    const target = box(1100, 200, 200, 40);
    const p = placePanel(target, PANEL, VIEWPORT, MARGIN);
    expect(p.side).toBe('left');
    expect(p.left).toBe(target.left - MARGIN - PANEL.width);
    assertOnScreen(p);
  });

  it('drops below an element too wide for either side', () => {
    // A full-width row: no horizontal room, but plenty underneath.
    const target = box(20, 40, 1400, 80);
    const p = placePanel(target, { width: 420, height: 300 }, VIEWPORT, MARGIN);
    expect(p.side).toBe('below');
    expect(p.top).toBe(target.bottom + MARGIN);
    assertOnScreen(p, { width: 420, height: 300 });
  });

  it('goes above a wide element near the bottom', () => {
    const target = box(20, 700, 1400, 80);
    const p = placePanel(target, { width: 420, height: 300 }, VIEWPORT, MARGIN);
    expect(p.side).toBe('above');
    expect(p.top).toBe(target.top - MARGIN - 300);
    assertOnScreen(p, { width: 420, height: 300 });
  });

  // The reported bug: a tall panel on an element near the bottom of the page ran
  // off the screen, because `top` was clamped against a hardcoded height guess.
  it('never runs off the bottom, however tall the panel and however low the element', () => {
    for (const top of [700, 820, 880, 899, 1200]) {
      for (const height of [200, 400, 560, 700, 876]) {
        const p = placePanel(box(100, top, 120, 40), { width: 420, height }, VIEWPORT, MARGIN);
        expect(p.top + height, `top=${top} height=${height}`).toBeLessThanOrEqual(
          VIEWPORT.height - MARGIN,
        );
        expect(p.top, `top=${top} height=${height}`).toBeGreaterThanOrEqual(MARGIN);
      }
    }
  });

  it('never runs off the top for an element above the viewport', () => {
    const p = placePanel(box(100, -400, 120, 40), PANEL, VIEWPORT, MARGIN);
    assertOnScreen(p);
  });

  it('stays on screen for an element scrolled off to the right', () => {
    const p = placePanel(box(1600, 300, 200, 40), PANEL, VIEWPORT, MARGIN);
    assertOnScreen(p);
  });

  it('falls back to the least cramped side when nothing fits, and still clamps', () => {
    // An element filling the whole viewport: every side is short.
    const target = box(0, 0, 1440, 900);
    const p = placePanel(target, PANEL, VIEWPORT, MARGIN);
    expect(p.fitted).toBe(false);
    assertOnScreen(p);
  });

  it('keeps a panel wider than the viewport pinned to the left margin', () => {
    const narrow: Size = { width: 320, height: 480 };
    const wide: Size = { width: 420, height: 200 };
    const p = placePanel(box(10, 10, 100, 40), wide, narrow, MARGIN);
    // Cannot satisfy both margins, so the left one wins rather than producing a
    // negative offset.
    expect(p.left).toBe(MARGIN);
  });

  it('prefers a side with room over one merely closer', () => {
    // Room on the right for the panel, none on the left.
    const p = placePanel(box(40, 300, 100, 40), PANEL, VIEWPORT, MARGIN);
    expect(p.side).toBe('right');
    expect(p.fitted).toBe(true);
  });

  it('is deterministic: the same input gives the same placement', () => {
    const target = box(300, 300, 200, 60);
    expect(placePanel(target, PANEL, VIEWPORT, MARGIN)).toEqual(
      placePanel(target, PANEL, VIEWPORT, MARGIN),
    );
  });

  it('does not overlap the element when a side has room', () => {
    for (const target of [box(100, 100, 120, 40), box(1200, 400, 150, 40), box(20, 40, 1400, 60)]) {
      const panel: Size = { width: 420, height: 300 };
      const p = placePanel(target, panel, VIEWPORT, MARGIN);
      if (!p.fitted) continue;
      const overlaps =
        p.left < target.right && p.left + panel.width > target.left && p.top < target.bottom && p.top + panel.height > target.top;
      expect(overlaps, `overlapped on side ${p.side}`).toBe(false);
    }
  });
});
