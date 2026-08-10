export const DAY_NAMES_JA = ["日", "月", "火", "水", "木", "金", "土"];
export const DAY_NAMES_EN_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function offsetDate(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function nextWeekday(base: Date, targetDay: number): Date {
  const current = base.getDay();
  let diff = targetDay - current;
  if (diff <= 0) diff += 7;
  return offsetDate(base, diff);
}

function removeFromText(input: string, matched: string): string {
  return input.replace(matched, "").replace(/\s{2,}/g, " ").trim();
}

export type DateParseResult = {
  date: Date;
  textWithoutDate: string;
  matched: string;
};

type Pattern = {
  re: RegExp;
  resolve: (m: RegExpMatchArray, base: Date) => Date | null;
};

const PATTERNS: Pattern[] = [
  // 今日 / today
  { re: /今日|today/i, resolve: (_m, base) => offsetDate(base, 0) },
  // 明日 / あした / tomorrow
  { re: /明日|あした|tomorrow/i, resolve: (_m, base) => offsetDate(base, 1) },
  // 明後日
  { re: /明後日/, resolve: (_m, base) => offsetDate(base, 2) },
  // N日後
  { re: /(\d+)日後/, resolve: (m, base) => offsetDate(base, parseInt(m[1])) },
  // 曜日（日本語）: 月曜, 火曜日, ...
  {
    re: /([月火水木金土日])曜日?/,
    resolve: (m, base) => {
      const idx = DAY_NAMES_JA.indexOf(m[1]);
      return idx !== -1 ? nextWeekday(base, idx) : null;
    },
  },
  // 曜日（英語）: Monday, Mon, Tuesday, Tue, ...
  {
    re: /\b(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i,
    resolve: (m, base) => {
      const short = m[1].slice(0, 3).toLowerCase();
      const idx = DAY_NAMES_EN_SHORT.indexOf(short);
      return idx !== -1 ? nextWeekday(base, idx) : null;
    },
  },
  // YYYY/M/D または YYYY-M-D（M/Dより先に評価）
  {
    re: /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    resolve: (m) =>
      new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])),
  },
  // M月D日
  {
    re: /(\d{1,2})月(\d{1,2})日/,
    resolve: (m, base) => {
      const year = base.getFullYear();
      const date = new Date(year, parseInt(m[1]) - 1, parseInt(m[2]));
      if (date < base) date.setFullYear(year + 1);
      return date;
    },
  },
  // M/D または M-D（例: 6/20, 6-20）
  {
    re: /(?<!\d)(\d{1,2})[\/\-](\d{1,2})(?!\d)/,
    resolve: (m, base) => {
      const month = parseInt(m[1]);
      const day = parseInt(m[2]);
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      const year = base.getFullYear();
      const date = new Date(year, month - 1, day);
      if (date < base) date.setFullYear(year + 1);
      return date;
    },
  },
];

/** テキスト全体から日付フォーマットを検出し、除去後のテキストと共に返す */
export function parseDateFromText(
  input: string,
  today: Date,
): DateParseResult | null {
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);

  for (const { re, resolve } of PATTERNS) {
    const m = input.match(re);
    if (!m) continue;
    const date = resolve(m, base);
    if (!date) continue;
    return {
      date,
      matched: m[0],
      textWithoutDate: removeFromText(input, m[0]),
    };
  }

  return null;
}

export function formatDateShort(date: Date, lang: string): string {
  const mo = date.getMonth() + 1;
  const d = date.getDate();
  const dayJa = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  const dayEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
  return lang === "ja" ? `${mo}/${d}(${dayJa})` : `${mo}/${d}(${dayEn})`;
}

export function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** iso日付までの残り日数（過去なら負数） */
export function daysUntil(iso: string, today: Date = new Date()): number {
  const due = new Date(iso + "T00:00:00");
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - base.getTime()) / 86400000);
}

/** 期限ウィンドウ（今日〜3ヶ月後）内かどうか */
export function isWithinDueWindow(iso: string, today: Date = new Date()): boolean {
  const due = new Date(iso + "T00:00:00");
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 3);
  return due >= start && due <= end;
}
