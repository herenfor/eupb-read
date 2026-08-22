import { describe, expect, it } from "vitest";
import { countCodePoints, getNoteContentError, isNoteContentSavable, NOTE_CONTENT_MAX_CODE_POINTS } from "./NoteComposer";

describe("NoteComposer helpers", () => {
  it("counts Unicode code points rather than UTF-16 units", () => {
    expect(countCodePoints("a😀" )).toBe(2);
  });

  it("rejects blank content and accepts the exact limit", () => {
    expect(isNoteContentSavable("   \n")).toBe(false);
    expect(isNoteContentSavable("字".repeat(NOTE_CONTENT_MAX_CODE_POINTS))).toBe(true);
    expect(isNoteContentSavable("字".repeat(NOTE_CONTENT_MAX_CODE_POINTS + 1))).toBe(false);
  });

  it("distinguishes blank and over-limit validation errors", () => {
    expect(getNoteContentError(" \n")).toBe("empty");
    expect(getNoteContentError("字".repeat(NOTE_CONTENT_MAX_CODE_POINTS + 1))).toBe("too-long");
    expect(getNoteContentError("有效笔记")).toBeNull();
  });
});
