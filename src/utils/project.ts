export function parseProjectFromInput(input: string): {
  projectName?: string;
  body: string;
} {
  if (!input.startsWith(":")) return { body: input };
  const rest = input.slice(1);
  const spaceIdx = rest.search(/\s/);
  if (spaceIdx === -1) {
    return { projectName: rest || undefined, body: "" };
  }
  const projectName = rest.slice(0, spaceIdx);
  const body = rest.slice(spaceIdx + 1);
  return { projectName: projectName || undefined, body };
}

export function projectColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  const hue = h % 360;
  return `hsl(${hue} 55% 72%)`;
}

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isSameDay(iso: string, dayIso: string): boolean {
  return iso.slice(0, 10) === dayIso;
}

/** 期限が今日のtodoタスクは、isMinimumフラグに関わらず強制的にMust扱いにする */
export function isMustTask(task: { status: string; isMinimum?: boolean; dueDate?: string }): boolean {
  return !!task.isMinimum || (task.status === "todo" && task.dueDate === todayIso());
}
