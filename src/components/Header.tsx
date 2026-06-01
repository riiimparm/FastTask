import { useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useStore } from "../store";
import { buildTodayCompletedMarkdown, countTodayCompleted } from "../utils/copy";
import { t } from "../i18n";

interface Props {
  onOpenSettings: () => void;
}

export function Header({ onOpenSettings }: Props) {
  const tasks = useStore((s) => s.tasks);
  const tags = useStore((s) => s.tags);
  const settings = useStore((s) => s.settings);
  const setToast = useStore((s) => s.setToast);
  const [copied, setCopied] = useState(false);
  const lang = settings.language;

  const todayCount = countTodayCompleted(tasks);
  const disabled = todayCount === 0;

  async function copyToday() {
    const md = buildTodayCompletedMarkdown(
      tasks,
      tags,
      settings.copyIncludeUrl,
      settings.copyGroupingEnabled,
      lang,
    );
    try {
      await writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setToast(`${t(lang, "copyFailed")}: ${e}`);
    }
  }

  return (
    <header className="glass sticky top-0 z-30 px-4 py-3 flex items-center justify-between border-b border-black/5">
      <div className="font-semibold tracking-tight">{t(lang, "appTitle")}</div>
      <div className="flex items-center gap-2">
        <button
          onClick={copyToday}
          disabled={disabled}
          className={`text-[12px] px-3 py-1.5 rounded-lg transition-all ${
            disabled
              ? "bg-black/5 text-subink cursor-not-allowed"
              : copied
              ? "bg-ok text-white"
              : "bg-accent text-white hover:opacity-90"
          }`}
        >
          {copied ? t(lang, "copied") : `${t(lang, "copyToday")}${todayCount ? ` (${todayCount})` : ""}`}
        </button>
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
