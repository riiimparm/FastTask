import type { Tag, Task } from "../types.ts";
import { isMustTask, todayIso } from "./project.ts";

/** 指定日（YYYY-MM-DD）から n 日ずらした日付文字列を返す */
function shiftDay(dayIso: string, delta: number): string {
  const d = new Date(`${dayIso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface ResultType {
  /** 英語ラベル（例: MUST HUNTER） */
  code: string;
  ja: string;
  commentJa: string;
  en: string;
  commentEn: string;
}

export interface DailyResult {
  date: string;
  /** 今日完了したタスク数 */
  completedCount: number;
  /** 達成率（完了 / (完了 + 残りMUST)、0-100） */
  rate: number;
  /** 達成率の分母（完了 + 残りMUST） */
  rateTarget: number;
  /** 今日のフォーカス時間（分） */
  focusMinutes: number;
  /** 今日完了した MUST（isMinimum）タスク数 */
  mustDone: number;
  /** 未完了の MUST タスク数（isMinimum または期限が今日の todo） */
  mustRemaining: number;
  mustTotal: number;
  /** MUST を 1 件以上片付け、残りが 0 */
  mustAllClear: boolean;
  topProject?: { name: string; count: number };
  topTag?: { name: string; count: number };
  /** 連続達成日数（完了が 1 件以上ある日が続く日数） */
  streak: number;
  /** 直近 7 日の完了数（古い順） */
  week: { date: string; count: number }[];
  type: ResultType;
}

function mode<T>(values: T[]): { value: T; count: number } | undefined {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: { value: T; count: number } | undefined;
  for (const [value, count] of counts) {
    if (!best || count > best.count) best = { value, count };
  }
  return best;
}

function diagnose(args: {
  completedCount: number;
  mustDone: number;
  mustRemaining: number;
  focusMinutes: number;
  topProjectShare: number;
  distinctProjects: number;
  streak: number;
}): ResultType {
  const {
    completedCount,
    mustDone,
    mustRemaining,
    focusMinutes,
    topProjectShare,
    distinctProjects,
    streak,
  } = args;

  if (completedCount === 0) {
    return {
      code: "WARMING UP",
      ja: "ウォーミングアップ",
      commentJa: "今日はまだこれから。最初の一件を片付けよう。",
      en: "Warming Up",
      commentEn: "Nothing done yet today. Clear the first one.",
    };
  }
  if (mustRemaining === 0 && mustDone >= 2) {
    return {
      code: "MUST HUNTER",
      ja: "MUSTハンター",
      commentJa: "最優先タスクを全部仕留めた日。",
      en: "Must Hunter",
      commentEn: "You hunted down every top-priority task.",
    };
  }
  if (focusMinutes >= 90 && completedCount >= 3) {
    return {
      code: "DEEP FOCUSER",
      ja: "集中型",
      commentJa: "長い集中で押し切った日。",
      en: "Deep Focuser",
      commentEn: "Long focus sessions carried the day.",
    };
  }
  if (completedCount >= 4 && topProjectShare >= 0.6) {
    return {
      code: "SINGLE FOCUS",
      ja: "一点集中型",
      commentJa: "一つのプロジェクトに絞って進めた日。",
      en: "Single Focus",
      commentEn: "You drilled into one project.",
    };
  }
  if (completedCount >= 10) {
    return {
      code: "SPRINTER",
      ja: "大量処理型",
      commentJa: "件数で圧倒した日。",
      en: "Sprinter",
      commentEn: "Sheer volume won the day.",
    };
  }
  if (distinctProjects >= 3) {
    return {
      code: "MULTI PLAYER",
      ja: "並行型",
      commentJa: "複数プロジェクトをバランスよく回した日。",
      en: "Multi Player",
      commentEn: "You juggled several projects in balance.",
    };
  }
  if (streak >= 3) {
    return {
      code: "STREAK KEEPER",
      ja: "継続型",
      commentJa: "連続記録を守り抜いた日。",
      en: "Streak Keeper",
      commentEn: "You kept the streak alive.",
    };
  }
  return {
    code: "STEADY",
    ja: "安定型",
    commentJa: "着実に積み上げた日。",
    en: "Steady",
    commentEn: "A solid, steady day.",
  };
}

/**
 * 今日のリザルトを集計する。
 * - 完了数は completedAt が今日のタスクで数える（Copy Today's Done と同じ基準）
 * - 達成率の分母は「完了 + 残りMUST」。期日を使わない運用でも常に 100% にならないための定義
 * - フォーカス時間は記録の仕組み上、設定に日別保存された分だけを渡す（過去分は遡れない）
 */
export function computeDailyResult(
  tasks: Task[],
  tags: Tag[],
  focusMinutes: number,
  today: string = todayIso(),
): DailyResult {
  const doneToday = tasks.filter(
    (t) => t.status === "done" && t.completedAt && t.completedAt.slice(0, 10) === today,
  );
  const completedCount = doneToday.length;

  const mustDone = doneToday.filter((t) => t.isMinimum).length;
  const mustRemaining = tasks.filter((t) => t.status === "todo" && isMustTask(t)).length;
  const mustTotal = mustDone + mustRemaining;
  const rateTarget = completedCount + mustRemaining;
  const rate = rateTarget === 0 ? (completedCount > 0 ? 100 : 0) : Math.round((completedCount / rateTarget) * 100);

  const topProjectRaw = mode(doneToday.map((t) => t.projectName).filter((p): p is string => !!p));
  const topProject = topProjectRaw ? { name: topProjectRaw.value, count: topProjectRaw.count } : undefined;

  const tagsById = new Map(tags.map((t) => [t.id, t]));
  const topTagRaw = mode(doneToday.flatMap((t) => t.tags ?? []));
  const topTag =
    topTagRaw && tagsById.has(topTagRaw.value)
      ? { name: tagsById.get(topTagRaw.value)!.name, count: topTagRaw.count }
      : undefined;

  // 日別の完了数（streak と週間グラフ用）
  const doneByDay = new Map<string, number>();
  for (const t of tasks) {
    if (t.status === "done" && t.completedAt) {
      const day = t.completedAt.slice(0, 10);
      doneByDay.set(day, (doneByDay.get(day) ?? 0) + 1);
    }
  }
  let streak = 0;
  let cursor = (doneByDay.get(today) ?? 0) > 0 ? today : shiftDay(today, -1);
  while ((doneByDay.get(cursor) ?? 0) > 0) {
    streak++;
    cursor = shiftDay(cursor, -1);
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDay(today, i - 6);
    return { date, count: doneByDay.get(date) ?? 0 };
  });

  const distinctProjects = new Set(doneToday.map((t) => t.projectName).filter(Boolean)).size;
  const type = diagnose({
    completedCount,
    mustDone,
    mustRemaining,
    focusMinutes,
    topProjectShare: topProject && completedCount > 0 ? topProject.count / completedCount : 0,
    distinctProjects,
    streak,
  });

  return {
    date: today,
    completedCount,
    rate,
    rateTarget,
    focusMinutes,
    mustDone,
    mustRemaining,
    mustTotal,
    mustAllClear: mustDone > 0 && mustRemaining === 0,
    topProject,
    topTag,
    streak,
    week,
    type,
  };
}

/** フォーカス時間（分）を H:MM 表記にする */
export function formatFocus(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** シェア用のまとめテキスト（アプリの「コピー」文化に合わせたプレーンテキスト） */
export function buildResultShareText(r: DailyResult, lang: "ja" | "en"): string {
  if (lang === "en") {
    const lines = [
      `FastTask RESULT ${r.date}`,
      `Completed: ${r.completedCount} (Rate ${r.rate}%)`,
      `Focus: ${formatFocus(r.focusMinutes)}`,
      r.mustTotal > 0
        ? `MUST: ${r.mustAllClear ? "ALL CLEAR" : `${r.mustDone}/${r.mustTotal}`}`
        : `MUST: -`,
      ...(r.topProject ? [`Top project: ${r.topProject.name}`] : []),
      ...(r.streak > 0 ? [`Streak: ${r.streak} day${r.streak > 1 ? "s" : ""}`] : []),
      `Type: ${r.type.code} - ${r.type.commentEn}`,
    ];
    return lines.join("\n");
  }
  const lines = [
    `FastTask RESULT ${r.date}`,
    `完了 ${r.completedCount}件（達成率 ${r.rate}%）`,
    `フォーカス ${formatFocus(r.focusMinutes)}`,
    r.mustTotal > 0
      ? `MUST ${r.mustAllClear ? "全クリア" : `${r.mustDone}/${r.mustTotal}`}`
      : `MUST -`,
    ...(r.topProject ? [`トッププロジェクト: ${r.topProject.name}`] : []),
    ...(r.streak > 0 ? [`連続 ${r.streak}日`] : []),
    `今日のタイプ: ${r.type.code}（${r.type.commentJa}）`,
  ];
  return lines.join("\n");
}
