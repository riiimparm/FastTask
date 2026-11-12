//! コピー用 Markdown と日次リザルト。画面の copy.ts / result.ts と同じ定義。
use chrono::{Duration, NaiveDate};
use serde_json::{json, Value};

use crate::model::{body_of, dfs_ids, id_of, is_must, status_of, str_field, tasks_of};
use crate::settings::{effective_settings, is_iso_day, language_of};
use crate::tags::tag_name;

pub fn export_markdown(data: &Value, query: &[(String, String)]) -> Result<Value, (u16, String)> {
    let target = query
        .iter()
        .find(|(key, _)| key == "target")
        .map(|(_, value)| value.as_str())
        .ok_or_else(|| (400, "target is required".to_string()))?;
    if !matches!(target, "today" | "all" | "todo") {
        return Err((400, "target must be today, all, or todo".into()));
    }
    let settings = effective_settings(data);
    let grouping = query_bool(query, "grouping").unwrap_or_else(|| {
        settings
            .get("copyGroupingEnabled")
            .and_then(Value::as_bool)
            .unwrap_or(true)
    });
    let include_url = query_bool(query, "url").unwrap_or_else(|| {
        settings
            .get("urlEnabled")
            .and_then(Value::as_bool)
            .unwrap_or(true)
    });
    let lang = query
        .iter()
        .find(|(key, _)| key == "lang")
        .map(|(_, value)| value.clone())
        .unwrap_or_else(|| language_of(data));
    if !matches!(lang.as_str(), "ja" | "en") {
        return Err((400, "lang must be ja or en".into()));
    }
    let today = query
        .iter()
        .find(|(key, _)| key == "date")
        .map(|(_, value)| value.clone())
        .unwrap_or_else(crate::model::local_today);
    if !is_iso_day(&today) {
        return Err((400, "date must be YYYY-MM-DD".into()));
    }
    let tasks = tasks_of(data);
    let tags = crate::model::tags_of(data);
    let markdown = match target {
        "today" => {
            let done = tasks
                .iter()
                .filter(|task| done_on(task, &today))
                .cloned()
                .collect::<Vec<_>>();
            let header = format!("## {today} {}\n\n", heading(&lang, "today"));
            render(&done, &tasks, &tags, include_url, grouping, &lang, &header, "-", false)
        }
        "all" => {
            let done = tasks
                .iter()
                .filter(|task| status_of(task) == "done")
                .cloned()
                .collect::<Vec<_>>();
            let header = format!("## {}\n\n", heading(&lang, "all"));
            render(&done, &tasks, &tags, include_url, grouping, &lang, &header, "-", false)
        }
        _ => {
            let todo = ordered_todos(&tasks);
            let header = format!("## {}\n\n", heading(&lang, "todo"));
            render(&todo, &tasks, &tags, include_url, grouping, &lang, &header, "- [ ]", true)
        }
    };
    Ok(json!({ "target": target, "markdown": markdown }))
}

fn render(
    rows: &[Value],
    all: &[Value],
    tags: &[Value],
    include_url: bool,
    grouping: bool,
    lang: &str,
    header: &str,
    prefix: &str,
    with_depth: bool,
) -> String {
    if !grouping {
        if rows.is_empty() {
            return header.to_string();
        }
        let lines = rows
            .iter()
            .map(|task| {
                let indent = if with_depth {
                    "  ".repeat(task_depth(task, all))
                } else {
                    String::new()
                };
                format!("{indent}{prefix} {}", line_of(task, tags, include_url))
            })
            .collect::<Vec<_>>()
            .join("\n");
        return format!("{header}{lines}\n");
    }
    let mut keys = Vec::new();
    let mut groups: Vec<(String, Vec<Value>)> = Vec::new();
    for task in rows {
        let key = str_field(task, "projectName").unwrap_or("__none__").to_string();
        if let Some((_, items)) = groups.iter_mut().find(|(name, _)| name == &key) {
            items.push(task.clone());
        } else {
            keys.push(key.clone());
            groups.push((key, vec![task.clone()]));
        }
    }
    let mut named: Vec<String> = keys.into_iter().filter(|key| key != "__none__").collect();
    named.sort();
    let mut lines = Vec::new();
    for key in named {
        lines.push(format!("### {key}"));
        if let Some((_, items)) = groups.iter().find(|(name, _)| name == &key) {
            for task in items {
                lines.push(prefixed(task, all, tags, include_url, prefix, with_depth));
            }
        }
        lines.push(String::new());
    }
    if let Some((_, items)) = groups.iter().find(|(name, _)| name == "__none__") {
        lines.push(format!("### {}", if lang == "en" { "Uncategorized" } else { "未分類" }));
        for task in items {
            lines.push(prefixed(task, all, tags, include_url, prefix, with_depth));
        }
        lines.push(String::new());
    }
    format!("{header}{}\n", lines.join("\n").trim_end())
}

fn prefixed(task: &Value, all: &[Value], tags: &[Value], include_url: bool, prefix: &str, with_depth: bool) -> String {
    let indent = if with_depth {
        "  ".repeat(task_depth(task, all))
    } else {
        String::new()
    };
    format!("{indent}{prefix} {}", line_of(task, tags, include_url))
}

fn line_of(task: &Value, tags: &[Value], include_url: bool) -> String {
    let mut line = body_of(task);
    let labels = task
        .get("tags")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str())
                .filter_map(|id| tag_name(tags, id))
                .map(|name| format!("#{name}"))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if !labels.is_empty() {
        line.push(' ');
        line.push_str(&labels.join(" "));
    }
    if include_url {
        if let Some(url) = str_field(task, "url") {
            line.push_str("  ");
            line.push_str(url);
        }
    }
    line
}

fn heading(lang: &str, kind: &str) -> &'static str {
    match (lang, kind) {
        ("en", "today") => "Completed Tasks",
        ("en", "all") => "All Completed Tasks",
        ("en", "todo") => "Todo Tasks",
        (_, "all") => "全完了タスク",
        (_, "todo") => "未完了タスク",
        _ => "完了タスク",
    }
}

fn done_on(task: &Value, day: &str) -> bool {
    status_of(task) == "done"
        && task
            .get("completedAt")
            .and_then(Value::as_str)
            .is_some_and(|stamp| stamp.len() >= 10 && &stamp[..10] == day)
}

fn ordered_todos(tasks: &[Value]) -> Vec<Value> {
    let todos: Vec<Value> = tasks
        .iter()
        .filter(|task| status_of(task) == "todo")
        .cloned()
        .collect();
    dfs_ids(&todos)
        .into_iter()
        .filter_map(|id| todos.iter().find(|task| id_of(task) == Some(id.as_str())).cloned())
        .collect()
}

fn task_depth(task: &Value, tasks: &[Value]) -> usize {
    let Some(id) = id_of(task) else { return 0 };
    crate::model::depth(tasks, id)
}

pub fn daily_result(data: &Value, query: &[(String, String)]) -> Result<Value, (u16, String)> {
    let date = query
        .iter()
        .find(|(key, _)| key == "date")
        .map(|(_, value)| value.clone())
        .unwrap_or_else(crate::model::local_today);
    if !is_iso_day(&date) {
        return Err((400, "date must be YYYY-MM-DD".into()));
    }
    let focus = data
        .get("settings")
        .and_then(|settings| settings.get("focusMinutesByDate"))
        .and_then(|map| map.get(&date))
        .and_then(Value::as_f64)
        .unwrap_or(0.0);
    let tasks = tasks_of(data);
    let tags = crate::model::tags_of(data);
    let mut result = compute(&tasks, &tags, focus, &date);
    let lang = language_of(data);
    let share = share_text(&result, &lang);
    if let Some(object) = result.as_object_mut() {
        object.insert("shareText".into(), json!(share));
    }
    Ok(result)
}

fn compute(tasks: &[Value], tags: &[Value], focus_minutes: f64, today: &str) -> Value {
    let done_today: Vec<&Value> = tasks.iter().filter(|task| done_on(task, today)).collect();
    let completed = done_today.len();
    let must_done = done_today
        .iter()
        .filter(|task| task.get("isMinimum").and_then(Value::as_bool) == Some(true))
        .count();
    let must_remaining = tasks
        .iter()
        .filter(|task| status_of(task) == "todo" && is_must(task, today))
        .count();
    let must_total = must_done + must_remaining;
    let rate_target = completed + must_remaining;
    let rate = if rate_target == 0 {
        if completed > 0 { 100 } else { 0 }
    } else {
        ((completed as f64 / rate_target as f64) * 100.0).round() as i64
    };
    let projects: Vec<String> = done_today.iter().filter_map(|task| str_field(task, "projectName").map(str::to_string)).collect();
    let top_project = mode_strings(&projects).map(|(name, count)| json!({ "name": name, "count": count }));
    let tag_ids: Vec<String> = done_today
        .iter()
        .flat_map(|task| {
            task.get("tags")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|item| item.as_str().map(str::to_string))
        })
        .collect();
    let top_tag = mode_strings(&tag_ids).and_then(|(id, count)| {
        tag_name(tags, &id).map(|name| json!({ "name": name, "count": count }))
    });
    let mut by_day: Vec<(String, usize)> = Vec::new();
    for task in tasks {
        if status_of(task) != "done" {
            continue;
        }
        let Some(stamp) = task.get("completedAt").and_then(Value::as_str) else {
            continue;
        };
        if stamp.len() < 10 {
            continue;
        }
        let day = stamp[..10].to_string();
        if let Some((_, count)) = by_day.iter_mut().find(|(key, _)| key == &day) {
            *count += 1;
        } else {
            by_day.push((day, 1));
        }
    }
    let count_on = |day: &str| by_day.iter().find(|(key, _)| key == day).map(|(_, count)| *count).unwrap_or(0);
    let mut streak = 0usize;
    let mut cursor = if count_on(today) > 0 {
        today.to_string()
    } else {
        shift_day(today, -1)
    };
    while count_on(&cursor) > 0 {
        streak += 1;
        cursor = shift_day(&cursor, -1);
        if streak > 3660 {
            break;
        }
    }
    let week: Vec<Value> = (0..7)
        .map(|index| {
            let date = shift_day(today, index - 6);
            json!({ "date": date, "count": count_on(&date) })
        })
        .collect();
    let distinct = {
        let mut names = projects.clone();
        names.sort();
        names.dedup();
        names.len()
    };
    let share = top_project
        .as_ref()
        .and_then(|value| value.get("count"))
        .and_then(Value::as_u64)
        .map(|count| if completed == 0 { 0.0 } else { count as f64 / completed as f64 })
        .unwrap_or(0.0);
    let kind = diagnose(completed, must_done, must_remaining, focus_minutes, share, distinct, streak);
    json!({
        "date": today,
        "completedCount": completed,
        "rate": rate,
        "rateTarget": rate_target,
        "focusMinutes": focus_minutes,
        "mustDone": must_done,
        "mustRemaining": must_remaining,
        "mustTotal": must_total,
        "mustAllClear": must_done > 0 && must_remaining == 0,
        "topProject": top_project.unwrap_or(Value::Null),
        "topTag": top_tag.unwrap_or(Value::Null),
        "streak": streak,
        "week": week,
        "type": kind,
    })
}

fn mode_strings(values: &[String]) -> Option<(String, usize)> {
    let mut counts: Vec<(String, usize)> = Vec::new();
    for value in values {
        if let Some((_, count)) = counts.iter_mut().find(|(key, _)| key == value) {
            *count += 1;
        } else {
            counts.push((value.clone(), 1));
        }
    }
    let mut best: Option<(String, usize)> = None;
    for (value, count) in counts {
        if best.as_ref().is_none_or(|(_, best_count)| count > *best_count) {
            best = Some((value, count));
        }
    }
    best
}

fn diagnose(
    completed: usize,
    must_done: usize,
    must_remaining: usize,
    focus: f64,
    top_share: f64,
    distinct: usize,
    streak: usize,
) -> Value {
    let kind = if completed == 0 {
        ("WARMING UP", "ウォーミングアップ", "今日はまだこれから。最初の一件を片付けよう。", "Warming Up", "Nothing done yet today. Clear the first one.")
    } else if must_remaining == 0 && must_done >= 2 {
        ("MUST HUNTER", "MUSTハンター", "最優先タスクを全部仕留めた日。", "Must Hunter", "You hunted down every top-priority task.")
    } else if focus >= 90.0 && completed >= 3 {
        ("DEEP FOCUSER", "集中型", "長い集中で押し切った日。", "Deep Focuser", "Long focus sessions carried the day.")
    } else if completed >= 4 && top_share >= 0.6 {
        ("SINGLE FOCUS", "一点集中型", "一つのプロジェクトに絞って進めた日。", "Single Focus", "You drilled into one project.")
    } else if completed >= 10 {
        ("SPRINTER", "大量処理型", "件数で圧倒した日。", "Sprinter", "Sheer volume won the day.")
    } else if distinct >= 3 {
        ("MULTI PLAYER", "並行型", "複数プロジェクトをバランスよく回した日。", "Multi Player", "You juggled several projects in balance.")
    } else if streak >= 3 {
        ("STREAK KEEPER", "継続型", "連続記録を守り抜いた日。", "Streak Keeper", "You kept the streak alive.")
    } else {
        ("STEADY", "安定型", "着実に積み上げた日。", "Steady", "A solid, steady day.")
    };
    json!({
        "code": kind.0,
        "ja": kind.1,
        "commentJa": kind.2,
        "en": kind.3,
        "commentEn": kind.4,
    })
}

fn share_text(result: &Value, lang: &str) -> String {
    let date = result.get("date").and_then(Value::as_str).unwrap_or("");
    let completed = result.get("completedCount").and_then(Value::as_u64).unwrap_or(0);
    let rate = result.get("rate").and_then(Value::as_i64).unwrap_or(0);
    let focus = format_focus(result.get("focusMinutes").and_then(Value::as_f64).unwrap_or(0.0));
    let must_total = result.get("mustTotal").and_then(Value::as_u64).unwrap_or(0);
    let must_done = result.get("mustDone").and_then(Value::as_u64).unwrap_or(0);
    let clear = result.get("mustAllClear").and_then(Value::as_bool).unwrap_or(false);
    let streak = result.get("streak").and_then(Value::as_u64).unwrap_or(0);
    let code = result.get("type").and_then(|kind| kind.get("code")).and_then(Value::as_str).unwrap_or("");
    let comment = if lang == "en" {
        result.get("type").and_then(|kind| kind.get("commentEn")).and_then(Value::as_str).unwrap_or("")
    } else {
        result.get("type").and_then(|kind| kind.get("commentJa")).and_then(Value::as_str).unwrap_or("")
    };
    let project = result
        .get("topProject")
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str);
    let must_line = if must_total == 0 {
        "MUST -".to_string()
    } else if lang == "en" {
        if clear {
            "MUST: ALL CLEAR".to_string()
        } else {
            format!("MUST: {must_done}/{must_total}")
        }
    } else if clear {
        "MUST 全クリア".to_string()
    } else {
        format!("MUST {must_done}/{must_total}")
    };
    if lang == "en" {
        let mut lines = vec![
            format!("FastTask RESULT {date}"),
            format!("Completed: {completed} (Rate {rate}%)"),
            format!("Focus: {focus}"),
            must_line,
        ];
        if let Some(name) = project {
            lines.push(format!("Top project: {name}"));
        }
        if streak > 0 {
            let unit = if streak > 1 { "s" } else { "" };
            lines.push(format!("Streak: {streak} day{unit}"));
        }
        lines.push(format!("Type: {code} - {comment}"));
        lines.join("\n")
    } else {
        let mut lines = vec![
            format!("FastTask RESULT {date}"),
            format!("完了 {completed}件（達成率 {rate}%）"),
            format!("フォーカス {focus}"),
            must_line,
        ];
        if let Some(name) = project {
            lines.push(format!("トッププロジェクト: {name}"));
        }
        if streak > 0 {
            lines.push(format!("連続 {streak}日"));
        }
        lines.push(format!("今日のタイプ: {code}（{comment}）"));
        lines.join("\n")
    }
}

pub fn format_focus(minutes: f64) -> String {
    let total = minutes.round().max(0.0) as i64;
    let hours = total / 60;
    let mins = total % 60;
    format!("{hours}:{mins:02}")
}

fn shift_day(day: &str, delta: i64) -> String {
    let Some(date) = NaiveDate::parse_from_str(day, "%Y-%m-%d").ok() else {
        return day.to_string();
    };
    (date + Duration::days(delta)).format("%Y-%m-%d").to_string()
}

fn query_bool(query: &[(String, String)], key: &str) -> Option<bool> {
    let value = query.iter().find(|(name, _)| name == key)?.1.as_str();
    match value {
        "true" | "1" => Some(true),
        "false" | "0" => Some(false),
        _ => None,
    }
}
