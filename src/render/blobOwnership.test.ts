import { describe, expect, it, vi } from "vitest";
import { OwnedBlobUrls } from "./blobOwnership";

describe("OwnedBlobUrls", () => {
  it("在失败、过期、换章和 dispose 清理路径中只撤销每个 URL 一次", () => {
    const revoke = vi.fn();
    const owned = new OwnedBlobUrls(revoke);
    owned.add("blob:css/failed");
    owned.revokeAll();
    owned.revokeAll();
    expect(revoke).toHaveBeenCalledTimes(1);

    owned.add("blob:css/stale");
    owned.add("blob:css/stale");
    owned.revokeAll();
    expect(revoke).toHaveBeenCalledTimes(2);

    owned.add("blob:css/chapter");
    owned.revokeAll();
    owned.revokeAll();
    expect(revoke).toHaveBeenCalledTimes(3);
  });

  it("只从拥有集合撤销，不触碰 ResourceServer 共享 URL", () => {
    const revoke = vi.fn();
    const owned = new OwnedBlobUrls(revoke);
    owned.add("blob:css/only");
    owned.revokeAll();
    expect(revoke).toHaveBeenCalledWith("blob:css/only");
    expect(revoke).not.toHaveBeenCalledWith("blob:book/shared-image");
  });
});
