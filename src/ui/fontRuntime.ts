/** Small, platform-neutral controller for the one active imported font URL. */
export interface FontUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export function createLazyFontController(
  readFont: (id: string) => Promise<Uint8Array>,
  api: FontUrlApi = URL,
) {
  let generation = 0;
  let active: { id: string; url: string } | null = null;
  return {
    async select(id: string | undefined): Promise<string | null> {
      const currentGeneration = ++generation;
      if (!id) {
        if (active) api.revokeObjectURL(active.url);
        active = null;
        return null;
      }
      if (active?.id === id) return active.url;
      const bytes = await readFont(id);
      if (currentGeneration !== generation) return null;
      const url = api.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer]));
      const previous = active;
      active = { id, url };
      if (previous) api.revokeObjectURL(previous.url);
      return url;
    },
    dispose(): void {
      generation++;
      if (active) api.revokeObjectURL(active.url);
      active = null;
    },
  };
}
