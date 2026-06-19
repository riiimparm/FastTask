import { useEffect } from "react";
import { useStore } from "../store";
import { t } from "../i18n";

interface Props {
  onClose: () => void;
}

type ShortcutRow = [string, string] | null;

const SHORTCUTS_JA: ShortcutRow[] = [
  ["j / ↓", "次のタスクへ"],
  ["k / ↑", "前のタスクへ"],
  ["Shift + j/k ↑/↓", "複数選択"],
  null,
  ["x", "完了"],
  ["Delete", "削除"],
  ["Space", "並び替え"],
  null,
  ["Enter", "フォーカスする"],
  ["m", "Mustにする"],
  ["p", "Pendingにする"],
  ["Tab", "サブタスクにする"],
  ["Shift + Tab", "サブタスク解除"],
  null,
  ["/", "タスク入力"],
  ["Escape", "切り替え"],
  ["⌘ + Z", "元に戻す"],
  null,
  ["?", "ヘルプ"],
];

const SHORTCUTS_EN: ShortcutRow[] = [
  ["j / ↓", "Next task"],
  ["k / ↑", "Prev task"],
  ["Shift + j/k ↑/↓", "Multi-select"],
  null,
  ["x", "Complete"],
  ["Delete", "Delete"],
  ["Space", "Reorder"],
  null,
  ["Enter", "Focus"],
  ["m", "Set as Must"],
  ["p", "Set as Pending"],
  ["Tab", "Make subtask"],
  ["Shift + Tab", "Unindent subtask"],
  null,
  ["/", "Input task"],
  ["Escape", "Step back"],
  ["⌘ + Z", "Undo"],
  null,
  ["?", "Help"],
];

export function ShortcutsModal({ onClose }: Props) {
  const lang = useStore((s) => s.settings.language);
  const shortcuts = lang === "ja" ? SHORTCUTS_JA : SHORTCUTS_EN;
  const title = t(lang, "shortcuts");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" || e.key === "?") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="glass rounded-card shadow-cardHover w-[480px] max-h-[80vh] overflow-auto fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
          <span className="font-semibold text-[14px]">{title}</span>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded hover:bg-black/5 flex items-center justify-center text-subink"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="px-5 py-3">
          <table className="w-full text-[12px]">
            <tbody>
              {shortcuts.map((row, i) =>
                row === null ? (
                  <tr key={`gap-${i}`}><td colSpan={2} className="py-4" /></tr>
                ) : (
                  <tr key={row[0]} className="border-b border-black/5 last:border-0">
                    <td className="py-2 pr-4 w-[160px]">
                      <kbd className="bg-black/5 rounded px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap">
                        {row[0]}
                      </kbd>
                    </td>
                    <td className="py-2 text-subink">{row[1]}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
