import { Language } from "../types";

const MAX_MIN = 120;
const R = 60;
const CIRC = 2 * Math.PI * R;

interface Props {
  minutes: number;
  lang: Language;
  onChangeMinutes: React.Dispatch<React.SetStateAction<number>>;
  onStart: () => void;
  onCancel: () => void;
}

export function FocusTimerSetup({ minutes, lang, onChangeMinutes, onStart, onCancel }: Props) {
  const pct = minutes / MAX_MIN;
  const offset = CIRC * (1 - pct);

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    onChangeMinutes((m) => Math.max(1, Math.min(MAX_MIN, m + delta)));
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseInt(e.target.value);
    if (!isNaN(v)) onChangeMinutes(Math.max(1, Math.min(MAX_MIN, v)));
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-appbg/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-appbg rounded-2xl shadow-xl border border-black/8 dark:border-white/8 p-6 flex flex-col items-center gap-4 w-64">
        <div className="text-[13px] font-semibold text-ink">
          {lang === "ja" ? "タイマー設定" : "Timer Setup"}
        </div>

        <div
          onWheel={handleWheel}
          className="cursor-ns-resize select-none"
          title={lang === "ja" ? "スクロールで調整" : "Scroll to adjust"}
        >
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle
              cx="80" cy="80" r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              className="text-black/8 dark:text-white/10"
            />
            <circle
              cx="80" cy="80" r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              className="text-ink dark:text-white"
              strokeDasharray={CIRC}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transform: "rotate(-90deg)", transformOrigin: "80px 80px", transition: "stroke-dashoffset 0.15s" }}
            />
            <text x="80" y="72" textAnchor="middle" fill="currentColor" fontSize="36" fontWeight="bold" className="text-ink">
              {minutes}
            </text>
            <text x="80" y="92" textAnchor="middle" fill="currentColor" fontSize="13" className="text-subink">
              {lang === "ja" ? "分" : "min"}
            </text>
          </svg>
        </div>

        <input
          type="number"
          min={1}
          max={MAX_MIN}
          value={minutes}
          onChange={handleInput}
          className="w-20 text-center px-2 py-1 rounded-md border border-black/10 dark:border-white/15 text-[14px] bg-transparent outline-none"
        />

        <div className="text-[11px] text-subink text-center leading-relaxed">
          {lang === "ja" ? "Enter でフォーカス開始 / Esc でキャンセル" : "Enter to start · Esc to cancel"}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-[12px] rounded-lg bg-black/6 hover:bg-black/12 dark:bg-white/8 dark:hover:bg-white/15"
          >
            {lang === "ja" ? "キャンセル" : "Cancel"}
          </button>
          <button
            onClick={onStart}
            className="px-4 py-1.5 text-[12px] rounded-lg bg-ink text-appbg hover:opacity-80 dark:bg-white dark:text-ink"
          >
            {lang === "ja" ? "開始" : "Start"}
          </button>
        </div>
      </div>
    </div>
  );
}
