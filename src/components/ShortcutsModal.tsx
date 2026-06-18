import { useEffect } from "react";
import { useStore } from "../store";
import { t } from "../i18n";

interface Props {
  onClose: () => void;
}

const SHORTCUTS_JA = [
  ["j / ↓", "次のタスクへ移動"],
  ["k / ↑", "前のタスクへ移動"],
  ["Enter", "フォーカスモード（そのタスクのみ表示）"],
  ["フォーカス中 Enter", "タスクをインライン編集"],
  ["x", "完了トグル"],
  ["Space", "並び替えモード"],
  ["並び替え中 ↑↓", "タスクを上下に移動"],
  ["Space / Esc", "並び替えモード終了"],
  ["/", "入力フォームへ移動"],
  ["m", "今日の最低限タスクをトグル"],
  ["p", "確認待ち（Pending）をトグル"],
  ["Shift + j/k", "複数選択に追加"],
  ["Delete", "選択タスクを削除"],
  ["Escape", "モード解除 → 選択解除"],
  ["Ctrl + Z", "直前操作を元に戻す"],
  ["↓ (入力欄から)", "リストへ移動"],
  ["Esc (リストから)", "入力欄へ戻る"],
  ["?", "このヘルプを開く/閉じる"],
];

const SHORTCUTS_EN = [
  ["j / ↓", "Next task"],
  ["k / ↑", "Prev task"],
  ["Enter", "Focus mode (show only this task)"],
  ["Focus + Enter", "Inline edit"],
  ["x", "Toggle completion"],
  ["Space", "Reorder mode"],
  ["Reorder ↑↓", "Move task up/down"],
  ["Space / Esc", "Exit reorder mode"],
  ["/", "Focus input form"],
  ["m", "Toggle min. task"],
  ["p", "Toggle pending (waiting for reply)"],
  ["Shift + j/k", "Multi-select"],
  ["Delete", "Delete selected task"],
  ["Escape", "Clear mode → Clear selection"],
  ["Ctrl + Z", "Undo last action"],
  ["↓ (from input)", "Move to list"],
  ["Esc (from list)", "Back to input"],
  ["?", "Open/close this help"],
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
              {shortcuts.map(([key, desc]) => (
                <tr key={key} className="border-b border-black/5 last:border-0">
                  <td className="py-2 pr-4 w-[160px]">
                    <kbd className="bg-black/5 rounded px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap">
                      {key}
                    </kbd>
                  </td>
                  <td className="py-2 text-subink">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
