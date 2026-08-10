export type TaskStatus = "todo" | "done";

export interface Task {
  id: string;
  title: string;
  projectName?: string;
  status: TaskStatus;
  tags: string[];
  url?: string;
  dueDate?: string;
  createdAt: string;
  completedAt?: string;
  order: number;
  isMinimum?: boolean;
  isPending?: boolean;
  parentId?: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  keywords: string[];
}

export type Theme = "light" | "dark" | "system";
export type Language = "ja" | "en";

export interface Settings {
  autoDeleteOldCompleted: boolean;
  groupingEnabled: boolean;
  copyGroupingEnabled: boolean;
  showDueDate: boolean;
  tagsEnabled: boolean;
  calendarEnabled: boolean;
  urlEnabled: boolean;
  focusShortcut: string;
  lastFocusMinutes: number;
  theme: Theme;
  language: Language;
}

export interface AppData {
  tasks: Task[];
  tags: Tag[];
  settings: Settings;
  version: string;
}

export const SCHEMA_VERSION = "1";

export const defaultSettings: Settings = {
  autoDeleteOldCompleted: true,
  groupingEnabled: true,
  copyGroupingEnabled: true,
  showDueDate: false,
  tagsEnabled: false,
  calendarEnabled: false,
  urlEnabled: true,
  focusShortcut: "",
  lastFocusMinutes: 25,
  theme: "system",
  language: "ja",
};

export const emptyAppData = (): AppData => ({
  tasks: [],
  tags: [],
  settings: { ...defaultSettings },
  version: SCHEMA_VERSION,
});
