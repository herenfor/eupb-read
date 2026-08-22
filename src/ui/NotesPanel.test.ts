import { describe, expect, it } from "vitest";
import { limitNotes, limitNotesForPanel, NOTES_RENDER_LIMIT, sortNotesNewestFirst } from "./NotesPanel";
import type { NoteViewModel } from "./NotesPanel";

const note = (id: string, createdAtMs: number): NoteViewModel => ({
  id,
  content: id,
  selectedText: id,
  chapterTitle: "第一章",
  createdAtMs,
});

describe("NotesPanel helpers", () => {
  it("sorts newest first with a deterministic tie breaker", () => {
    expect(sortNotesNewestFirst([note("a", 1), note("c", 3), note("b", 3)]).map((item) => item.id)).toEqual(["c", "b", "a"]);
  });

  it("bounds rendered cards for a large note collection", () => {
    const notes = Array.from({ length: NOTES_RENDER_LIMIT + 3 }, (_, index) => note(String(index), index));
    const result = limitNotesForPanel(notes);
    expect(result.items).toHaveLength(NOTES_RENDER_LIMIT);
    expect(result.limited).toBe(true);
    expect(result.items[0]?.id).toBe(String(NOTES_RENDER_LIMIT + 2));
  });

  it("can expose every note through successive batches", () => {
    const notes = Array.from({ length: NOTES_RENDER_LIMIT * 2 + 1 }, (_, index) => note(String(index), index));
    const first = limitNotes(notes, NOTES_RENDER_LIMIT);
    const second = limitNotes(notes, NOTES_RENDER_LIMIT * 2);
    const final = limitNotes(notes, NOTES_RENDER_LIMIT * 3);
    expect(first.limited).toBe(true);
    expect(second.items).toHaveLength(NOTES_RENDER_LIMIT * 2);
    expect(final.items).toHaveLength(notes.length);
    expect(final.limited).toBe(false);
  });
});
