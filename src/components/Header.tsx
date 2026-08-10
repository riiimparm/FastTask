import { useEffect, useRef, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useStore } from "../store";
import {
  buildAllCompletedMarkdown,
  buildTodayCompletedMarkdown,
  buildTodoMarkdown,
  countAllCompleted,
  countTodayCompleted,
  countTodo,
} from "../utils/copy";
import { t } from "../i18n";

type CopyTarget = "today" | "all" | "todo";

interface Props {
  onOpenSettings: () => void;
}

export function Header({ onOpenSettings }: Props) {
  const tasks = useStore((s) => s.tasks);
  const tags = useStore((s) => s.tags);
  const settings = useStore((s) => s.settings);
  const setToast = useStore((s) => s.setToast);
  const [copied, setCopied] = useState<CopyTarget | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const lang = settings.language;

  const todayCount = countTodayCompleted(tasks);
  const allCount = countAllCompleted(tasks);
  const todoCount = countTodo(tasks);

  useEffect(() => {
    if (!showMenu) return;
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [showMenu]);

  async function copy(target: CopyTarget) {
    setShowMenu(false);
    let md = "";
    if (target === "today") {
      md = buildTodayCompletedMarkdown(tasks, tags, settings.urlEnabled, settings.copyGroupingEnabled, lang);
    } else if (target === "all") {
      md = buildAllCompletedMarkdown(tasks, tags, settings.urlEnabled, settings.copyGroupingEnabled, lang);
    } else {
      md = buildTodoMarkdown(tasks, tags, settings.urlEnabled, settings.copyGroupingEnabled, lang);
    }
    try {
      await writeText(md);
      setCopied(target);
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      setToast(`${t(lang, "copyFailed")}: ${e}`);
    }
  }

  const isCopied = copied !== null;

  const menuItems: { target: CopyTarget; label: string; count: number }[] = [
    { target: "today", label: t(lang, "copyToday"), count: todayCount },
    { target: "all",   label: t(lang, "copyAllCompleted"), count: allCount },
    { target: "todo",  label: t(lang, "copyTodo"), count: todoCount },
  ];

  return (
    <header
      data-tauri-drag-region
      className="glass sticky top-0 z-30 pl-20 pr-4 py-3 flex items-center justify-between border-b border-black/5"
    >
      <div data-tauri-drag-region className="font-semibold tracking-tight">
        {t(lang, "appTitle")}
      </div>
      <div className="flex items-center gap-2">
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className={`text-[12px] px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              isCopied
                ? "bg-[#111] text-[#F5F5F5] dark:bg-[#E0E0E0] dark:text-[#111]"
                : "bg-black/8 text-ink border border-black/10 hover:bg-black/15 dark:bg-[#E0E0E0] dark:text-[#111] dark:border-transparent dark:hover:bg-[#F5F5F5]"
            }`}
          >
            {isCopied ? (
              t(lang, "copied")
            ) : (
              <>
                {t(lang, "copy")}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 10l5 5 5-5z"/>
                </svg>
              </>
            )}
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 glass rounded-card shadow-cardHover py-1 z-50 fade-in min-w-[200px]">
              {menuItems.map(({ target, label, count }) => (
                <button
                  key={target}
                  onClick={() => copy(target)}
                  className="w-full flex items-center justify-between px-3 py-2 text-[12px] hover:bg-black/5 text-left gap-4"
                >
                  <span>{label}</span>
                  <span className="text-subink text-[11px] tabular-nums">{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onOpenSettings}
          className="w-8 h-8 rounded-lg hover:bg-black/5 flex items-center justify-center text-subink"
          aria-label={t(lang, "settings")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </header>
  );
}
