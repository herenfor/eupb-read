import { afterEach, describe, expect, it, vi } from "vitest";
import { VisibilityGate } from "./displayGate";

function fakeElement(): {
  element: HTMLElement;
  value: (property: string) => string;
  priority: (property: string) => string;
} {
  const values = new Map<string, string>();
  const priorities = new Map<string, string>();
  const style = {
    getPropertyValue: (property: string) => values.get(property) ?? "",
    getPropertyPriority: (property: string) => priorities.get(property) ?? "",
    setProperty: (property: string, value: string, priority = "") => {
      values.set(property, value);
      if (priority) priorities.set(property, priority);
      else priorities.delete(property);
    },
    removeProperty: (property: string) => {
      values.delete(property);
      priorities.delete(property);
      return "";
    },
  } as unknown as CSSStyleDeclaration;
  const element = {
    style,
    ownerDocument: { defaultView: null },
  } as unknown as HTMLElement;
  return {
    element,
    value: (property) => values.get(property) ?? "",
    priority: (property) => priorities.get(property) ?? "",
  };
}

afterEach(() => vi.useRealTimers());

describe("VisibilityGate", () => {
  it("只允许当前代次揭示，并原样恢复 inline visibility", () => {
    vi.useFakeTimers();
    const { element, value, priority } = fakeElement();
    element.style.setProperty("visibility", "collapse", "important");
    const gate = new VisibilityGate(element, { timeoutMs: 20_000 });

    gate.hold(7);
    expect(value("visibility")).toBe("hidden");
    expect(priority("visibility")).toBe("important");
    expect(gate.release(6)).toBe(false);
    expect(value("visibility")).toBe("hidden");

    expect(gate.release(7)).toBe(true);
    expect(value("visibility")).toBe("collapse");
    expect(priority("visibility")).toBe("important");
  });

  it("快速换章转交 token 时，旧章完成不能揭示新章", () => {
    vi.useFakeTimers();
    const { element, value } = fakeElement();
    const gate = new VisibilityGate(element, { timeoutMs: 20_000 });

    gate.hold(1);
    gate.hold(2);
    expect(gate.release(1)).toBe(false);
    expect(value("visibility")).toBe("hidden");
    expect(gate.release(2)).toBe(true);
    expect(value("visibility")).toBe("");
  });

  it("超时解除隐藏但只通知当前 token", () => {
    vi.useFakeTimers();
    const { element, value } = fakeElement();
    const timedOut: number[] = [];
    const gate = new VisibilityGate(element, {
      timeoutMs: 500,
      onTimeout: (token) => timedOut.push(token),
    });

    gate.hold(3);
    vi.advanceTimersByTime(499);
    expect(value("visibility")).toBe("hidden");
    vi.advanceTimersByTime(1);
    expect(value("visibility")).toBe("");
    expect(timedOut).toEqual([3]);
  });

  it("dispose 清理计时器并恢复原始状态", () => {
    vi.useFakeTimers();
    const { element, value } = fakeElement();
    const onTimeout = vi.fn();
    const gate = new VisibilityGate(element, { timeoutMs: 500, onTimeout });

    gate.hold(4);
    gate.dispose();
    vi.advanceTimersByTime(500);
    expect(value("visibility")).toBe("");
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
