use serde_json::{json, Value};

use crate::model::{err, id_of, str_field, ApiResult};

pub fn resolve_tag(tags: &[Value], raw: &str) -> String {
    if tags.iter().any(|tag| id_of(tag) == Some(raw)) {
        return raw.to_string();
    }
    if let Some(tag) = tags.iter().find(|tag| tag.get("name").and_then(Value::as_str) == Some(raw)) {
        if let Some(id) = id_of(tag) {
            return id.to_string();
        }
    }
    let lower = raw.to_lowercase();
    if let Some(tag) = tags.iter().find(|tag| {
        tag.get("name")
            .and_then(Value::as_str)
            .is_some_and(|name| name.to_lowercase() == lower)
    }) {
        if let Some(id) = id_of(tag) {
            return id.to_string();
        }
    }
    raw.to_string()
}

pub fn resolve_tags(tags: &[Value], raw: &[Value]) -> ApiResult<Vec<Value>> {
    let mut out = Vec::new();
    for item in raw {
        let Some(text) = item.as_str() else {
            return Err(err(400, "tags must be an array of strings"));
        };
        out.push(json!(resolve_tag(tags, text)));
    }
    Ok(out)
}

/// 既存の並びを保ったまま、新しく付いたタグだけ末尾に足す。
pub fn merge_tags(existing: &[Value], extra: &[String]) -> Vec<Value> {
    let mut out: Vec<String> = existing
        .iter()
        .filter_map(|value| value.as_str().map(str::to_string))
        .collect();
    for id in extra {
        if !out.iter().any(|current| current == id) {
            out.push(id.clone());
        }
    }
    out.into_iter().map(|id| json!(id)).collect()
}

pub fn auto_ids(body: &str, tags: &[Value]) -> Vec<String> {
    let lower = body.to_lowercase();
    let mut matched = Vec::new();
    for tag in tags {
        let Some(id) = id_of(tag) else { continue };
        let Some(keywords) = tag.get("keywords").and_then(Value::as_array) else {
            continue;
        };
        for keyword in keywords {
            let Some(keyword) = keyword.as_str().filter(|word| !word.is_empty()) else {
                continue;
            };
            if lower.contains(&keyword.to_lowercase()) {
                matched.push(id.to_string());
                break;
            }
        }
    }
    matched
}

pub fn apply_keywords(tasks: &mut [Value], tag: &Value) {
    let Some(id) = id_of(tag) else { return };
    let Some(keywords) = tag.get("keywords").and_then(Value::as_array) else {
        return;
    };
    for task in tasks.iter_mut() {
        let body = crate::model::body_of(task);
        let lower = body.to_lowercase();
        let matches = keywords.iter().any(|keyword| {
            keyword
                .as_str()
                .is_some_and(|word| !word.is_empty() && lower.contains(&word.to_lowercase()))
        });
        if !matches {
            continue;
        }
        let mut current = task
            .get("tags")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if current.iter().any(|item| item.as_str() == Some(id)) {
            continue;
        }
        current.push(json!(id));
        task["tags"] = Value::Array(current);
    }
}

pub fn string_list(value: &Value, field: &str) -> ApiResult<Vec<String>> {
    let Some(items) = value.get(field) else {
        return Err(err(400, format!("{field} is required")));
    };
    let Some(items) = items.as_array() else {
        return Err(err(400, format!("{field} must be an array of strings")));
    };
    let mut out = Vec::new();
    for item in items {
        let Some(text) = item.as_str().map(str::trim).filter(|text| !text.is_empty()) else {
            return Err(err(400, format!("{field} must be an array of strings")));
        };
        if text.chars().count() > 100 {
            return Err(err(400, format!("{field} item is too long")));
        }
        out.push(text.to_string());
    }
    if out.len() > 50 {
        return Err(err(400, format!("too many {field}")));
    }
    Ok(out)
}

pub fn tag_name<'a>(tags: &'a [Value], id: &str) -> Option<&'a str> {
    tags.iter()
        .find(|tag| id_of(tag) == Some(id))
        .and_then(|tag| str_field(tag, "name"))
}
