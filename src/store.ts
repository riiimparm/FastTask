import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { v4 as uuid } from "uuid";
import {
  AppData,
  Settings,
  Tag,
  Task,
  Theme,
  defaultSettings,
  emptyAppData,
} from "./types";
import { parseProjectFromInput } from "./utils/project";

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  root.classList.toggle("dark", dark);
}

let systemMql: MediaQueryList | null = null;
let systemListener: ((e: MediaQueryListEvent) => void) | null = null;

export function bindSystemTheme(getTheme: () => Theme) {
  if (typeof window === "undefined") return;
  if (systemMql && systemListener) {
    systemMql.removeEventListener("change", systemListener);
  }
  systemMql = window.matchMedia("(prefers-color-scheme: dark)");
  systemListener = () => {
    if (getTheme() === "system") applyTheme("system");
  };
  systemMql.addEventListener("change", systemListener);
}

interface State {
  tasks: Task[];
  tags: Tag[];
  settings: Settings;
  loaded: boolean;
  toast?: string;
  init: () => Promise<void>;
  addTask: (rawInput: string, dueDate?: string) => void;
  toggleTask: (id: string) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  reorderTasks: (idsInNewOrder: string[]) => void;
  reorderProjectSections: (projectsInOrder: (string | null)[]) => void;
  upsertTag: (tag: Tag) => void;
  deleteTag: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setToast: (msg?: string) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(get: () => State) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const s = get();
    const data: AppData = {
      tasks: s.tasks,
      tags: s.tags,
      settings: s.settings,
      version: "1",
    };
    invoke("save_data", { data }).catch((e) => {
      console.error("save_data failed", e);
    });
  }, 150);
}

function autoTagsFor(body: string, tags: Tag[]): string[] {
  const lower = body.toLowerCase();
  const matched: string[] = [];
  for (const t of tags) {
    for (const kw of t.keywords) {
      if (!kw) continue;
      if (lower.includes(kw.toLowerCase())) {
        matched.push(t.id);
        break;
      }
    }
  }
  return matched;
}

function nextOrder(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  return Math.max(...tasks.map((t) => t.order)) + 1;
}

export const useStore = create<State>((set, get) => ({
  tasks: [],
  tags: [],
  settings: { ...defaultSettings },
  loaded: false,
  toast: undefined,

  async init() {
    try {
      const raw = await invoke<AppData | null>("load_data");
      const data: AppData = raw ?? emptyAppData();
      const settings = { ...defaultSettings, ...(data.settings || {}) };
      let tasks = data.tasks ?? [];
      const tags = data.tags ?? [];

      if (settings.autoDeleteOldCompleted) {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        tasks = tasks.filter(
          (t) =>
            !(
              t.status === "done" &&
              t.completedAt &&
              new Date(t.completedAt) < oneYearAgo
            ),
        );
      }

      set({ tasks, tags, settings, loaded: true });
      applyTheme(settings.theme);
      bindSystemTheme(() => get().settings.theme);
      document.documentElement.lang = settings.language;
      scheduleSave(get);
    } catch (e) {
      console.error("load_data failed", e);
      set({ loaded: true, toast: `Failed to load: ${e}` });
    }
  },

  addTask(rawInput, dueDate) {
    const trimmed = rawInput.trim();
    if (!trimmed) return;
    const { projectName, body } = parseProjectFromInput(trimmed);
    const title = projectName ? `:${projectName} ${body}` : body;
    const titleForTagMatch = body || title;
    const now = new Date().toISOString();
    const todoTasks = get().tasks.filter((t) => t.status === "todo");
    const task: Task = {
      id: uuid(),
      title,
      projectName,
      status: "todo",
      tags: autoTagsFor(titleForTagMatch, get().tags),
      url: undefined,
      dueDate,
      createdAt: now,
      order: nextOrder(todoTasks),
    };
    set({ tasks: [...get().tasks, task] });
    scheduleSave(get);
  },

  toggleTask(id) {
    const now = new Date().toISOString();
    set({
      tasks: get().tasks.map((t) =>
        t.id === id
          ? t.status === "todo"
            ? { ...t, status: "done", completedAt: now }
            : { ...t, status: "todo", completedAt: undefined }
          : t,
      ),
    });
    scheduleSave(get);
  },

  updateTask(id, patch) {
    set({
      tasks: get().tasks.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...patch };
        if (patch.title !== undefined) {
          const { projectName, body } = parseProjectFromInput(patch.title);
          next.title = projectName ? `:${projectName} ${body}` : body;
          next.projectName = projectName;
        }
        return next;
      }),
    });
    scheduleSave(get);
  },

  deleteTask(id) {
    set({ tasks: get().tasks.filter((t) => t.id !== id) });
    scheduleSave(get);
  },

  reorderTasks(idsInNewOrder) {
    const byId = new Map(get().tasks.map((t) => [t.id, t]));
    const others = get().tasks.filter((t) => !idsInNewOrder.includes(t.id));
    const reordered = idsInNewOrder
      .map((id, idx) => {
        const t = byId.get(id);
        if (!t) return null;
        return { ...t, order: idx };
      })
      .filter((x): x is Task => !!x);
    set({ tasks: [...others, ...reordered] });
    scheduleSave(get);
  },

  reorderProjectSections(projectsInOrder) {
    const todoTasks = get().tasks.filter((t) => t.status === "todo");
    const others = get().tasks.filter((t) => t.status !== "todo");
    const sections = new Map<string, Task[]>();
    for (const t of todoTasks) {
      const key = t.projectName ?? "__none__";
      if (!sections.has(key)) sections.set(key, []);
      sections.get(key)!.push(t);
    }
    let order = 0;
    const flat: Task[] = [];
    for (const p of projectsInOrder) {
      const key = p ?? "__none__";
      const arr = sections.get(key);
      if (!arr) continue;
      for (const t of arr.sort((a, b) => a.order - b.order)) {
        flat.push({ ...t, order: order++ });
      }
      sections.delete(key);
    }
    for (const [, arr] of sections) {
      for (const t of arr.sort((a, b) => a.order - b.order)) {
        flat.push({ ...t, order: order++ });
      }
    }
    set({ tasks: [...others, ...flat] });
    scheduleSave(get);
  },

  upsertTag(tag) {
    const exists = get().tags.some((t) => t.id === tag.id);
    set({
      tags: exists
        ? get().tags.map((t) => (t.id === tag.id ? tag : t))
        : [...get().tags, tag],
    });
    scheduleSave(get);
  },

  deleteTag(id) {
    set({
      tags: get().tags.filter((t) => t.id !== id),
      tasks: get().tasks.map((t) => ({
        ...t,
        tags: t.tags.filter((x) => x !== id),
      })),
    });
    scheduleSave(get);
  },

  updateSettings(patch) {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    if (patch.theme !== undefined) applyTheme(next.theme);
    if (patch.language !== undefined) document.documentElement.lang = next.language;
    scheduleSave(get);
  },

  setToast(msg) {
    set({ toast: msg });
  },
}));
