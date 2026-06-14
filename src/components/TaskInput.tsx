import { useEffect, useMemo, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { useStore } from "../store";
import { useUiContext } from "../context/UiContext";
import { Popover } from "./Popover";
import { parseProjectFromInput } from "../utils/project";
import { t } from "../i18n";

export function TaskInput() {
  const addTask = useStore((s) => s.addTask);
  const tasks = useStore((s) => s.tasks);
  const tags = useStore((s) => s.tags);
  const lang = useStore((s) => s.settings.language);
  const [value, setValue] = useState("");
  const [due, setDue] = useState<Date | undefined>(undefined);
  const [showDate, setShowDate] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dateBtnRef = useRef<HTMLButtonElement | null>(null);

  const { mainInputRef, setSelectedTaskId } = useUiContext();

  // mainInputRefとinputRefを同期
  useEffect(() => {
    mainInputRef.current = inputRef.current;
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const projectMatch = useMemo(() => {
    if (!value.startsWith(":")) return null;
    const rest = value.slice(1);
    const space = rest.search(/\s/);
    if (space !== -1) return null;
    return rest;
  }, [value]);

  const projectCandidates = useMemo(() => {
    const set = new Set<string>();
    for (const tk of tasks) {
      if (tk.projectName) set.add(tk.projectName);
    }
    const all = Array.from(set);
    if (projectMatch === null) return [];
    const q = projectMatch.toLowerCase();
    return all
      .filter((p) => p.toLowerCase().startsWith(q))
      .slice(0, 6);
  }, [tasks, projectMatch]);

  // タグヒント: 入力中のbody部分にマッチするタグを表示
  const { body: inputBody } = useMemo(() => parseProjectFromInput(value), [value]);
  const matchedTags = useMemo(() => {
    if (!inputBody.trim()) return [];
    const lower = inputBody.toLowerCase();
    return tags.filter((tag) =>
      tag.keywords.some((kw) => kw && lower.includes(kw.toLowerCase())),
    );
  }, [inputBody, tags]);

  useEffect(() => {
    setHighlight(0);
  }, [projectMatch]);

  function applyCandidate(name: string) {
    setValue(`:${name} `);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function submit() {
    if (!value.trim()) return;
    const iso = due
      ? `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`
      : undefined;
    addTask(value, iso);
    setValue("");
    setDue(undefined);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    if (projectCandidates.length > 0) {
      if (e.key === "Tab") {
        e.preventDefault();
        applyCandidate(projectCandidates[highlight] ?? projectCandidates[0]);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % projectCandidates.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + projectCandidates.length) % projectCandidates.length);
        return;
      }
    }
    // ↓キーでリストへ移動（補完候補がない場合）
    if (e.key === "ArrowDown" && projectCandidates.length === 0) {
      e.preventDefault();
      inputRef.current?.blur();
      const todoTasks = tasks.filter((t) => t.status === "todo").sort((a, b) => a.order - b.order);
      if (todoTasks.length > 0) {
        setSelectedTaskId(todoTasks[0].id);
      }
      return;
    }
  }

  const { projectName: parsedProject } = parseProjectFromInput(value);
  const detectedUrl = useMemo(() => {
    const m = value.match(/https?:\/\/\S+/);
    return m ? m[0] : null;
  }, [value]);

  return (
    <div className="px-4 py-3 border-b border-black/5">
      <div className="relative flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            data-main-input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t(lang, "placeholder")}
            className="w-full px-3 py-2 rounded-[10px] border border-black/10 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
          />
          {projectCandidates.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 glass rounded-card shadow-cardHover py-1 z-40 fade-in">
              {projectCandidates.map((p, i) => (
                <button
                  key={p}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applyCandidate(p);
                  }}
                  className={`block w-full text-left px-3 py-1.5 text-[13px] ${i === highlight ? "bg-accent/10 text-accent" : "hover:bg-black/5"}`}
                >
                  :{p}
                </button>
              ))}
              <div className="px-3 py-1 text-[11px] text-subink border-t border-black/5">
                {t(lang, "tabHint")}
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <button
            ref={dateBtnRef}
            onClick={() => setShowDate((v) => !v)}
            className={`h-9 px-2 rounded-[10px] border border-black/10 flex items-center gap-1 text-[12px] ${due ? "bg-accent/10 text-accent border-accent/30" : "text-subink hover:bg-black/5"}`}
            title={t(lang, "titleSetDue")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {due && (
              <span>
                {due.getMonth() + 1}/{due.getDate()}
              </span>
            )}
          </button>
          <Popover open={showDate} onClose={() => setShowDate(false)} anchorRef={dateBtnRef}>
            <DayPicker
              mode="single"
              selected={due}
              onSelect={(d) => {
                setDue(d);
                setShowDate(false);
              }}
            />
            {due && (
              <button
                onClick={() => {
                  setDue(undefined);
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
          onClick={submit}
          disabled={!value.trim()}
          className={`h-9 w-9 rounded-[10px] flex items-center justify-center text-white transition-all ${
            value.trim() ? "bg-accent hover:opacity-90" : "bg-black/10 cursor-not-allowed"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>
      {/* プロジェクト表示とタグヒント */}
      {(parsedProject || matchedTags.length > 0) && (
        <div className="flex items-center gap-2 mt-1 pl-1 flex-wrap">
          {parsedProject && (
            <span className="text-[11px] text-subink">
              {t(lang, "project")}: <span className="text-accent">{parsedProject}</span>
            </span>
          )}
          {matchedTags.map((tag) => (
            <span
              key={tag.id}
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                background: `color-mix(in srgb, ${tag.color} 12%, transparent)`,
                color: tag.color,
              }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
      {detectedUrl && (
        <div className="text-[11px] text-accent mt-0.5 pl-1 flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          {t(lang, "urlDetected")}: <span className="opacity-70 truncate max-w-[260px] inline-block align-bottom">{detectedUrl}</span>
        </div>
      )}
    </div>
  );
}
