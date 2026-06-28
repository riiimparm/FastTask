import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStore } from "../store";
import { useUiContext } from "../context/UiContext";
import { Tag, Task } from "../types";
import { TaskItem } from "./TaskItem";
import { t } from "../i18n";
import { buildDfsOrder, getDescendants } from "../utils/taskTree";

const NONE_KEY = "__none__";

interface SectionProps {
  projectKey: string;
  projectName?: string;
  tasks: Task[];
  collapsed: boolean;
  onToggle: () => void;
}

function ProjectSection({ projectKey, projectName, tasks, collapsed, onToggle }: SectionProps) {
  const sortable = useSortable({ id: `section:${projectKey}` });
  const reorderTasks = useStore((s) => s.reorderTasks);
  const lang = useStore((s) => s.settings.language);

  const innerSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onInnerDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = tasks.map((t) => t.id);
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const newOrderInSection = arrayMove(ids, oldIdx, newIdx);
    const allTodos = useStore.getState().tasks.filter((t) => t.status === "todo");
    const otherIds = allTodos
      .filter((t) => !ids.includes(t.id))
      .sort((a, b) => a.order - b.order)
      .map((t) => t.id);
    reorderTasks([...otherIds, ...newOrderInSection]);
  }

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <div ref={sortable.setNodeRef} style={style} className="mb-2">
      <div className="flex items-center gap-1 px-2 py-1">
        <button
          {...sortable.attributes}
          {...sortable.listeners}
          className="cursor-grab opacity-40 hover:opacity-80 text-subink"
          title={t(lang, "titleSectionDrag")}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
          </svg>
        </button>
        <button
          onClick={onToggle}
          className="section-header flex-1 text-left flex items-center gap-1"
          style={{}}
        >
          <span className={`transition-transform ${collapsed ? "-rotate-90" : ""}`}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 9 18 9 12 18"/></svg>
          </span>
          {projectName ?? t(lang, "uncategorized")}
          <span className="opacity-60 ml-1">({tasks.length})</span>
        </button>
      </div>
      {!collapsed && (
        <DndContext sensors={innerSensors} collisionDetection={closestCenter} onDragEnd={onInnerDragEnd}>
          <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5">
              {tasks.map((t) => (
                <TaskItem key={t.id} task={t} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

interface TaskListProps {
  tagFilter?: Set<string>;
  searchKeywords?: string[];
}

function matchesKeywords(
  task: { title: string; projectName?: string; tags: string[] },
  keywords: string[],
  tags: Tag[],
  tagsEnabled: boolean,
): boolean {
  if (keywords.length === 0) return true;
  const body =
    task.projectName && task.title.startsWith(`:${task.projectName} `)
      ? task.title.slice(task.projectName.length + 2)
      : task.title;
  const text = body.toLowerCase();
  const tagText = tagsEnabled
    ? task.tags.map((id) => tags.find((t) => t.id === id)?.name ?? "").join(" ").toLowerCase()
    : "";
  return keywords.every((kw) => text.includes(kw) || tagText.includes(kw));
}

export function TaskList({ tagFilter, searchKeywords = [] }: TaskListProps) {
  const tasks = useStore((s) => s.tasks);
  const tags = useStore((s) => s.tags);
  const tagsEnabled = useStore((s) => s.settings.tagsEnabled ?? false);
  const grouping = useStore((s) => s.settings.groupingEnabled);
  const lang = useStore((s) => s.settings.language);
  const reorderTasks = useStore((s) => s.reorderTasks);
  const reorderProjectSections = useStore((s) => s.reorderProjectSections);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const { focusedTaskId } = useUiContext();

  const todoTasks = useMemo(
    () => buildDfsOrder(tasks.filter((t) => t.status === "todo")),
    [tasks],
  );

  // フォーカスモード・タグフィルター・検索フィルターを適用
  const displayTasks = useMemo(() => {
    let base = todoTasks;
    if (focusedTaskId) {
      const descendantIds = new Set(getDescendants(focusedTaskId, tasks).map((t) => t.id));
      base = base.filter((t) => t.id === focusedTaskId || descendantIds.has(t.id));
    }
    if (tagFilter && tagFilter.size > 0) {
      base = base.filter((t) => t.tags.some((id) => tagFilter.has(id)));
    }
    if (searchKeywords.length > 0) {
      base = base.filter((t) => matchesKeywords(t, searchKeywords, tags, tagsEnabled));
    }
    return base;
  }, [todoTasks, focusedTaskId, tasks, tagFilter, searchKeywords, tags, tagsEnabled]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (!grouping) {
    function onDragEnd(e: DragEndEvent) {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const ids = todoTasks.map((t) => t.id);
      const oldIdx = ids.indexOf(String(active.id));
      const newIdx = ids.indexOf(String(over.id));
      if (oldIdx === -1 || newIdx === -1) return;
      reorderTasks(arrayMove(ids, oldIdx, newIdx));
    }
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={todoTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-0.5">
            {displayTasks.length === 0 && (
              <div className="text-center text-subink text-[12px] py-8">{t(lang, "noTasks")}</div>
            )}
            {displayTasks.map((t) => (
              <TaskItem key={t.id} task={t} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  // grouping ON
  const sectionsMap = new Map<string, Task[]>();
  const sectionOrder: string[] = [];
  for (const t of displayTasks) {
    const key = t.projectName ?? NONE_KEY;
    if (!sectionsMap.has(key)) {
      sectionsMap.set(key, []);
      sectionOrder.push(key);
    }
    sectionsMap.get(key)!.push(t);
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const a = String(active.id);
    const o = String(over.id);
    if (!a.startsWith("section:") || !o.startsWith("section:")) return;
    const oldIdx = sectionOrder.indexOf(a.slice(8));
    const newIdx = sectionOrder.indexOf(o.slice(8));
    if (oldIdx === -1 || newIdx === -1) return;
    const newOrder = arrayMove(sectionOrder, oldIdx, newIdx).map((k) =>
      k === NONE_KEY ? null : k,
    );
    reorderProjectSections(newOrder);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={sectionOrder.map((k) => `section:${k}`)}
        strategy={verticalListSortingStrategy}
      >
        {displayTasks.length === 0 && (
          <div className="text-center text-subink text-[12px] py-8">{t(lang, "noTasks")}</div>
        )}
        {sectionOrder.map((key) => (
          <ProjectSection
            key={key}
            projectKey={key}
            projectName={key === NONE_KEY ? undefined : key}
            tasks={sectionsMap.get(key)!}
            collapsed={!!collapsed[key]}
            onToggle={() => setCollapsed({ ...collapsed, [key]: !collapsed[key] })}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
