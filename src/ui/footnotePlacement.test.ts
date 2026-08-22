import { describe, expect, it } from "vitest";
import { placeFootnote, type FootnoteRect } from "./footnotePlacement";

const anchor = (left: number, top: number, right: number, bottom: number): FootnoteRect => ({
  left,
  top,
  right,
  bottom,
});

describe("placeFootnote", () => {
  it("prefers a complete upper-right placement in a normal wide window", () => {
    expect(placeFootnote({ anchor: anchor(100, 300, 120, 320), containerWidth: 800, containerHeight: 600, cardWidth: 300, cardHeight: 180 })).toMatchObject({
      left: 128,
      top: 112,
      cardWidth: 300,
    });
  });

  it("uses the left side when the right side cannot fit", () => {
    expect(placeFootnote({ anchor: anchor(520, 300, 540, 320), containerWidth: 640, containerHeight: 480, cardWidth: 300, cardHeight: 180 }).left).toBe(212);
  });

  it("clamps to the larger side when neither horizontal side is complete", () => {
    const result = placeFootnote({ anchor: anchor(25, 200, 45, 220), containerWidth: 160, containerHeight: 480, cardWidth: 300, cardHeight: 180 });
    expect(result.cardWidth).toBe(144);
    expect(result.left).toBe(8);
  });

  it("prefers below when above is unavailable", () => {
    expect(placeFootnote({ anchor: anchor(100, 10, 120, 30), containerWidth: 640, containerHeight: 480, cardWidth: 300, cardHeight: 180 }).top).toBe(38);
  });

  it("chooses the side with more vertical space and clamps when neither is complete", () => {
    const result = placeFootnote({ anchor: anchor(100, 150, 120, 170), containerWidth: 640, containerHeight: 300, cardWidth: 300, cardHeight: 180 });
    expect(result.top).toBe(8);
  });

  it("limits height when the container is shorter than the card", () => {
    const result = placeFootnote({ anchor: anchor(20, 30, 40, 50), containerWidth: 320, containerHeight: 100, cardWidth: 300, cardHeight: 400 });
    expect(result.maxHeight).toBe(84);
    expect(result.top).toBe(8);
  });

  it("keeps all coordinates finite and non-negative for invalid input", () => {
    const result = placeFootnote({ anchor: anchor(Number.NaN, -10, Number.POSITIVE_INFINITY, Number.NaN), containerWidth: Number.NaN, containerHeight: -1, cardWidth: 300, cardHeight: Number.POSITIVE_INFINITY });
    expect(result).toEqual({ left: 0, top: 0, cardWidth: 0, maxHeight: 0 });
  });

  it("does not exceed the container width at narrow UI scale", () => {
    const result = placeFootnote({ anchor: anchor(40, 80, 55, 95), containerWidth: 180, containerHeight: 240, cardWidth: 300, cardHeight: 120 });
    expect(result.cardWidth).toBe(164);
    expect(result.left).toBe(8);
    expect(result.top).toBe(103);
  });
});
