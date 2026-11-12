import type { Settings, Tag, Task } from "./types.ts";
import { defaultSettings } from "./types.ts";

/** ローカル API が data.json を書き換えたあと、画面の状態へ戻す。 */
export function mergeExternalData(
  raw: { tasks?: Task[]; tags?: Tag[]; settings?: Partial<Settings> } | null,
): { tasks: Task[]; tags: Tag[]; settings: Settings } | null {
  if (!raw) return null;
  return {
    tasks: raw.tasks ?? [],
    tags: raw.tags ?? [],
    settings: { ...defaultSettings, ...(raw.settings ?? {}) },
  };
}
