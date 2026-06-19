import { Task } from "../types";

export function getDepth(task: Task, tasks: Task[]): number {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let depth = 0;
  let current: Task = task;
  while (current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    depth++;
    current = parent;
  }
  return depth;
}

export function getDescendants(taskId: string, tasks: Task[]): Task[] {
  const result: Task[] = [];
  const queue = [taskId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const children = tasks.filter((t) => t.parentId === id);
    for (const child of children) {
      result.push(child);
      queue.push(child.id);
    }
  }
  return result;
}

export function hasUndoneDescendants(taskId: string, tasks: Task[]): boolean {
  return getDescendants(taskId, tasks).some((t) => t.status === "todo");
}

/** DFS順でフラット展開。orderフィールドで不変条件が成立している前提 */
export function buildDfsOrder(tasks: Task[]): Task[] {
  const taskIds = new Set(tasks.map((t) => t.id));
  const normalized = tasks.map((t) => ({
    ...t,
    parentId: t.parentId && taskIds.has(t.parentId) ? t.parentId : undefined,
  }));

  const byParent = new Map<string | undefined, Task[]>();
  for (const t of normalized) {
    const key = t.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(t);
  }
  for (const group of byParent.values()) {
    group.sort((a, b) => a.order - b.order);
  }

  const result: Task[] = [];
  function dfs(parentId: string | undefined) {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      result.push(child);
      dfs(child.id);
    }
  }
  dfs(undefined);
  return result;
}
