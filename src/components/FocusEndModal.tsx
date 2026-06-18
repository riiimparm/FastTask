import { Language } from "../types";

interface Props {
  mode: "ended" | "confirm";
  elapsedSeconds: number;
  lang: Language;
  onExtend: () => void;
  onFinish: () => void;
  onContinue?: () => void;
}

export function FocusEndModal({ mode, elapsedSeconds, lang, onExtend, onFinish, onContinue }: Props) {
  const m = Math.floor(elapsedSeconds / 60);
  const s = elapsedSeconds % 60;
  const elapsed =
    lang === "ja"
      ? `${m}分${s > 0 ? `${s}秒` : ""}集中しました`
      : `Focused for ${m}m${s > 0 ? ` ${s}s` : ""}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-appbg rounded-2xl shadow-2xl border border-black/8 dark:border-white/8 p-6 w-64 flex flex-col items-center gap-4">
        <div className="text-[15px] font-semibold text-ink">
          {mode === "ended"
            ? (lang === "ja" ? "タイマー終了" : "Timer Done")
            : (lang === "ja" ? "フォーカスを終了しますか？" : "End focus session?")}
        </div>

        {mode === "ended" && (
          <div className="text-[12px] text-subink text-center">{elapsed}</div>
        )}

        <div className="flex gap-3">
          {mode === "ended" ? (
            <>
              <button
                onClick={onExtend}
                className="px-4 py-2 text-[12px] rounded-lg bg-black/8 hover:bg-black/15 dark:bg-white/10 dark:hover:bg-white/18"
              >
                {lang === "ja" ? "+5分延長" : "+5 min"}
              </button>
              <button
                onClick={onFinish}
                className="px-4 py-2 text-[12px] rounded-lg bg-ink text-appbg hover:opacity-80 dark:bg-white dark:text-ink"
              >
                {lang === "ja" ? "終了" : "Finish"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onContinue}
                className="px-4 py-2 text-[12px] rounded-lg bg-black/8 hover:bg-black/15 dark:bg-white/10 dark:hover:bg-white/18"
              >
                {lang === "ja" ? "続ける" : "Continue"}
              </button>
              <button
                onClick={onFinish}
                className="px-4 py-2 text-[12px] rounded-lg bg-ink text-appbg hover:opacity-80 dark:bg-white dark:text-ink"
              >
                {lang === "ja" ? "終了" : "Finish"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
