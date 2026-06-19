import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { TagManager } from "./TagManager";
import { t, TKey } from "../i18n";
import { Language, Theme } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
}

type ToggleKey = "copyIncludeUrl" | "groupingEnabled" | "copyGroupingEnabled" | "autoDeleteOldCompleted" | "showDueDate";

const TOGGLES: Array<{ key: ToggleKey; label: TKey; desc: TKey }> = [
  { key: "copyIncludeUrl", label: "setting_copyIncludeUrl", desc: "setting_copyIncludeUrl_desc" },
  { key: "groupingEnabled", label: "setting_groupingEnabled", desc: "setting_groupingEnabled_desc" },
  { key: "copyGroupingEnabled", label: "setting_copyGroupingEnabled", desc: "setting_copyGroupingEnabled_desc" },
  { key: "autoDeleteOldCompleted", label: "setting_autoDeleteOldCompleted", desc: "setting_autoDeleteOldCompleted_desc" },
  { key: "showDueDate", label: "setting_showDueDate", desc: "setting_showDueDate_desc" },
];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-9 h-5 rounded-full relative transition-colors outline-none ${value ? "bg-[#1C1C1E] dark:bg-[#E0E0E0]" : "bg-black/15"}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full shadow transition-all ${value ? "left-[18px] bg-[#F5F5F5] dark:bg-[#111111]" : "left-0.5 bg-[#F5F5F5] dark:bg-[#888888]"}`}
      />
    </button>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md border border-black/10 overflow-hidden">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-[12px] rounded-md transition-all ${
            o.value === value ? "bg-black/10 font-medium" : "hover:bg-black/5"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DeleteConfirmModal({ lang, onConfirm, onCancel }: {
  lang: "ja" | "en";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [input, setInput] = useState("");
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center" onClick={onCancel}>
      <div className="glass rounded-card shadow-cardHover w-[320px] p-5 space-y-4 fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="text-[14px] font-semibold text-danger">
          {lang === "ja" ? "全データを削除しますか？" : "Delete all data?"}
        </div>
        <div className="text-[12px] text-subink">
          {lang === "ja"
            ? "タスク・タグをすべて削除します。元に戻せません。確認のため「delete」と入力してください。"
            : 'All tasks and tags will be deleted. This cannot be undone. Type "delete" to confirm.'}
        </div>
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && input === "delete") onConfirm(); if (e.key === "Escape") onCancel(); }}
          placeholder="delete"
          className="w-full px-2 py-1.5 text-[12px] rounded-md border border-black/10 outline-none"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-1.5 text-[12px] rounded-md hover:bg-black/8 text-subink">
            {lang === "ja" ? "キャンセル" : "Cancel"}
          </button>
          <button
            disabled={input !== "delete"}
            onClick={() => { if (input === "delete") onConfirm(); }}
            className={`px-3 py-1.5 text-[12px] rounded-md transition-all ${
              input === "delete" ? "bg-danger text-white hover:opacity-90" : "bg-black/8 text-subink cursor-not-allowed"
            }`}
          >
            {lang === "ja" ? "全データ削除" : "Delete all"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsModal({ open, onClose }: Props) {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const clearAllData = useStore((s) => s.clearAllData);
  const lang = settings.language;
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [shortcutInput, setShortcutInput] = useState(settings.focusShortcut);
  const [shortcutError, setShortcutError] = useState("");
  const [capturing, setCapturing] = useState(false);

  if (!open) return null;

  function buildShortcut(e: React.KeyboardEvent): string {
    const modifiers: string[] = [];
    if (e.ctrlKey || e.metaKey) modifiers.push("CommandOrControl");
    if (e.altKey) modifiers.push("Alt");
    if (e.shiftKey) modifiers.push("Shift");
    const skip = ["Control", "Meta", "Alt", "Shift", "OS"];
    if (skip.includes(e.key)) return "";
    const keyNames: Record<string, string> = {
      " ": "Space",
      Enter: "Return",
      ArrowUp: "Up",
      ArrowDown: "Down",
      ArrowLeft: "Left",
      ArrowRight: "Right",
    };
    const key = keyNames[e.key] ?? e.key.toUpperCase();
    if (!modifiers.length) return "";
    return [...modifiers, key].join("+");
  }

  function prettyShortcut(s: string): string {
    if (!s) return "";
    return s
      .replace("CommandOrControl", "⌘")
      .replace("Control", "⌃")
      .replace("Shift", "⇧")
      .replace("Alt", "⌥")
      .replace("Return", "↵")
      .replace("Space", "␣")
      .split("+")
      .join("");
  }

  async function saveShortcut() {
    const val = shortcutInput.trim();
    setShortcutError("");
    if (!val) {
      try { await invoke("unregister_focus_shortcut"); } catch {}
      update({ focusShortcut: "" });
      return;
    }
    try {
      await invoke("register_focus_shortcut", { shortcutStr: val });
      update({ focusShortcut: val });
    } catch (e) {
      setShortcutError(String(e));
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center pt-10"
        onClick={onClose}
      >
        <div
          className="glass rounded-card shadow-cardHover w-[440px] max-h-[80vh] flex flex-col fade-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-black/5 flex items-center justify-between">
            <h2 className="font-semibold">{t(lang, "settings")}</h2>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded hover:bg-black/5 text-subink flex items-center justify-center"
            >
              ✕
            </button>
          </div>
          <div className="overflow-y-auto scrollbar-thin p-4 space-y-5">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 text-[13px]">{t(lang, "theme")}</div>
                <SegmentedControl<Theme>
                  value={settings.theme}
                  onChange={(v) => update({ theme: v })}
                  options={[
                    { value: "light", label: t(lang, "themeLight") },
                    { value: "dark", label: t(lang, "themeDark") },
                    { value: "system", label: t(lang, "themeSystem") },
                  ]}
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 text-[13px]">{t(lang, "language")}</div>
                <SegmentedControl<Language>
                  value={settings.language}
                  onChange={(v) => update({ language: v })}
                  options={[
                    { value: "ja", label: "日本語" },
                    { value: "en", label: "English" },
                  ]}
                />
              </div>
            </div>

            <div className="border-t border-black/5 pt-4 space-y-2">
              {TOGGLES.map((it) => (
                <div key={it.key} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-[13px]">{t(lang, it.label)}</div>
                    <div className="text-[11px] text-subink">{t(lang, it.desc)}</div>
                  </div>
                  <Toggle
                    value={settings[it.key]}
                    onChange={(v) => update({ [it.key]: v })}
                  />
                </div>
              ))}
            </div>

            <div className="border-t border-black/5 pt-4 space-y-1.5">
              <div className="text-[13px]">
                {lang === "ja" ? "ウィンドウフォーカスショートカット" : "Window focus shortcut"}
              </div>
              <div className="text-[11px] text-subink">
                {lang === "ja"
                  ? "修飾キー（⌘/⌃/⌥）を含むキー組み合わせ"
                  : "Key combo including a modifier (⌘/⌃/⌥)"}
              </div>
              <div className="flex gap-2">
                {capturing ? (
                  <input
                    autoFocus
                    readOnly
                    placeholder={lang === "ja" ? "キーを押してください..." : "Press a key..."}
                    className="flex-1 px-2 py-1.5 text-[12px] rounded-md border-2 border-accent outline-none text-subink bg-transparent"
                    onKeyDown={(e) => {
                      e.preventDefault();
                      if (e.key === "Escape") { setCapturing(false); return; }
                      const sc = buildShortcut(e);
                      if (sc) {
                        setShortcutInput(sc);
                        setShortcutError("");
                        setCapturing(false);
                      } else {
                        setShortcutError(lang === "ja" ? t(lang, "shortcutModifierHint") : t(lang, "shortcutModifierHint"));
                      }
                    }}
                    onBlur={() => setCapturing(false)}
                  />
                ) : (
                  <button
                    onClick={() => { setCapturing(true); setShortcutError(""); }}
                    className="flex-1 px-2 py-1.5 text-[12px] rounded-md border border-black/10 dark:border-white/10 text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    {shortcutInput
                      ? <span className="font-mono text-[15px] tracking-wider">{prettyShortcut(shortcutInput)}</span>
                      : <span className="text-subink">{lang === "ja" ? "クリックして設定..." : "Click to set..."}</span>
                    }
                  </button>
                )}
                {shortcutInput && !capturing && (
                  <button
                    onClick={() => { setShortcutInput(""); setShortcutError(""); }}
                    className="px-2 py-1.5 text-[12px] rounded-md bg-black/8 hover:bg-black/15 dark:bg-white/10 dark:hover:bg-white/20"
                  >
                    {lang === "ja" ? "クリア" : "Clear"}
                  </button>
                )}
                <button
                  onClick={saveShortcut}
                  disabled={capturing}
                  className="px-3 py-1.5 text-[12px] rounded-md bg-black/8 hover:bg-black/15 dark:bg-white/10 dark:hover:bg-white/20 disabled:opacity-40"
                >
                  {lang === "ja" ? "保存" : "Save"}
                </button>
              </div>
              {shortcutError && (
                <div className="text-[11px] text-danger">{shortcutError}</div>
              )}
            </div>

            <div className="border-t border-black/5 pt-4">
              <TagManager />
            </div>

            <div className="border-t border-black/5 pt-3 flex justify-end">
              <button
                onClick={() => setShowDeleteModal(true)}
                className="text-[11px] text-subink hover:text-danger transition-colors"
              >
                {lang === "ja" ? "全データ削除..." : "Clear all data..."}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDeleteModal && (
        <DeleteConfirmModal
          lang={lang}
          onConfirm={() => { clearAllData(); setShowDeleteModal(false); onClose(); }}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </>
  );
}
