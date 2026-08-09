/**
 * Where to put the panel. Pure geometry, so it can be tested without a browser.
 *
 * Two rules, in this order: stay next to the element, and stay on screen. The
 * first is what makes the panel feel attached to what you are inspecting; the
 * second is not negotiable, because a panel half off the bottom of the window is
 * worse than one in the wrong place.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Side = 'right' | 'left' | 'below' | 'above';

export interface Placement {
  left: number;
  top: number;
  /** Which side was chosen, and whether it actually had room. */
  side: Side;
  fitted: boolean;
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max));

/**
 * Flip, then shift.
 *
 * Sides are tried in order and the first with room wins. Horizontal first: the
 * panel is tall and narrow, so beside an element is usually both closer and less
 * obstructive than under it.
 *
 * When no side has room — an element filling the viewport — the least cramped
 * side is used and the result is clamped. Overlapping is accepted only when
 * there is nowhere that does not.
 */
export function placePanel(target: Box, panel: Size, viewport: Size, margin = 12): Placement {
  const sides: { side: Side; room: number; need: number; left: number; top: number }[] = [
    {
      side: 'right',
      room: viewport.width - target.right - margin * 2,
      need: panel.width,
      left: target.right + margin,
      top: target.top,
    },
    {
      side: 'left',
      room: target.left - margin * 2,
      need: panel.width,
      left: target.left - margin - panel.width,
      top: target.top,
    },
    {
      side: 'below',
      room: viewport.height - target.bottom - margin * 2,
      need: panel.height,
      left: target.left,
      top: target.bottom + margin,
    },
    {
      side: 'above',
      room: target.top - margin * 2,
      need: panel.height,
      left: target.left,
      top: target.top - margin - panel.height,
    },
  ];

  const fits = sides.find((s) => s.room >= s.need);
  // `need` is a panel dimension and so never zero in practice, but a ratio is
  // only a fair comparison between sides while that holds.
  const chosen = fits ?? sides.reduce((best, s) => (s.room / s.need > best.room / best.need ? s : best));

  return {
    left: clamp(chosen.left, margin, viewport.width - panel.width - margin),
    top: clamp(chosen.top, margin, viewport.height - panel.height - margin),
    side: chosen.side,
    fitted: fits !== undefined,
  };
}
