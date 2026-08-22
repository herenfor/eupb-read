import { afterEach, describe, expect, it } from "vitest";
import { readSavedSettings, writeSavedSettings } from "./storage";

const originalStorage = globalThis.localStorage;

function installStorage(): Map<string, string> {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  return values;
}

afterEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: originalStorage,
  });
});

describe("saved reader settings", () => {
  it("保留 forceHorizontal，并兼容旧设置缺省字段", () => {
    const values = installStorage();
    values.set("epub-reader:settings", JSON.stringify({ theme: "dark" }));
    expect(readSavedSettings().forceHorizontal).toBeUndefined();

    writeSavedSettings({ theme: "dark", forceHorizontal: true });
    expect(readSavedSettings()).toMatchObject({ theme: "dark", forceHorizontal: true });
  });

  it("保留 preloadNextChapter，并兼容旧设置缺省字段", () => {
    const values = installStorage();
    values.set("epub-reader:settings", JSON.stringify({ theme: "dark" }));
    expect(readSavedSettings().preloadNextChapter).toBeUndefined();

    writeSavedSettings({ theme: "dark", preloadNextChapter: true });
    expect(readSavedSettings()).toMatchObject({ theme: "dark", preloadNextChapter: true });
  });
});
