import { parseHTML } from "linkedom";
import { describe, expect, it, vi } from "vitest";
import { clearDocumentSelection, isSelectAllShortcut } from "./selectionGuard";

function event(target: EventTarget, overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return { key: "a", ctrlKey: true, metaKey: false, target, ...overrides } as KeyboardEvent;
}

describe("selection keyboard guard", () => {
  it("blocks Ctrl/Cmd+A but not ordinary A or other modifiers", () => {
    const { document } = parseHTML("<html><body><p>正文</p></body></html>");
    const target = document.querySelector("p")!;
    expect(isSelectAllShortcut(event(target))).toBe(true);
    expect(isSelectAllShortcut(event(target, { key: "A", ctrlKey: false, metaKey: true }))).toBe(true);
    expect(isSelectAllShortcut(event(target, { key: "b" }))).toBe(false);
    expect(isSelectAllShortcut(event(target, { ctrlKey: false, metaKey: false }))).toBe(false);
  });

  it("allows shortcuts in input/textarea and contenteditable descendants", () => {
    const { document } = parseHTML(
      '<html><body><input id="i"><textarea id="t"></textarea><div contenteditable="true"><span id="child">text</span></div></body></html>'
    );
    expect(isSelectAllShortcut(event(document.querySelector("#i")!))).toBe(false);
    expect(isSelectAllShortcut(event(document.querySelector("#t")!))).toBe(false);
    expect(isSelectAllShortcut(event(document.querySelector("#child")!))).toBe(false);
  });

  it("removes every range from the supplied document selection", () => {
    const removeAllRanges = vi.fn();
    clearDocumentSelection({ getSelection: () => ({ removeAllRanges }) } as unknown as Document);
    expect(removeAllRanges).toHaveBeenCalledOnce();
    clearDocumentSelection(null);
  });
});
