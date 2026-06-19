import { Language } from "../types";

interface Props {
  remainingCount: number;
  lang: Language;
  onClose: () => void;
  onCancel: () => void;
}

export function CloseConfirmModal({ remainingCount, lang, onClose, onCancel }: Props) {
  const isJa = lang === "ja";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-appbg rounded-2xl shadow-2xl border border-black/8 dark:border-white/8 p-6 w-72 flex flex-col items-center gap-4">
        <div className="text-[15px] font-semibold text-ink text-center">
          {isJa ? "最低限タスクが残っています" : "Minimum tasks remaining"}
        </div>
        <div className="text-[12px] text-subink text-center">
          {isJa
            ? `${remainingCount}件の今日の最低限タスクが未完了です。閉じますか？`
            : `${remainingCount} minimum task${remainingCount > 1 ? "s" : ""} are not done. Close anyway?`}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[12px] rounded-lg bg-black/8 hover:bg-black/15 dark:bg-white/10 dark:hover:bg-white/18"
          >
            {isJa ? "キャンセル" : "Cancel"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-[12px] rounded-lg bg-ink text-appbg hover:opacity-80 dark:bg-white dark:text-ink"
          >
            {isJa ? "閉じる" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
