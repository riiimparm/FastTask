use std::collections::HashSet;
use std::fs;
use std::path::Path;

use serde_json::{json, Map, Value};

pub type ApiError = (u16, String);
pub type ApiResult<T> = Result<T, ApiError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Change {
    None,
    Data,
    Google,
}

#[derive(Debug)]
pub struct Outcome {
    pub body: Value,
    pub changed: Change,
}

pub fn err(code: u16, msg: impl Into<String>) -> ApiError {
    (code, msg.into())
}

pub fn load(dir: &Path) -> ApiResult<Value> {
    let path = dir.join("data.json");
    if !path.exists() {
        return Ok(json!({ "tasks": [], "tags": [], "version": "1" }));
    }
    let text = fs::read_to_string(&path).map_err(|e| err(500, format!("read error: {e}")))?;
    let value: Value =
        serde_json::from_str(&text).map_err(|e| err(500, format!("parse error: {e}")))?;
    if !value.is_object() {
        return Err(err(500, "data.json must be an object"));
    }
    Ok(value)
}

pub fn save(dir: &Path, data: &Value) -> ApiResult<()> {
    fs::create_dir_all(dir).map_err(|e| err(500, format!("mkdir error: {e}")))?;
    let tmp = dir.join("data.json.tmp");
    let text =
        serde_json::to_string_pretty(data).map_err(|e| err(500, format!("serialize: {e}")))?;
    fs::write(&tmp, text).map_err(|e| err(500, format!("write error: {e}")))?;
    fs::rename(&tmp, dir.join("data.json")).map_err(|e| err(500, format!("rename error: {e}")))?;
    Ok(())
}

pub fn tasks_of(data: &Value) -> Vec<Value> {
    data.get("tasks")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

pub fn tags_of(data: &Value) -> Vec<Value> {
    data.get("tags")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

pub fn put_tasks(data: &mut Value, tasks: Vec<Value>) {
    data["tasks"] = Value::Array(tasks);
}

pub fn put_tags(data: &mut Value, tags: Vec<Value>) {
    data["tags"] = Value::Array(tags);
}

pub fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub fn local_today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

pub fn id_of(task: &Value) -> Option<&str> {
    task.get("id").and_then(Value::as_str).filter(|s| !s.is_empty())
}

pub fn str_field<'a>(task: &'a Value, key: &str) -> Option<&'a str> {
    task.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
}

pub fn status_of(task: &Value) -> &str {
    task.get("status").and_then(Value::as_str).unwrap_or("")
}

pub fn order_of(task: &Value) -> i64 {
    task.get("order").and_then(Value::as_i64).unwrap_or(0)
}

pub fn body_of(task: &Value) -> String {
    let title = task.get("title").and_then(Value::as_str).unwrap_or("");
    if let Some(project) = str_field(task, "projectName") {
        let prefix = format!(":{project} ");
        if let Some(rest) = title.strip_prefix(&prefix) {
            return rest.to_string();
        }
    }
    title.to_string()
}

pub fn find_index(tasks: &[Value], id: &str) -> Option<usize> {
    tasks.iter().position(|task| id_of(task) == Some(id))
}

pub fn require_id(id: &str) -> ApiResult<()> {
    if id.is_empty() || id.len() > 200 || id.contains('/') || id == "." || id == ".." {
        return Err(err(400, "invalid id"));
    }
    Ok(())
}

pub fn parse_object(body: &str) -> ApiResult<Value> {
    let value: Value =
        serde_json::from_str(body).map_err(|e| err(400, format!("invalid json: {e}")))?;
    if !value.is_object() {
        return Err(err(400, "body must be a JSON object"));
    }
    Ok(value)
}

pub fn object_mut(value: &mut Value) -> ApiResult<&mut Map<String, Value>> {
    value
        .as_object_mut()
        .ok_or_else(|| err(500, "expected object"))
}

pub fn descendants(tasks: &[Value], id: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut queue = vec![id.to_string()];
    let mut seen = HashSet::new();
    seen.insert(id.to_string());
    while let Some(current) = queue.pop() {
        for task in tasks {
            if task.get("parentId").and_then(Value::as_str) == Some(current.as_str()) {
                if let Some(child) = id_of(task) {
                    if seen.insert(child.to_string()) {
                        result.push(child.to_string());
                        queue.push(child.to_string());
                    }
                }
            }
        }
    }
    result
}

pub fn depth(tasks: &[Value], id: &str) -> usize {
    let mut depth = 0usize;
    let mut current = id.to_string();
    let mut seen = HashSet::new();
    while seen.insert(current.clone()) {
        let Some(task) = tasks.iter().find(|task| id_of(task) == Some(current.as_str())) else {
            break;
        };
        let Some(parent) = task
            .get("parentId")
            .and_then(Value::as_str)
            .filter(|parent| !parent.is_empty())
        else {
            break;
        };
        if tasks.iter().all(|task| id_of(task) != Some(parent)) {
            break;
        }
        depth += 1;
        current = parent.to_string();
    }
    depth
}

pub fn is_must(task: &Value, today: &str) -> bool {
    if task.get("isMinimum").and_then(Value::as_bool) == Some(true) {
        return true;
    }
    status_of(task) == "todo" && task.get("dueDate").and_then(Value::as_str) == Some(today)
}

pub fn bool_flag(data: &Value, key: &str, default: bool) -> bool {
    data.get("settings")
        .and_then(|settings| settings.get(key))
        .and_then(Value::as_bool)
        .unwrap_or(default)
}

pub fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or(""),
                16,
            ) {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub fn query_pairs(query: &str) -> Vec<(String, String)> {
    url::form_urlencoded::parse(query.as_bytes())
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect()
}

pub fn next_todo_order(tasks: &[Value]) -> i64 {
    tasks
        .iter()
        .filter(|task| status_of(task) == "todo")
        .map(order_of)
        .max()
        .map_or(0, |max| max + 1)
}

/// 未完了タスクを画面と同じ親子順に並べ、order を振り直す。
pub fn reassign_todo_order(tasks: &mut [Value]) {
    let todos: Vec<Value> = tasks
        .iter()
        .filter(|task| status_of(task) == "todo")
        .cloned()
        .collect();
    let ordered = dfs_ids(&todos);
    for (index, id) in ordered.into_iter().enumerate() {
        if let Some(task) = tasks.iter_mut().find(|task| id_of(task) == Some(id.as_str())) {
            task["order"] = json!(index as i64);
        }
    }
}

pub fn dfs_ids(tasks: &[Value]) -> Vec<String> {
    let ids: HashSet<String> = tasks.iter().filter_map(|task| id_of(task).map(str::to_string)).collect();
    let mut groups: Vec<(Option<String>, Vec<(i64, String)>)> = Vec::new();
    for task in tasks {
        let Some(id) = id_of(task) else { continue };
        let parent = task
            .get("parentId")
            .and_then(Value::as_str)
            .filter(|parent| ids.contains(*parent))
            .map(str::to_string);
        let entry = (order_of(task), id.to_string());
        if let Some((_, children)) = groups.iter_mut().find(|(key, _)| key == &parent) {
            children.push(entry);
        } else {
            groups.push((parent, vec![entry]));
        }
    }
    for (_, children) in &mut groups {
        children.sort_by_key(|(order, _)| *order);
    }
    let mut result = Vec::new();
    fn walk(
        parent: Option<&str>,
        groups: &[(Option<String>, Vec<(i64, String)>)],
        result: &mut Vec<String>,
    ) {
        let Some((_, children)) = groups.iter().find(|(key, _)| match (key, parent) {
            (None, None) => true,
            (Some(key), Some(parent)) => key == parent,
            _ => false,
        }) else {
            return;
        };
        for (_, id) in children {
            result.push(id.clone());
            walk(Some(id), groups, result);
        }
    }
    walk(None, &groups, &mut result);
    result
}
