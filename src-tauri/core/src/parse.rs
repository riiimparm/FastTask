//! 入力欄と同じ解釈。`:project 本文`、URL、自然言語の日付、カンマ区切り。
use chrono::{Datelike, Duration, NaiveDate, Weekday};
use regex::Regex;
use std::sync::OnceLock;

pub fn parse_project(input: &str) -> (Option<String>, String) {
    if !input.starts_with(':') {
        return (None, input.to_string());
    }
    let rest = &input[1..];
    match rest.find(char::is_whitespace) {
        None => {
            if rest.is_empty() {
                (None, String::new())
            } else {
                (Some(rest.to_string()), String::new())
            }
        }
        Some(index) => {
            let name = &rest[..index];
            let body = rest[index + 1..].to_string();
            if name.is_empty() {
                (None, body)
            } else {
                (Some(name.to_string()), body)
            }
        }
    }
}

pub fn extract_url(input: &str) -> (String, Option<String>) {
    let Some((start, end)) = find_url(input) else {
        return (input.to_string(), None);
    };
    let url = input[start..end].to_string();
    let mut text = String::new();
    text.push_str(&input[..start]);
    text.push_str(&input[end..]);
    let text = collapse_ws(&text);
    (text, Some(url))
}

fn find_url(input: &str) -> Option<(usize, usize)> {
    let mut best: Option<usize> = None;
    for prefix in ["https://", "http://", "file://"] {
        if let Some(index) = input.find(prefix) {
            best = Some(best.map_or(index, |current| current.min(index)));
        }
    }
    let start = best?;
    let rest = &input[start..];
    let end = rest
        .find(char::is_whitespace)
        .map(|index| start + index)
        .unwrap_or(input.len());
    Some((start, end))
}

fn collapse_ws(input: &str) -> String {
    let mut out = String::new();
    let mut pending = false;
    for ch in input.chars() {
        if ch.is_whitespace() {
            pending = !out.is_empty();
        } else {
            if pending {
                out.push(' ');
                pending = false;
            }
            out.push(ch);
        }
    }
    out
}

/// 日付を取り除いた本文と、見つかった日付。画面のパターン順に合わせてある。
pub fn parse_date_in(input: &str, today: NaiveDate) -> Option<(NaiveDate, String, String)> {
    if let Some(found) = match_re(today_re(), input, today, |_, base| Some(base)) {
        return Some(found);
    }
    if let Some(found) = match_re(tomorrow_re(), input, today, |_, base| Some(base + Duration::days(1))) {
        return Some(found);
    }
    if let Some(found) = match_re(day_after_re(), input, today, |_, base| Some(base + Duration::days(2))) {
        return Some(found);
    }
    if let Some(found) = match_re(in_days_re(), input, today, |caps, base| {
        let days: i64 = caps.get(1)?.as_str().parse().ok()?;
        Some(base + Duration::days(days))
    }) {
        return Some(found);
    }
    if let Some(found) = match_re(ja_weekday_re(), input, today, |caps, base| {
        let kanji = caps.get(1)?.as_str().chars().next()?;
        let index = "日月火水木金土".find(kanji)? / 3;
        weekday_from_sunday(index).map(|day| next_weekday(base, day))
    }) {
        return Some(found);
    }
    if let Some(found) = match_re(en_weekday_re(), input, today, |caps, base| {
        let short = caps.get(1)?.as_str().get(..3)?.to_lowercase();
        let index = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
            .iter()
            .position(|name| *name == short)?;
        weekday_from_sunday(index).map(|day| next_weekday(base, day))
    }) {
        return Some(found);
    }
    if let Some(found) = match_re(ymd_re(), input, today, |caps, _| {
        ymd(
            caps.get(1)?.as_str().parse().ok()?,
            caps.get(2)?.as_str().parse().ok()?,
            caps.get(3)?.as_str().parse().ok()?,
        )
    }) {
        return Some(found);
    }
    if let Some(found) = match_re(jp_md_re(), input, today, |caps, base| {
        let month: u32 = caps.get(1)?.as_str().parse().ok()?;
        let day: u32 = caps.get(2)?.as_str().parse().ok()?;
        ymd(base.year(), month, day).map(|date| roll_forward(date, base))
    }) {
        return Some(found);
    }
    find_md(input, today)
}

fn match_re(
    re: &Regex,
    input: &str,
    today: NaiveDate,
    resolve: impl Fn(&regex::Captures, NaiveDate) -> Option<NaiveDate>,
) -> Option<(NaiveDate, String, String)> {
    let caps = re.captures(input)?;
    let date = resolve(&caps, today)?;
    let matched = caps.get(0)?.as_str().to_string();
    let text = remove_once(input, &matched);
    Some((date, text, matched))
}

fn find_md(input: &str, today: NaiveDate) -> Option<(NaiveDate, String, String)> {
    let re = md_re();
    for caps in re.captures_iter(input) {
        let whole = caps.get(0)?;
        let before = whole.start();
        let after = whole.end();
        let prev_digit = before > 0 && input.as_bytes().get(before - 1).is_some_and(|b| b.is_ascii_digit());
        let next_digit = input.as_bytes().get(after).is_some_and(|b| b.is_ascii_digit());
        if prev_digit || next_digit {
            continue;
        }
        let month: u32 = caps.get(1)?.as_str().parse().ok()?;
        let day: u32 = caps.get(2)?.as_str().parse().ok()?;
        if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
            continue;
        }
        let date = ymd(today.year(), month, day)?;
        let matched = whole.as_str().to_string();
        return Some((roll_forward(date, today), remove_once(input, &matched), matched));
    }
    None
}

fn ymd(year: i32, month: u32, day: u32) -> Option<NaiveDate> {
    NaiveDate::from_ymd_opt(year, month, day)
}

fn roll_forward(date: NaiveDate, today: NaiveDate) -> NaiveDate {
    if date < today {
        NaiveDate::from_ymd_opt(date.year() + 1, date.month(), date.day()).unwrap_or(date)
    } else {
        date
    }
}

fn weekday_from_sunday(index: usize) -> Option<Weekday> {
    [
        Weekday::Sun,
        Weekday::Mon,
        Weekday::Tue,
        Weekday::Wed,
        Weekday::Thu,
        Weekday::Fri,
        Weekday::Sat,
    ]
    .get(index)
    .copied()
}

fn next_weekday(base: NaiveDate, target: Weekday) -> NaiveDate {
    let current = base.weekday().num_days_from_sunday() as i64;
    let wanted = target.num_days_from_sunday() as i64;
    let mut diff = wanted - current;
    if diff <= 0 {
        diff += 7;
    }
    base + Duration::days(diff)
}

fn remove_once(input: &str, matched: &str) -> String {
    let Some(index) = input.find(matched) else {
        return collapse_ws(input.trim());
    };
    let mut text = String::new();
    text.push_str(&input[..index]);
    text.push_str(&input[index + matched.len()..]);
    collapse_ws(text.trim())
}

fn today_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"今日|today").unwrap())
}
fn tomorrow_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)明日|あした|tomorrow").unwrap())
}
fn day_after_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"明後日").unwrap())
}
fn in_days_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(\d+)日後").unwrap())
}
fn ja_weekday_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"([月火水木金土日])曜日?").unwrap())
}
fn en_weekday_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?i)\b(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b").unwrap()
    })
}
fn ymd_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})").unwrap())
}
fn jp_md_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(\d{1,2})月(\d{1,2})日").unwrap())
}
fn md_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(\d{1,2})[/\-](\d{1,2})").unwrap())
}

pub struct PreparedLine {
    pub text: String,
    pub due: Option<String>,
}

/// 日付を本文から外し、`:project` を付け直す。カンマ分割の前に一度だけ行う。
pub fn prepare_line(raw: &str, today: NaiveDate) -> PreparedLine {
    let (project, body) = parse_project(raw);
    if let Some((date, without, _)) = parse_date_in(&body, today) {
        let text = match project {
            Some(name) => format!(":{name} {without}"),
            None => without,
        };
        PreparedLine {
            text,
            due: Some(date.format("%Y-%m-%d").to_string()),
        }
    } else {
        PreparedLine {
            text: raw.to_string(),
            due: None,
        }
    }
}

pub fn split_tasks(input: &str) -> Vec<String> {
    let parts: Vec<String> = input
        .split(',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect();
    if parts.is_empty() {
        return Vec::new();
    }
    let (first_project, _) = parse_project(&parts[0]);
    parts
        .into_iter()
        .enumerate()
        .map(|(index, part)| {
            if index > 0 {
                if let Some(project) = &first_project {
                    if !part.starts_with(':') {
                        return format!(":{project} {part}");
                    }
                }
            }
            part
        })
        .collect()
}

pub struct Materialized {
    pub title: String,
    pub project: Option<String>,
    pub url: Option<String>,
    pub body: String,
}

pub fn materialize(part: &str, url_enabled: bool) -> Materialized {
    let (text, url) = if url_enabled {
        extract_url(part)
    } else {
        (part.to_string(), None)
    };
    let (project, body) = parse_project(&text);
    let title = match &project {
        Some(name) => format!(":{name} {body}"),
        None => body.clone(),
    };
    Materialized {
        title,
        project,
        url,
        body,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(year: i32, month: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(year, month, day).unwrap()
    }

    #[test]
    fn parses_project_url_and_tomorrow() {
        let today = day(2026, 11, 12);
        let prepared = prepare_line(":work 資料 tomorrow https://example.com/a", today);
        assert_eq!(prepared.due.as_deref(), Some("2026-11-13"));
        let item = materialize(&prepared.text, true);
        assert_eq!(item.project.as_deref(), Some("work"));
        assert_eq!(item.body, "資料");
        assert_eq!(item.url.as_deref(), Some("https://example.com/a"));
        assert_eq!(item.title, ":work 資料");
    }

    #[test]
    fn comma_split_inherits_project() {
        let parts = split_tasks(":work 資料, レビュー");
        assert_eq!(parts, vec![":work 資料".to_string(), ":work レビュー".to_string()]);
    }

    #[test]
    fn weekday_skips_today() {
        // 2026-11-12 is Thursday. Next Thursday is the 19th.
        let found = parse_date_in("ship thu", day(2026, 11, 12)).unwrap();
        assert_eq!(found.0, day(2026, 11, 19));
        assert_eq!(found.1, "ship");
    }
}
