import { Language } from "../types";

interface Props {
  iso: string;
  lang: Language;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DueDateConfirmModal({ iso, lang, onConfirm, onCancel }: Props) {
  const isJa = lang === "ja";
  const d = new Date(iso + "T00:00:00");
  const label = isJa
    ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-appbg rounded-2xl shadow-2xl border border-black/8 dark:border-white/8 p-6 w-72 flex flex-col items-center gap-4">
        <div className="text-[15px] font-semibold text-ink text-center">
          {isJa ? "期限が範囲外です" : "Due date out of range"}
        </div>
        <div className="text-[12px] text-subink text-center">
          {isJa
            ? `${label} は今日から3ヶ月の範囲外です。このまま設定しますか？`
            : `${label} is outside the 3-month window from today. Set it anyway?`}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[12px] rounded-lg bg-black/8 hover:bg-black/15 dark:bg-white/10 dark:hover:bg-white/18"
          >
            {isJa ? "キャンセル" : "Cancel"}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-[12px] rounded-lg bg-ink text-appbg hover:opacity-80 dark:bg-white dark:text-ink"
          >
            {isJa ? "設定する" : "Set anyway"}
          </button>
        </div>
      </div>
    </div>
  );
}
