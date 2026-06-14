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
}

export interface Tag {
  id: string;
  name: string;
  alias?: string;
  color: string;
  keywords: string[];
}

export type Theme = "light" | "dark" | "system";
export type Language = "ja" | "en";

export interface Settings {
  copyIncludeUrl: boolean;
  autoDeleteOldCompleted: boolean;
  groupingEnabled: boolean;
  copyGroupingEnabled: boolean;
  showDueDate: boolean;
  focusShortcut: string;
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
  copyIncludeUrl: false,
  autoDeleteOldCompleted: true,
  groupingEnabled: true,
  copyGroupingEnabled: true,
  showDueDate: false,
  focusShortcut: "",
  theme: "system",
  language: "ja",
};

export const emptyAppData = (): AppData => ({
  tasks: [],
  tags: [],
  settings: { ...defaultSettings },
  version: SCHEMA_VERSION,
});
