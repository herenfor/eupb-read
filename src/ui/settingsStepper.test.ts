import { describe, expect, it } from "vitest";
import { stepSettingValue } from "./settingsStepper";

describe("settings stepper bounds", () => {
  it("steps from the visible default when the stored value is automatic", () => {
    const lineHeights = [1.4, 1.6, 1.8, 2.0, 2.2];
    expect(stepSettingValue(lineHeights, undefined, -1, 1.6)).toBe(1.4);
    expect(stepSettingValue(lineHeights, undefined, 1, 1.6)).toBe(1.8);
  });

  it("keeps automatic spacing when stepping below its visible zero default", () => {
    const spacings = [0, 2, 4, 6, 8];
    expect(stepSettingValue(spacings, undefined, -1, 0)).toBeUndefined();
    expect(stepSettingValue(spacings, undefined, 1, 0)).toBe(2);
  });

  it("stays at numeric bounds instead of wrapping", () => {
    const weights = [300, 400, 500, 600, 700];
    expect(stepSettingValue(weights, 300, -1, 400)).toBe(300);
    expect(stepSettingValue(weights, 700, 1, 400)).toBe(700);
  });

  it("uses the nearest smaller or larger preset for intermediate values", () => {
    const lineHeights = [1.4, 1.6, 1.8, 2.0, 2.2];
    expect(stepSettingValue(lineHeights, 1.7, -1, 1.6)).toBe(1.6);
    expect(stepSettingValue(lineHeights, 1.7, 1, 1.6)).toBe(1.8);
    expect(stepSettingValue(lineHeights, 1.2, -1, 1.6)).toBe(1.4);
    expect(stepSettingValue(lineHeights, 2.4, 1, 1.6)).toBe(2.2);
  });
});
