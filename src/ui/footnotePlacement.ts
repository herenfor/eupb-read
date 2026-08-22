export interface FootnoteRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface FootnotePlacementInput {
  anchor: FootnoteRect;
  containerWidth: number;
  containerHeight: number;
  cardWidth: number;
  cardHeight: number;
  gap?: number;
}

export interface FootnotePlacement {
  left: number;
  top: number;
  cardWidth: number;
  maxHeight: number;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/** Choose a fully visible position in the .main coordinate system. */
export function placeFootnote(input: FootnotePlacementInput): FootnotePlacement {
  const width = finiteNonNegative(input.containerWidth);
  const height = finiteNonNegative(input.containerHeight);
  const gap = finiteNonNegative(input.gap ?? 8);
  // When the container is smaller than two gaps, reduce the effective edge
  // gap so the impossible layout still clamps inside the container boundary.
  const xGap = Math.min(gap, width / 2);
  const yGap = Math.min(gap, height / 2);
  const anchorLeft = finiteNonNegative(input.anchor.left);
  const anchorTop = finiteNonNegative(input.anchor.top);
  const anchorRight = Math.max(anchorLeft, finiteNonNegative(input.anchor.right));
  const anchorBottom = Math.max(anchorTop, finiteNonNegative(input.anchor.bottom));
  const cardWidth = Math.min(300, Math.max(0, width - 2 * gap));
  const measuredCardWidth = finiteNonNegative(input.cardWidth);
  const layoutCardWidth = measuredCardWidth > 0 ? Math.min(measuredCardWidth, cardWidth) : cardWidth;
  const maxHeight = Math.max(0, height - 2 * gap);
  const visibleCardHeight = Math.min(finiteNonNegative(input.cardHeight), maxHeight);

  const rightLeft = anchorRight + xGap;
  const leftLeft = anchorLeft - xGap - layoutCardWidth;
  const maxLeft = Math.max(xGap, width - layoutCardWidth - xGap);
  const rightFits = rightLeft + layoutCardWidth <= width - xGap;
  const leftFits = leftLeft >= xGap;
  let left: number;
  if (rightFits) {
    left = rightLeft;
  } else if (leftFits) {
    left = leftLeft;
  } else {
    const rightSpace = Math.max(0, width - anchorRight - 2 * xGap);
    const leftSpace = Math.max(0, anchorLeft - 2 * xGap);
    left = rightSpace >= leftSpace ? rightLeft : leftLeft;
    left = clamp(left, xGap, maxLeft);
  }

  const aboveTop = anchorTop - yGap - visibleCardHeight;
  const belowTop = anchorBottom + yGap;
  const aboveFits = aboveTop >= yGap;
  const belowFits = belowTop + visibleCardHeight <= height - yGap;
  let top: number;
  if (aboveFits) {
    top = aboveTop;
  } else if (belowFits) {
    top = belowTop;
  } else {
    const aboveSpace = Math.max(0, anchorTop - 2 * yGap);
    const belowSpace = Math.max(0, height - anchorBottom - 2 * yGap);
    top = aboveSpace >= belowSpace ? aboveTop : belowTop;
    top = clamp(top, yGap, Math.max(yGap, height - visibleCardHeight - yGap));
  }

  return {
    left: finiteNonNegative(left),
    top: finiteNonNegative(top),
    cardWidth: finiteNonNegative(cardWidth),
    maxHeight: finiteNonNegative(maxHeight),
  };
}
