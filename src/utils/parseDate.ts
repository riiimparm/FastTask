const DAY_NAMES_JA = ["日", "月", "火", "水", "木", "金", "土"];
const DAY_NAMES_EN_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

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

/** テキスト先頭から日付フォーマットを検出し、残りのテキストと共に返す */
export function parseDateFromText(
  input: string,
  today: Date,
): { date: Date | null; textWithoutDate: string } {
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);

  // 今日 / today
  let m = input.match(/^(今日|today)\s*/i);
  if (m) return { date: offsetDate(base, 0), textWithoutDate: input.slice(m[0].length) };

  // 明日 / tomorrow
  m = input.match(/^(明日|あした|tomorrow)\s*/i);
  if (m) return { date: offsetDate(base, 1), textWithoutDate: input.slice(m[0].length) };

  // 明後日
  m = input.match(/^明後日\s*/);
  if (m) return { date: offsetDate(base, 2), textWithoutDate: input.slice(m[0].length) };

  // N日後
  m = input.match(/^(\d+)日後\s*/);
  if (m) return { date: offsetDate(base, parseInt(m[1])), textWithoutDate: input.slice(m[0].length) };

  // 曜日（日本語）: 月曜, 火曜, ...
  m = input.match(/^([月火水木金土日])曜(日)?\s*/);
  if (m) {
    const idx = DAY_NAMES_JA.indexOf(m[1]);
    return { date: nextWeekday(base, idx), textWithoutDate: input.slice(m[0].length) };
  }

  // 曜日（英語）: mon, tue, ...
  m = input.match(/^(sun|mon|tue|wed|thu|fri|sat)\w*\s*/i);
  if (m) {
    const idx = DAY_NAMES_EN_SHORT.indexOf(m[1].toLowerCase());
    if (idx !== -1) return { date: nextWeekday(base, idx), textWithoutDate: input.slice(m[0].length) };
  }

  // YYYY/M/D または YYYY-M-D
  m = input.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s*/);
  if (m) {
    const date = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    return { date, textWithoutDate: input.slice(m[0].length) };
  }

  // M月D日
  m = input.match(/^(\d{1,2})月(\d{1,2})日\s*/);
  if (m) {
    const year = base.getFullYear();
    const date = new Date(year, parseInt(m[1]) - 1, parseInt(m[2]));
    if (date < base) date.setFullYear(year + 1);
    return { date, textWithoutDate: input.slice(m[0].length) };
  }

  // M/D または M-D（例: 6/20, 6-20）
  m = input.match(/^(\d{1,2})[\/\-](\d{1,2})\s*/);
  if (m) {
    // 4桁年との区別: 1桁or2桁の月のみ
    const month = parseInt(m[1]);
    const day = parseInt(m[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = base.getFullYear();
      const date = new Date(year, month - 1, day);
      if (date < base) date.setFullYear(year + 1);
      return { date, textWithoutDate: input.slice(m[0].length) };
    }
  }

  return { date: null, textWithoutDate: input };
}

export function formatDateShort(date: Date, lang: string): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const dayJa = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  const dayEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
  return lang === "ja" ? `${m}/${d}(${dayJa})` : `${m}/${d}(${dayEn})`;
}

export function dateToIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
