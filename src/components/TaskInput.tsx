import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { useUiContext } from "../context/UiContext";
import { parseProjectFromInput } from "../utils/project";
import { parseDateFromText, formatDateShort, dateToIso, isWithinDueWindow } from "../utils/parseDate";
import { buildDfsOrder } from "../utils/taskTree";
import { t } from "../i18n";
import { DueDateConfirmModal } from "./DueDateConfirmModal";

export function TaskInput() {
  const addTask = useStore((s) => s.addTask);
  const tasks = useStore((s) => s.tasks);
  const tags = useStore((s) => s.tags);
  const lang = useStore((s) => s.settings.language);
  const showDueDate = useStore((s) => s.settings.showDueDate ?? false);
  const tagsEnabled = useStore((s) => s.settings.tagsEnabled ?? false);
  const urlEnabled = useStore((s) => s.settings.urlEnabled ?? true);
  const [value, setValue] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<{
    parts: string[];
    iso?: string;
    firstProject?: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const {
    mainInputRef,
    setSelectedTaskId,
    searchMode,
    searchQuery,
    setSearchMode,
    setSearchQuery,
    pendingMainInput,
    setPendingMainInput,
    setCalendarJumpIso,
  } = useUiContext();

  // カレンダーの日付セルクリックで日付付きテキストを差し込み、日付の手前にカーソルを置く
  useEffect(() => {
    if (pendingMainInput === null) return;
    setValue(pendingMainInput);
    setPendingMainInput(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(0, 0);
    });
  }, [pendingMainInput, setPendingMainInput]);

  // mainInputRefとinputRefを同期
  useEffect(() => {
    mainInputRef.current = inputRef.current;
  });

  useEffect(() => {
    inputRef.current?.focus();
    setIsFocused(true);
  }, []);

  useEffect(() => {
    setValue("");
    setSearchQuery("");
  }, [searchMode]);

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
    if (!tagsEnabled || !inputBody.trim()) return [];
    const lower = inputBody.toLowerCase();
    return tags.filter((tag) =>
      tag.keywords.some((kw) => kw && lower.includes(kw.toLowerCase())),
    );
  }, [tagsEnabled, inputBody, tags]);

  useEffect(() => {
    setHighlight(0);
  }, [projectMatch]);

  function applyCandidate(name: string) {
    setValue(`:${name} `);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const detectedDate = useMemo(() => {
    if (!showDueDate || !value.trim()) return null;
    const { body } = parseProjectFromInput(value);
    return parseDateFromText(body, new Date());
  }, [showDueDate, value]);

  const splitHintVisible = useMemo(() => {
    if (!value.trim()) return false;
    const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.some((part) => {
      const withoutUrl = part.replace(/(?:https?|file):\/\/\S+/g, "").trim();
      return withoutUrl.length >= 30;
    });
  }, [value]);

  function finalizeSubmit(parts: string[], iso: string | undefined, firstProject: string | undefined) {
    let lastId = "";
    parts.forEach((part, i) => {
      const id =
        i > 0 && firstProject && !part.startsWith(":")
          ? addTask(`:${firstProject} ${part}`, iso)
          : addTask(part, iso);
      if (id) lastId = id;
    });
    setValue("");
    if (lastId) setSelectedTaskId(lastId);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function submit() {
    if (!value.trim()) return;
    const effectiveDue = detectedDate?.date ?? undefined;
    const iso = effectiveDue ? dateToIso(effectiveDue) : undefined;

    // 日付検出時はテキストから日付部分を除去してプロジェクトプレフィックスを再結合
    let submitValue = value;
    if (detectedDate) {
      const { projectName } = parseProjectFromInput(value);
      const prefix = projectName ? `:${projectName} ` : "";
      submitValue = prefix + detectedDate.textWithoutDate;
    }

    const parts = submitValue.split(",").map((s) => s.trim()).filter(Boolean);
    const { projectName: firstProject } = parseProjectFromInput(parts[0] ?? "");

    if (iso && !isWithinDueWindow(iso)) {
      setPendingSubmit({ parts, iso, firstProject });
      return;
    }
    finalizeSubmit(parts, iso, firstProject);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    if (e.key === "Escape" && searchMode) {
      e.preventDefault();
      setSearchMode(false);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (searchMode) return;
      // 補完候補がある場合は Enter で選択（submit しない）
      if (projectCandidates.length > 0) {
        applyCandidate(projectCandidates[highlight] ?? projectCandidates[0]);
        return;
      }
      submit();
      return;
    }
    if (!searchMode && projectCandidates.length > 0) {
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
    // ↑キーで検索モードのトグル（補完候補がない場合）
    if (e.key === "ArrowUp" && projectCandidates.length === 0) {
      e.preventDefault();
      setSearchMode(!searchMode);
      return;
    }
    // ↓キーでリストへ移動（補完候補がない場合）
    if (e.key === "ArrowDown" && projectCandidates.length === 0) {
      e.preventDefault();
      const dfsOrdered = buildDfsOrder(tasks.filter((t) => t.status === "todo"));
      let first;
      if (searchMode) {
        const keywords = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
        first = dfsOrdered.find((task) => {
          if (keywords.length === 0) return true;
          const body = task.projectName && task.title.startsWith(`:${task.projectName} `)
            ? task.title.slice(task.projectName.length + 2)
            : task.title;
          const text = body.toLowerCase();
          const tagText = tagsEnabled
            ? task.tags.map((id) => tags.find((t) => t.id === id)?.name ?? "").join(" ").toLowerCase()
            : "";
          return keywords.every((kw) => text.includes(kw) || tagText.includes(kw));
        });
      } else {
        first = dfsOrdered[0];
      }
      if (first) {
        inputRef.current?.blur();
        setSelectedTaskId(first.id);
      }
      return;
    }
  }

  const bulkCount = useMemo(() => {
    const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
    return parts.length >= 2 ? parts.length : 0;
  }, [value]);

  const { projectName: parsedProject } = parseProjectFromInput(value);
  const detectedUrl = useMemo(() => {
    if (!urlEnabled) return null;
    const m = value.match(/(?:https?|file):\/\/\S+/);
    return m ? m[0] : null;
  }, [urlEnabled, value]);

  return (
    <div className="px-4 py-3 border-b border-black/5">
      <div className="relative flex items-center gap-2">
        <div className="flex-1 relative">
          {/* コマンドパレット風フルワイド入力 */}
          <div className="relative w-full">
            <input
              ref={inputRef}
              data-main-input
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (searchMode) setSearchQuery(e.target.value);
              }}
              onKeyDown={onKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={searchMode || !isFocused ? "" : t(lang, showDueDate ? "placeholderWithDate" : "placeholder")}
              style={{ transition: "background-color 0.5s ease-out, box-shadow 0.7s ease-in" }}
              className={`w-full pl-4 pr-10 py-2.5 rounded-xl border-0 outline-none text-[13px] placeholder:text-black/30 dark:placeholder:text-white/28 bg-black/[0.055] dark:!bg-white/[0.08]${bulkCount >= 2 && !searchMode ? " pr-16" : ""} ${searchMode ? "!shadow-[inset_0_12px_16px_-6px_rgba(0,0,0,0.18)] dark:!shadow-[inset_0_16px_22px_-6px_rgba(255,166,64,0.24)]" : ""}`}
            />
            {bulkCount >= 2 ? (
              <span className="absolute right-9 top-1/2 -translate-y-1/2 text-[11px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded-full pointer-events-none">
                ×{bulkCount}
              </span>
            ) : null}
            {searchMode ? (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-black/35 dark:text-white/35 pointer-events-none">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </span>
            ) : (
              <button
                onClick={submit}
                disabled={!value.trim()}
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg flex items-center justify-center transition-all ${
                  value.trim()
                    ? "bg-[#1C1C1E] text-[#F5F5F5] dark:bg-[#E0E0E0] dark:text-[#111111]"
                    : "text-black/20 dark:text-white/20 cursor-not-allowed"
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </button>
            )}
          </div>
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
      </div>
      {/* プロジェクト表示とタグヒント */}
      {!searchMode && (parsedProject || matchedTags.length > 0) && (
        <div className="flex items-center gap-2 mt-1 pl-1 flex-wrap">
          {parsedProject && (
            <span className="text-[11px] text-subink">
              {t(lang, "project")}: <span className="text-accent">{parsedProject}</span>
            </span>
          )}
          {matchedTags.map((tag) => (
            <span
              key={tag.id}
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/8 text-subink dark:bg-white/10"
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
      {!searchMode && detectedDate && (
        <div className="text-[11px] text-blue-500 dark:text-blue-400 mt-0.5 pl-1 flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {formatDateShort(detectedDate.date, lang)}
        </div>
      )}
      {!searchMode && detectedUrl && (
        <div className="text-[11px] text-accent mt-0.5 pl-1 flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          {t(lang, "urlDetected")}: <span className="opacity-70 truncate max-w-[260px] inline-block align-bottom">{detectedUrl}</span>
        </div>
      )}
      {!searchMode && splitHintVisible && (
        <div className="text-[11px] text-amber-500 mt-0.5 pl-1 flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {t(lang, "splitHint")}
        </div>
      )}
      {pendingSubmit && (
        <DueDateConfirmModal
          iso={pendingSubmit.iso!}
          lang={lang}
          onCancel={() => setPendingSubmit(null)}
          onConfirm={() => {
            const p = pendingSubmit;
            setPendingSubmit(null);
            finalizeSubmit(p.parts, p.iso, p.firstProject);
            if (p.iso) setCalendarJumpIso(p.iso);
          }}
        />
      )}
    </div>
  );
}
