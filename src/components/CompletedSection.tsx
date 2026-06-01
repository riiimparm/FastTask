import { useMemo, useState } from "react";
import { useStore } from "../store";
import { TaskItem } from "./TaskItem";
import { t } from "../i18n";

export function CompletedSection() {
  const tasks = useStore((s) => s.tasks);
  const lang = useStore((s) => s.settings.language);
  const [open, setOpen] = useState(false);

  const done = useMemo(
    () =>
      tasks
        .filter((t) => t.status === "done")
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    [tasks],
  );

  if (done.length === 0) return null;

  return (
    <div className="mt-3 border-t border-black/5 pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="section-header w-full text-left flex items-center gap-1 px-2 py-1"
      >
        <span className={`transition-transform ${open ? "" : "-rotate-90"}`}>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 9 18 9 12 18"/></svg>
        </span>
        {t(lang, "completed")} ({done.length})
      </button>
      {open && (
        <div className="space-y-0.5">
          {done.map((task) => (
            <TaskItem key={task.id} task={task} draggable={false} />
          ))}
        </div>
      )}
    </div>
  );
}
