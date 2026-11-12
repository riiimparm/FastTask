use std::path::Path;

use serde_json::{json, Value};

use crate::google_file;
use crate::model::{err, load, parse_object, percent_decode, put_tags, query_pairs, save, tags_of, tasks_of, ApiResult, Change, Outcome};
use crate::settings::{add_focus, effective_settings, patch_settings};
use crate::tags::{apply_keywords, string_list};
use crate::tasks::{
    clear_data, create_batch, create_task, delete_ids, get_task, list_tasks, reorder_projects,
    reorder_tasks, set_status, update_task,
};
use crate::view::{daily_result, export_markdown};

pub fn dispatch(dir: &Path, method: &str, path: &str, query: &str, body: &str) -> ApiResult<Outcome> {
    let segments: Vec<String> = path
        .trim_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(|segment| percent_decode(segment))
        .collect();
    let query = query_pairs(query);
    let segment_refs: Vec<&str> = segments.iter().map(String::as_str).collect();
    match (method, segment_refs.as_slice()) {
        ("GET", ["tasks"]) => read(dir, |data| list_tasks(data, &query)),
        ("POST", ["tasks"]) => write(dir, |data| create_task(data, &parse_object(body)?)),
        ("POST", ["tasks", "batch"]) => write(dir, |data| create_batch(data, &parse_object(body)?)),
        ("POST", ["tasks", "reorder"]) => write(dir, |data| {
            let body = parse_object(body)?;
            let ids = string_ids(&body, "ids")?;
            reorder_tasks(data, &ids)
        }),
        ("POST", ["tasks", "status"]) => write(dir, |data| set_status(data, &parse_object(body)?)),
        ("POST", ["tasks", "delete"]) => write(dir, |data| {
            let body = parse_object(body)?;
            let ids = ids_from(&body)?;
            delete_ids(data, &ids)
        }),
        ("GET", ["tasks", id]) => {
            let id = (*id).to_string();
            read(dir, |data| get_task(data, &id))
        }
        ("PATCH", ["tasks", id]) => {
            let id = (*id).to_string();
            write(dir, |data| update_task(data, &id, &parse_object(body)?))
        }
        ("DELETE", ["tasks", id]) => {
            let id = (*id).to_string();
            write(dir, |data| delete_ids(data, &[id]))
        }
        ("POST", ["projects", "reorder"]) => write(dir, |data| {
            let body = parse_object(body)?;
            let projects = project_order(&body)?;
            reorder_projects(data, &projects)
        }),
        ("GET", ["tags"]) => read(dir, |data| Ok(json!({ "tags": tags_of(data) }))),
        ("POST", ["tags"]) => write(dir, |data| save_tag(data, None, &parse_object(body)?)),
        ("PATCH", ["tags", id]) => {
            let id = (*id).to_string();
            write(dir, |data| save_tag(data, Some(&id), &parse_object(body)?))
        }
        ("DELETE", ["tags", id]) => {
            let id = (*id).to_string();
            write(dir, |data| delete_tag(data, &id))
        }
        ("GET", ["settings"]) => read(dir, |data| Ok(effective_settings(data))),
        ("PATCH", ["settings"]) => write(dir, |data| patch_settings(data, &parse_object(body)?)),
        ("GET", ["export"]) => read(dir, |data| export_markdown(data, &query)),
        ("GET", ["result"]) => read(dir, |data| daily_result(data, &query)),
        ("POST", ["focus"]) => write(dir, |data| {
            let body = parse_object(body)?;
            let minutes = body
                .get("minutes")
                .and_then(Value::as_f64)
                .ok_or_else(|| err(400, "minutes must be a number"))?;
            let date = body
                .get("date")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(crate::model::local_today);
            add_focus(data, minutes, &date)
        }),
        ("POST", ["data", "clear"]) => write(dir, |data| clear_data(data, &parse_object(body)?)),
        ("GET", ["google"]) => {
            let body = google_file::public_config(dir)?;
            Ok(Outcome {
                body,
                changed: Change::None,
            })
        }
        ("PATCH", ["google"]) => {
            let body = google_file::patch_config(dir, &parse_object(body)?)?;
            Ok(Outcome {
                body,
                changed: Change::Google,
            })
        }
        ("POST", ["google", "push"]) => Err(err(501, "google push runs inside the FastTask app")),
        ("GET", ["google", "tasklists"]) => {
            Err(err(501, "google task lists are available inside the FastTask app"))
        }
        _ => Err(err(404, "not found")),
    }
}

fn read(dir: &Path, run: impl FnOnce(&Value) -> ApiResult<Value>) -> ApiResult<Outcome> {
    let data = load(dir)?;
    Ok(Outcome {
        body: run(&data)?,
        changed: Change::None,
    })
}

fn write(dir: &Path, run: impl FnOnce(&mut Value) -> ApiResult<Value>) -> ApiResult<Outcome> {
    let mut data = load(dir)?;
    let body = run(&mut data)?;
    if data.get("version").and_then(Value::as_str).is_none() {
        data["version"] = json!("1");
    }
    save(dir, &data)?;
    Ok(Outcome {
        body,
        changed: Change::Data,
    })
}

fn string_ids(body: &Value, field: &str) -> ApiResult<Vec<String>> {
    string_list(body, field)
}

fn ids_from(body: &Value) -> ApiResult<Vec<String>> {
    let mut ids = Vec::new();
    if let Some(id) = body.get("id").and_then(Value::as_str) {
        ids.push(id.to_string());
    }
    if body.get("ids").is_some() {
        ids.extend(string_list(body, "ids")?);
    }
    if ids.is_empty() {
        return Err(err(400, "id or ids is required"));
    }
    Ok(ids)
}

fn project_order(body: &Value) -> ApiResult<Vec<Option<String>>> {
    let Some(items) = body.get("projects").and_then(Value::as_array) else {
        return Err(err(400, "projects must be an array"));
    };
    let mut projects = Vec::new();
    for item in items {
        match item {
            Value::Null => projects.push(None),
            Value::String(name) => {
                let name = name.trim();
                if name.is_empty() || name == "none" || name == "__none__" {
                    projects.push(None);
                } else {
                    projects.push(Some(name.to_string()));
                }
            }
            _ => return Err(err(400, "projects must be strings or null")),
        }
    }
    Ok(projects)
}

fn id_of_tag(tag: &Value) -> Option<&str> {
    tag.get("id").and_then(Value::as_str).filter(|id| !id.is_empty())
}

fn save_tag(data: &mut Value, id: Option<&str>, body: &Value) -> ApiResult<Value> {
    let mut tags = tags_of(data);
    let mut tasks = tasks_of(data);
    let existing = id.and_then(|id| tags.iter().position(|tag| id_of_tag(tag) == Some(id)));
    if id.is_some() && existing.is_none() {
        return Err(err(404, "tag not found"));
    }
    let current = existing.map(|index| tags[index].clone());
    let name = match body.get("name") {
        Some(Value::String(name)) => {
            let name = name.trim();
            if name.is_empty() || name.chars().count() > 100 {
                return Err(err(400, "name must be a non-empty string"));
            }
            name.to_string()
        }
        Some(_) => return Err(err(400, "name must be a non-empty string")),
        None => current
            .as_ref()
            .and_then(|tag| tag.get("name").and_then(Value::as_str))
            .ok_or_else(|| err(400, "name is required"))?
            .to_string(),
    };
    let color = match body.get("color") {
        Some(Value::String(color)) => {
            let color = color.trim();
            if color.is_empty() || color.chars().count() > 32 {
                return Err(err(400, "color is invalid"));
            }
            color.to_string()
        }
        Some(_) => return Err(err(400, "color must be a string")),
        None => current
            .as_ref()
            .and_then(|tag| tag.get("color").and_then(Value::as_str))
            .unwrap_or("#8E8E93")
            .to_string(),
    };
    let keywords = if body.get("keywords").is_some() {
        string_list(body, "keywords")?
    } else {
        current
            .as_ref()
            .and_then(|tag| tag.get("keywords"))
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default()
    };
    let id = id
        .map(str::to_string)
        .or_else(|| current.as_ref().and_then(|tag| id_of_tag(tag).map(str::to_string)))
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let tag = json!({
        "id": id,
        "name": name,
        "color": color,
        "keywords": keywords,
    });
    if let Some(index) = existing {
        tags[index] = tag.clone();
    } else {
        tags.push(tag.clone());
    }
    apply_keywords(&mut tasks, &tag);
    put_tags(data, tags);
    crate::model::put_tasks(data, tasks);
    Ok(tag)
}

fn delete_tag(data: &mut Value, id: &str) -> ApiResult<Value> {
    crate::model::require_id(id)?;
    let mut tags = tags_of(data);
    let before = tags.len();
    tags.retain(|tag| id_of_tag(tag) != Some(id));
    if tags.len() == before {
        return Err(err(404, "tag not found"));
    }
    let mut tasks = tasks_of(data);
    for task in &mut tasks {
        if let Some(items) = task.get_mut("tags").and_then(|value| value.as_array_mut()) {
            items.retain(|item| item.as_str() != Some(id));
        }
    }
    put_tags(data, tags);
    crate::model::put_tasks(data, tasks);
    Ok(json!({ "deleted": id }))
}
