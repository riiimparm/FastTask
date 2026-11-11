import { useCallback, useEffect, useMemo, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Language } from "../types";
import { DailyResult, buildResultShareText, formatFocus } from "../utils/result";

interface Props {
  result: DailyResult;
  lang: Language;
  onClose: () => void;
}

interface Slide {
  key: string;
  kicker: string;
  big: string;
  caption: string;
}

/**
 * 日次リザルト画面。デザイン方向（2026-11-08決定）:
 * Discord Checkpoint 風に 1 画面 1 スタッツ、締めにシェア用まとめカード。
 * モダン（ダーク基調＋鮮やかなグラデーション＋太いディスプレイ書体）、キャラ・マスコットなし。
 * アプリ本体のテーマによらず、このモーダル内だけ常にダーク。
 */
export function DailyResultModal({ result: r, lang, onClose }: Props) {
  const ja = lang === "ja";
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const slides: Slide[] = useMemo(() => {
    const list: Slide[] = [
      {
        key: "completed",
        kicker: ja ? "今日の完了" : "COMPLETED TODAY",
        big: String(r.completedCount),
        caption: ja ? "件のタスクを片付けた" : `tasks cleared`,
      },
      {
        key: "rate",
        kicker: ja ? "達成率" : "TODAY'S RATE",
        big: `${r.rate}%`,
        caption: ja
          ? `完了 ${r.completedCount} / 完了+残りMUST ${r.rateTarget}`
          : `${r.completedCount} done / done + remaining MUST ${r.rateTarget}`,
      },
      {
        key: "focus",
        kicker: ja ? "フォーカス時間" : "FOCUS TIME",
        big: formatFocus(r.focusMinutes),
        caption:
          r.focusMinutes > 0
            ? ja
              ? "今日の集中時間"
              : "focused today"
            : ja
              ? "フォーカス時間はこのバージョンから記録されます"
              : "Focus time is recorded from this version on",
      },
    ];
    if (r.mustTotal > 0) {
      list.push({
        key: "must",
        kicker: "MUST",
        big: r.mustAllClear ? "ALL CLEAR" : `${r.mustDone} / ${r.mustTotal}`,
        caption: r.mustAllClear
          ? ja
            ? "最優先タスクを全部片付けた"
            : "Every top-priority task cleared"
          : ja
            ? `あと ${r.mustRemaining} 件`
            : `${r.mustRemaining} to go`,
      });
    }
    if (r.topProject) {
      list.push({
        key: "project",
        kicker: ja ? "トッププロジェクト" : "TOP PROJECT",
        big: r.topProject.name,
        caption: ja ? `${r.topProject.count} 件完了` : `${r.topProject.count} tasks done`,
      });
    }
    if (r.topTag) {
      list.push({
        key: "tag",
        kicker: ja ? "トップタグ" : "TOP TAG",
        big: `#${r.topTag.name}`,
        caption: ja ? `${r.topTag.count} 件に付いた` : `on ${r.topTag.count} tasks`,
      });
    }
    if (r.streak > 0) {
      list.push({
        key: "streak",
        kicker: ja ? "連続記録" : "STREAK",
        big: `${r.streak}`,
        caption: ja ? "日連続で完了記録あり" : `day${r.streak > 1 ? "s" : ""} in a row`,
      });
    }
    return list;
  }, [r, ja]);

  const total = slides.length + 1; // 最後にまとめカード
  const isSummary = index === slides.length;
  const next = useCallback(() => setIndex((i) => Math.min(i + 1, total - 1)), [total]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  async function share() {
    try {
      await writeText(buildResultShareText(r, lang));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // コピー失敗時は静かに無視（モーダルを閉じない）
    }
  }

  const maxWeek = Math.max(1, ...r.week.map((d) => d.count));
  const slide = slides[index];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-[380px] max-w-[92vw] h-[480px] max-h-[86vh] rounded-3xl overflow-hidden text-white shadow-2xl select-none"
        style={{
          background:
            "radial-gradient(120% 90% at 85% -10%, rgba(255,110,140,0.55) 0%, rgba(255,110,140,0) 55%)," +
            "radial-gradient(120% 100% at 10% 110%, rgba(64,120,255,0.5) 0%, rgba(64,120,255,0) 55%)," +
            "linear-gradient(160deg, #17121f 0%, #0b0b10 60%, #0b0b10 100%)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="absolute top-0 inset-x-0 flex items-center justify-between px-5 pt-4 z-10">
          <div className="text-[10px] font-bold tracking-[0.25em] text-white/60">
            FASTTASK RESULT · {r.date}
          </div>
          <button
            onClick={onClose}
            aria-label={ja ? "閉じる" : "Close"}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {!isSummary && slide ? (
          <button className="absolute inset-0 w-full h-full text-left cursor-pointer" onClick={next}>
            <div className="h-full flex flex-col justify-center px-7">
              <div
                className="text-[12px] font-bold tracking-[0.3em]"
                style={{
                  background: "linear-gradient(90deg, #c084fc, #fb7185)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {slide.kicker}
              </div>
              <div
                className={`font-black tracking-tight leading-none mt-3 ${
                  slide.big.length > 6 ? "text-[44px]" : "text-[92px]"
                }`}
                style={{ textShadow: "0 0 42px rgba(192,132,252,0.45)" }}
              >
                {slide.big}
              </div>
              <div className="text-[13px] text-white/70 mt-4">{slide.caption}</div>
              <div className="text-[11px] text-white/35 mt-10">
                {ja ? "クリック / → で次へ" : "Click / → for next"}
              </div>
            </div>
          </button>
        ) : (
          <div className="h-full flex flex-col px-6 pt-14 pb-5 overflow-y-auto">
            <div className="text-[10px] font-bold tracking-[0.3em] text-white/50">
              {ja ? "今日のタイプ" : "YOUR TYPE TODAY"}
            </div>
            <div
              className="text-[34px] font-black tracking-tight leading-tight mt-1"
              style={{
                background: "linear-gradient(90deg, #c084fc, #fb7185, #fbbf24)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {r.type.code}
            </div>
            <div className="text-[12px] text-white/75 mt-1">
              {ja ? r.type.commentJa : r.type.commentEn}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-5">
              {[
                { label: ja ? "完了" : "Done", value: `${r.completedCount}` },
                { label: ja ? "達成率" : "Rate", value: `${r.rate}%` },
                { label: ja ? "フォーカス" : "Focus", value: formatFocus(r.focusMinutes) },
                {
                  label: "MUST",
                  value: r.mustTotal > 0 ? (r.mustAllClear ? "ALL CLEAR" : `${r.mustDone}/${r.mustTotal}`) : "-",
                },
              ].map((cell) => (
                <div key={cell.label} className="rounded-2xl bg-white/8 border border-white/10 px-3 py-2.5">
                  <div className="text-[9px] font-bold tracking-[0.2em] text-white/50">{cell.label}</div>
                  <div className="text-[20px] font-extrabold leading-tight">{cell.value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-white/8 border border-white/10 px-3 py-3 mt-2">
              <div className="text-[9px] font-bold tracking-[0.2em] text-white/50 mb-2">
                {ja ? "直近7日" : "LAST 7 DAYS"}
                {r.streak > 0 && (
                  <span className="ml-2 text-white/70">
                    {ja ? `${r.streak}日連続中` : `${r.streak}-day streak`}
                  </span>
                )}
              </div>
              <div className="flex items-end gap-1.5">
                {r.week.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full h-10 flex items-end">
                      <div
                        className="w-full rounded-sm"
                        style={{
                          height: `${Math.max(3, (d.count / maxWeek) * 40)}px`,
                          background:
                            d.date === r.date
                              ? "linear-gradient(180deg, #fb7185, #c084fc)"
                              : "rgba(255,255,255,0.28)",
                        }}
                      />
                    </div>
                    <div className="text-[8px] text-white/45">{d.date.slice(8)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={share}
                className="flex-1 px-4 py-2.5 rounded-xl text-[12px] font-bold text-white transition-opacity hover:opacity-85"
                style={{ background: "linear-gradient(90deg, #a855f7, #f43f5e)" }}
              >
                {copied ? (ja ? "✓ コピーしました" : "✓ Copied") : ja ? "結果をコピー" : "Copy result"}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-[12px] bg-white/10 hover:bg-white/20"
              >
                {ja ? "閉じる" : "Close"}
              </button>
            </div>
          </div>
        )}

        {/* 進捗ドット */}
        <div className="absolute bottom-4 inset-x-0 flex justify-center gap-1.5 z-10 pointer-events-none">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className="rounded-full transition-all"
              style={{
                width: i === index ? 18 : 6,
                height: 6,
                background: i === index ? "#fff" : "rgba(255,255,255,0.3)",
              }}
            />
          ))}
        </div>

        {!isSummary && index > 0 && (
          <button
            onClick={prev}
            aria-label={ja ? "戻る" : "Back"}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/8 hover:bg-white/18 flex items-center justify-center z-10"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
