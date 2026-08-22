/** Whether a key event is the select-all shortcut outside an editable control. */
export function isSelectAllShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "target">): boolean {
  if ((event.key !== "a" && event.key !== "A") || (!event.ctrlKey && !event.metaKey)) return false;
  let current: Element | null =
    event.target && typeof event.target === "object" && "nodeType" in event.target
      ? ((event.target as Node).nodeType === 1
          ? (event.target as Element)
          : (event.target as Node).parentElement)
      : null;
  while (current) {
    const tag = current.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") return false;
    const contentEditable = current.getAttribute("contenteditable");
    if (contentEditable === "false") return true;
    if ((current as HTMLElement).isContentEditable || (contentEditable !== null && contentEditable !== "false")) return false;
    current = current.parentElement;
  }
  return true;
}

/** Clear a document selection after suppressing host/iframe select-all. */
export function clearDocumentSelection(doc: Document | null | undefined): void {
  doc?.getSelection?.()?.removeAllRanges();
}
