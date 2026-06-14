import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DayPicker } from "react-day-picker";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore } from "../store";
import { useUiContext } from "../context/UiContext";
import { Tag, Task } from "../types";
import { Popover } from "./Popover";
import { projectColor, todayIso } from "../utils/project";
import { formatTaskLine } from "../utils/copy";
import { t } from "../i18n";

interface Props {
  task: Task;
  draggable?: boolean;
}

export function TaskItem({ task, draggable = true }: Props) {
  const tags = useStore((s) => s.tags);
  const settings = useStore((s) => s.settings);
  const updateTask = useStore((s) => s.updateTask);
  const toggleTask = useStore((s) => s.toggleTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const setToast = useStore((s) => s.setToast);
  const lang = settings.language;
  const grouping = settings.groupingEnabled;

  const { selectedTaskId, focusedTaskId, isReorderMode, bulkSelected, setSelectedTaskId } = useUiContext();
  const isSelected = selectedTaskId === task.id;
  const isFocused = focusedTaskId === task.id;
  const isBulkSelected = bulkSelected.has(task.id);

  const sortable = useSortable({ id: task.id, disabled: !draggable });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  };
  if (task.projectName) {
    (style as Record<string, string>)["--project-color"] = projectColor(task.projectName);
  }

  const [completing, setCompleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.title);
  const editRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editing) {
      editRef.current?.focus();
      editRef.current?.select();
    }
  }, [editing]);

  const [showTags, setShowTags] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [urlInput, setUrlInput] = useState(task.url ?? "");
  const [copied, setCopied] = useState(false);
  const [copyFlash, setCopyFlash] = useState(0);

  const tagsBtn = useRef<HTMLButtonElement | null>(null);
  const urlBtn = useRef<HTMLButtonElement | null>(null);
  const dateBtn = useRef<HTMLButtonElement | null>(null);

  const tagsById = new Map<string, Tag>(tags.map((t) => [t.id, t]));

  const body = task.projectName && task.title.startsWith(`:${task.projectName} `)
    ? task.title.slice(task.projectName.length + 2)
    : task.title;

  const PARTICLES = [
    { tx: 0,   ty: -24, color: "#34C759" },
    { tx: 17,  ty: -17, color: "#007AFF" },
    { tx: 24,  ty:   0, color: "#FF9500" },
    { tx: 17,  ty:  17, color: "#FF3B30" },
    { tx: 0,   ty:  24, color: "#AF52DE" },
    { tx: -17, ty:  17, color: "#FFCC00" },
    { tx: -24, ty:   0, color: "#FF2D55" },
    { tx: -17, ty: -17, color: "#34C759" },
  ];

  function handleToggle() {
    if (task.status === "todo") {
      setCompleting(true);
      setTimeout(() => setCompleting(false), 700);
    }
    toggleTask(task.id);
  }

  function commitEdit() {
    if (editValue.trim()) updateTask(task.id, { title: editValue.trim() });
    setEditing(false);
  }

  function toggleTag(id: string) {
    const has = task.tags.includes(id);
    updateTask(task.id, {
      tags: has ? task.tags.filter((x) => x !== id) : [...task.tags, id],
    });
  }

  function saveUrl() {
    const v = urlInput.trim();
    updateTask(task.id, { url: v || undefined });
    setShowUrl(false);
  }

  async function openTaskUrl() {
    if (!task.url) return;
    try {
      await openUrl(task.url);
    } catch (e) {
      setToast(`${t(lang, "openUrlFailed")}: ${e}`);
    }
  }

  async function copyOne() {
    const md = formatTaskLine(task, tagsById, settings.copyIncludeUrl);
    try {
      await writeText(md);
      setCopied(true);
      setCopyFlash((f) => f + 1);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setToast(`${t(lang, "copyFailed")}: ${e}`);
    }
  }

  const due = task.dueDate;
  const dueDate = due ? new Date(due + "T00:00:00") : undefined;
  const today = todayIso();
  const dueClass = !due
    ? ""
    : due < today
    ? "text-danger"
    : due === today
    ? "text-warn"
    : "text-subink";

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      data-project={task.projectName || undefined}
      onClick={() => setSelectedTaskId(task.id)}
      className={`group task-item ${task.projectName ? "" : "task-item-plain"} px-2 py-1.5 flex items-center gap-2 transition-all rounded-md
        border-l-[3px]
        ${isSelected && !isReorderMode ? "border-accent bg-accent/10" : ""}
        ${isBulkSelected ? "border-accent bg-accent/15" : ""}
        ${isFocused && !isSelected ? "border-accent" : ""}
        ${isReorderMode && isSelected ? "border-warn bg-warn/10" : ""}
        ${!isSelected && !isBulkSelected && !isFocused ? "border-transparent" : ""}
      `}
    >
      {draggable && (
        <button
          {...sortable.attributes}
          {...sortable.listeners}
          className="opacity-30 group-hover:opacity-70 cursor-grab text-subink"
          title={t(lang, "titleDrag")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
            <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
            <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
          </svg>
        </button>
      )}

      <div className="relative flex-shrink-0">
        <button
          onClick={handleToggle}
          className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all ${completing ? "check-pop" : ""} ${
            task.status === "done"
              ? "bg-ok border-ok text-white"
              : "border-black/25 hover:border-accent"
          }`}
        >
          {task.status === "done" && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </button>
        {completing && PARTICLES.map((p, i) => (
          <span
            key={i}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 5,
              height: 5,
              top: "50%",
              left: "50%",
              marginTop: -2.5,
              marginLeft: -2.5,
              background: p.color,
              animation: "particle-burst 0.55s ease-out forwards",
              animationDelay: `${i * 15}ms`,
              "--tx": `${p.tx}px`,
              "--ty": `${p.ty}px`,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={editRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") {
                setEditValue(task.title);
                setEditing(false);
              }
            }}
            className="w-full px-1 py-0.5 rounded border border-accent/40 outline-none text-[14px]"
          />
        ) : (
          <div
            onClick={() => {
              setEditValue(task.title);
              setEditing(true);
            }}
            className={`truncate cursor-text text-[14px] flex items-center gap-1 ${task.status === "done" ? "line-through text-subink" : ""}`}
          >
            {task.isMinimum && (
              <span className="text-warn text-[10px] shrink-0" title={lang === "ja" ? "今日の最低限" : "Min. task"}>★</span>
            )}
            {task.projectName && !grouping && (
              <span className="opacity-40">:{task.projectName} </span>
            )}
            {body || <span className="text-subink italic">{t(lang, "untitled")}</span>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {task.tags.map((id) => {
          const tag = tagsById.get(id);
          if (!tag) return null;
          return (
            <span
              key={id}
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                background: `color-mix(in srgb, ${tag.color} 12%, transparent)`,
                color: tag.color,
              }}
            >
              {tag.name}
            </span>
          );
        })}

        {task.url && (
          <button
            onClick={openTaskUrl}
            className="text-subink hover:text-accent"
            title={task.url}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </button>
        )}

        {due && (
          <span className={`text-[11px] ${dueClass}`}>
            {dueDate!.getMonth() + 1}/{dueDate!.getDate()}
          </span>
        )}

        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
          <div className="relative">
            <button
              ref={tagsBtn}
              onClick={() => setShowTags((v) => !v)}
              className="w-6 h-6 rounded hover:bg-black/5 flex items-center justify-center text-subink"
              title={t(lang, "titleTags")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                <line x1="7" y1="7" x2="7.01" y2="7"/>
              </svg>
            </button>
            <Popover open={showTags} onClose={() => setShowTags(false)} anchorRef={tagsBtn}>
              <div className="min-w-[160px] max-h-[200px] overflow-y-auto scrollbar-thin">
                {tags.length === 0 && (
                  <div className="text-[12px] text-subink p-2">{t(lang, "noTags")}</div>
                )}
                {tags.map((tag) => {
                  const active = task.tags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-black/5 text-[12px]"
                    >
                      <span
                        className="w-3 h-3 rounded"
                        style={{ background: tag.color }}
                      />
                      <span className="flex-1 text-left">{tag.name}</span>
                      {active && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </Popover>
          </div>

          <div className="relative">
            <button
              ref={urlBtn}
              onClick={() => {
                setUrlInput(task.url ?? "");
                setShowUrl((v) => !v);
              }}
              className="w-6 h-6 rounded hover:bg-black/5 flex items-center justify-center text-subink"
              title={t(lang, "titleUrl")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </button>
            <Popover open={showUrl} onClose={() => setShowUrl(false)} anchorRef={urlBtn}>
              <div className="p-1 w-[240px]">
                <input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    if (e.key === "Enter") saveUrl();
                  }}
                  placeholder={t(lang, "urlPh")}
                  className="w-full px-2 py-1 rounded border border-black/10 outline-none focus:border-accent text-[12px]"
                  autoFocus
                />
                <div className="flex justify-end gap-1 mt-1">
                  <button
                    onClick={() => setShowUrl(false)}
                    className="px-2 py-0.5 text-[11px] rounded text-subink hover:bg-black/5"
                  >
                    {t(lang, "cancel")}
                  </button>
                  <button
                    onClick={saveUrl}
                    className="px-2 py-0.5 text-[11px] rounded bg-accent text-white hover:opacity-90"
                  >
                    {t(lang, "save")}
                  </button>
                </div>
              </div>
            </Popover>
          </div>

          <div className="relative">
            <button
              ref={dateBtn}
              onClick={() => setShowDate((v) => !v)}
              className="w-6 h-6 rounded hover:bg-black/5 flex items-center justify-center text-subink"
              title={t(lang, "titleDue")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </button>
            <Popover open={showDate} onClose={() => setShowDate(false)} anchorRef={dateBtn}>
              <DayPicker
                mode="single"
                selected={dueDate}
                onSelect={(d) => {
                  const iso = d
                    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
                    : undefined;
                  updateTask(task.id, { dueDate: iso });
                  setShowDate(false);
                }}
              />
              {task.dueDate && (
                <button
                  onClick={() => {
                    updateTask(task.id, { dueDate: undefined });
                    setShowDate(false);
                  }}
                  className="w-full text-[12px] py-1 text-subink hover:bg-black/5 rounded"
                >
                  {t(lang, "clear")}
                </button>
              )}
            </Popover>
          </div>

          <button
            key={copyFlash}
            onClick={copyOne}
            className={`w-6 h-6 rounded hover:bg-black/5 flex items-center justify-center transition-colors ${copied ? "text-ok copy-flash" : "text-subink"}`}
            title={t(lang, "titleCopy")}
          >
            {copied ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            )}
          </button>

          <button
            onClick={() => deleteTask(task.id)}
            className="w-6 h-6 rounded hover:bg-danger/10 flex items-center justify-center text-subink hover:text-danger"
            title={t(lang, "titleDelete")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
