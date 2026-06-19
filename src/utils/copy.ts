import { Language, Tag, Task } from "../types";
import { todayIso, isSameDay } from "./project";
import { t as tr } from "../i18n";
import { buildDfsOrder, getDepth } from "./taskTree";

function bodyOf(t: Task): string {
  if (t.projectName) {
    const prefix = `:${t.projectName} `;
    if (t.title.startsWith(prefix)) return t.title.slice(prefix.length);
  }
  return t.title;
}

function tagsSuffix(t: Task, tagsById: Map<string, Tag>): string {
  if (t.tags.length === 0) return "";
  const parts: string[] = [];
  for (const id of t.tags) {
    const tag = tagsById.get(id);
    if (!tag) continue;
    const label = tag.name;
    parts.push(`#${label}`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

export function formatTaskLine(
  t: Task,
  tagsById: Map<string, Tag>,
  includeUrl: boolean,
): string {
  const body = bodyOf(t);
  let line = `${body}${tagsSuffix(t, tagsById)}`;
  if (includeUrl && t.url) line += `  ${t.url}`;
  return line;
}

export function buildTodayCompletedMarkdown(
  tasks: Task[],
  tags: Tag[],
  includeUrl: boolean,
  grouping: boolean,
  lang: Language = "ja",
): string {
  const today = todayIso();
  const done = tasks.filter(
    (t) => t.status === "done" && t.completedAt && isSameDay(t.completedAt, today),
  );
  const tagsById = new Map(tags.map((t) => [t.id, t]));
  const header = `## ${today} ${tr(lang, "todayCompletedHeading")}\n\n`;

  if (!grouping) {
    if (done.length === 0) return header;
    const lines = done.map((t) => `- ${formatTaskLine(t, tagsById, includeUrl)}`);
    return header + lines.join("\n") + "\n";
  }
  return buildGroupedMarkdown(done, tagsById, includeUrl, lang, header, "-");
}

function buildGroupedMarkdownWithDepth(
  tasks: Task[],
  tagsById: Map<string, Tag>,
  includeUrl: boolean,
  lang: Language,
  header: string,
  prefix: string,
  allTasks: Task[],
): string {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.projectName ?? "__none__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  const ordered: string[] = [];
  const keys = Array.from(groups.keys()).filter((k) => k !== "__none__").sort();
  for (const k of keys) {
    ordered.push(`### ${k}`);
    for (const t of groups.get(k)!) {
      const indent = "  ".repeat(getDepth(t, allTasks));
      ordered.push(`${indent}${prefix} ${formatTaskLine(t, tagsById, includeUrl)}`);
    }
    ordered.push("");
  }
  if (groups.has("__none__")) {
    ordered.push(`### ${tr(lang, "uncategorized")}`);
    for (const t of groups.get("__none__")!) {
      const indent = "  ".repeat(getDepth(t, allTasks));
      ordered.push(`${indent}${prefix} ${formatTaskLine(t, tagsById, includeUrl)}`);
    }
    ordered.push("");
  }
  return header + ordered.join("\n").trimEnd() + "\n";
}

function buildGroupedMarkdown(
  done: Task[],
  tagsById: Map<string, Tag>,
  includeUrl: boolean,
  lang: Language,
  header: string,
  prefix: string,
): string {
  const groups = new Map<string, Task[]>();
  for (const t of done) {
    const key = t.projectName ?? "__none__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  const ordered: string[] = [];
  const keys = Array.from(groups.keys()).filter((k) => k !== "__none__").sort();
  for (const k of keys) {
    ordered.push(`### ${k}`);
    for (const t of groups.get(k)!) ordered.push(`${prefix} ${formatTaskLine(t, tagsById, includeUrl)}`);
    ordered.push("");
  }
  if (groups.has("__none__")) {
    ordered.push(`### ${tr(lang, "uncategorized")}`);
    for (const t of groups.get("__none__")!) ordered.push(`${prefix} ${formatTaskLine(t, tagsById, includeUrl)}`);
    ordered.push("");
  }
  return header + ordered.join("\n").trimEnd() + "\n";
}

export function buildAllCompletedMarkdown(
  tasks: Task[],
  tags: Tag[],
  includeUrl: boolean,
  grouping: boolean,
  lang: Language = "ja",
): string {
  const done = tasks.filter((t) => t.status === "done");
  const tagsById = new Map(tags.map((t) => [t.id, t]));
  const header = `## ${tr(lang, "allCompletedHeading")}\n\n`;
  if (!grouping) {
    if (done.length === 0) return header;
    return header + done.map((t) => `- ${formatTaskLine(t, tagsById, includeUrl)}`).join("\n") + "\n";
  }
  return buildGroupedMarkdown(done, tagsById, includeUrl, lang, header, "-");
}

export function buildTodoMarkdown(
  tasks: Task[],
  tags: Tag[],
  includeUrl: boolean,
  grouping: boolean,
  lang: Language = "ja",
): string {
  const todo = buildDfsOrder(tasks.filter((t) => t.status === "todo"));
  const tagsById = new Map(tags.map((t) => [t.id, t]));
  const header = `## ${tr(lang, "todoHeading")}\n\n`;
  if (!grouping) {
    if (todo.length === 0) return header;
    const lines = todo.map((t) => {
      const indent = "  ".repeat(getDepth(t, tasks));
      return `${indent}- [ ] ${formatTaskLine(t, tagsById, includeUrl)}`;
    });
    return header + lines.join("\n") + "\n";
  }
  return buildGroupedMarkdownWithDepth(todo, tagsById, includeUrl, lang, header, "- [ ]", tasks);
}

export function countTodayCompleted(tasks: Task[]): number {
  const today = todayIso();
  return tasks.filter(
    (t) =>
      t.status === "done" && t.completedAt && isSameDay(t.completedAt, today),
  ).length;
}

export function countAllCompleted(tasks: Task[]): number {
  return tasks.filter((t) => t.status === "done").length;
}

export function countTodo(tasks: Task[]): number {
  return tasks.filter((t) => t.status === "todo").length;
}
