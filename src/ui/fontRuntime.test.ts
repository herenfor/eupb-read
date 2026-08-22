import { describe, expect, it, vi } from "vitest";
import { createLazyFontController } from "./fontRuntime";

describe("lazy imported font runtime", () => {
  it("loads one selected id and releases it on switch/dispose", async () => {
    const revoke = vi.fn();
    const controller = createLazyFontController(async () => new Uint8Array([1]), {
      createObjectURL: () => "blob:font",
      revokeObjectURL: revoke,
    });
    await controller.select("a");
    await controller.select("b");
    expect(revoke).toHaveBeenCalledWith("blob:font");
    controller.dispose();
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it("does not let an older read win a race", async () => {
    let resolveA!: (bytes: Uint8Array) => void;
    const read = vi.fn((id: string) => id === "a"
      ? new Promise<Uint8Array>((resolve) => { resolveA = resolve; })
      : Promise.resolve(new Uint8Array([2])));
    const controller = createLazyFontController(read, {
      createObjectURL: (blob) => blob.size === 1 ? "blob:b" : "blob:x",
      revokeObjectURL: vi.fn(),
    });
    const old = controller.select("a");
    const current = controller.select("b");
    resolveA(new Uint8Array([1]));
    expect(await current).toBe("blob:b");
    expect(await old).toBeNull();
  });

  it("keeps the previous URL when the next font fails", async () => {
    const revoke = vi.fn();
    const controller = createLazyFontController(async (id) => {
      if (id === "bad") throw new Error("read failed");
      return new Uint8Array([1]);
    }, { createObjectURL: () => "blob:good", revokeObjectURL: revoke });
    expect(await controller.select("good")).toBe("blob:good");
    await expect(controller.select("bad")).rejects.toThrow("read failed");
    expect(revoke).not.toHaveBeenCalled();
    controller.dispose();
    expect(revoke).toHaveBeenCalledWith("blob:good");
  });
});
