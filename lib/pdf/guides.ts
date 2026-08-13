/**
 * Word-style smart guides: while an element is dragged, its edges and centre
 * are compared against the page and against the other elements, and the nearest
 * match within a tolerance pulls the element into line.
 *
 * Pure geometry — no React, no DOM — so the snapping rules are unit-testable
 * rather than something you can only check by dragging a box around.
 *
 * All values are PDF points with a bottom-left origin.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type GuideKind = 'page-center' | 'page-edge' | 'element';

export interface ActiveGuide {
  /** `x` guides are vertical lines, `y` guides horizontal ones. */
  axis: 'x' | 'y';
  /** Position of the line, in PDF points. */
  position: number;
  kind: GuideKind;
}

export interface SnapResult {
  rect: Rect;
  guides: ActiveGuide[];
}

interface Target {
  position: number;
  kind: GuideKind;
}

/** The three lines an element can align by, on one axis. */
function anchorsX(rect: Rect): number[] {
  return [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
}

function anchorsY(rect: Rect): number[] {
  return [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
}

function targetsFor(
  axis: 'x' | 'y',
  others: Rect[],
  page: { width: number; height: number },
): Target[] {
  const pageSize = axis === 'x' ? page.width : page.height;

  const targets: Target[] = [
    { position: pageSize / 2, kind: 'page-center' },
    { position: 0, kind: 'page-edge' },
    { position: pageSize, kind: 'page-edge' },
  ];

  for (const other of others) {
    const anchors = axis === 'x' ? anchorsX(other) : anchorsY(other);
    for (const position of anchors) {
      targets.push({ position, kind: 'element' });
    }
  }

  return targets;
}

function bestSnap(
  anchors: number[],
  targets: Target[],
  tolerance: number,
): { delta: number; guide: ActiveGuide } | null {
  let best: { delta: number; target: Target } | null = null;

  for (const anchor of anchors) {
    for (const target of targets) {
      const delta = target.position - anchor;
      if (Math.abs(delta) > tolerance) continue;

      // Ties favour the earlier target, which puts page centre ahead of
      // element edges — the alignment users reach for most often.
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = { delta, target };
      }
    }
  }

  if (!best) return null;

  return {
    delta: best.delta,
    guide: {
      axis: 'x',
      position: best.target.position,
      kind: best.target.kind,
    },
  };
}

/**
 * Nudges `moving` onto the nearest alignment within `tolerance` and reports the
 * guides that should be drawn. Returns the rect unchanged when nothing is close
 * enough.
 */
export function snapToGuides(
  moving: Rect,
  others: Rect[],
  page: { width: number; height: number },
  tolerance: number,
): SnapResult {
  const guides: ActiveGuide[] = [];
  const result: Rect = { ...moving };

  const horizontal = bestSnap(
    anchorsX(moving),
    targetsFor('x', others, page),
    tolerance,
  );

  if (horizontal) {
    result.x += horizontal.delta;
    guides.push({ ...horizontal.guide, axis: 'x' });
  }

  const vertical = bestSnap(
    anchorsY(moving),
    targetsFor('y', others, page),
    tolerance,
  );

  if (vertical) {
    result.y += vertical.delta;
    guides.push({ ...vertical.guide, axis: 'y' });
  }

  return { rect: result, guides };
}

/** Centres a rect on the page — the explicit version of dragging to centre. */
export function centerOnPage(
  rect: Rect,
  page: { width: number; height: number },
  axis: 'x' | 'y' | 'both',
): Rect {
  return {
    ...rect,
    x:
      axis === 'x' || axis === 'both'
        ? (page.width - rect.width) / 2
        : rect.x,
    y:
      axis === 'y' || axis === 'both'
        ? (page.height - rect.height) / 2
        : rect.y,
  };
}
