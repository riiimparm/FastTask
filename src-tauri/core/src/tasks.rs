use std::collections::HashSet;

use chrono::NaiveDate;
use serde_json::{json, Value};

use crate::model::{
    body_of, depth, descendants, err, find_index, id_of, is_must, next_todo_order, now_rfc3339,
    object_mut, order_of, put_tasks, reassign_todo_order, require_id, status_of, str_field,
    tasks_of, ApiResult,
};
use crate::parse::{materialize, prepare_line, split_tasks};
use crate::settings::{is_iso_day, url_enabled};
use crate::tags::{auto_ids, merge_tags, resolve_tag, resolve_tags, tag_name};

pub fn list_tasks(data: &Value, query: &[(String, String)]) -> ApiResult<Value> {
    let today = crate::model::local_today();
    let tags = crate::model::tags_of(data);
    let mut tasks = tasks_of(data);
    let mut status: Option<String> = None;
    let mut keywords = Vec::new();
    let mut project: Option<String> = None;
    let mut tag_ids = Vec::new();
    let mut due: Option<String> = None;
    let mut must: Option<bool> = None;
    let mut pending: Option<bool> = None;
    let mut parent: Option<String> = None;
    let mut ui_order = false;
    for (key, value) in query {
        match key.as_str() {
            "status" => {
                if value != "todo" && value != "done" {
                    return Err(err(400, "status must be todo or done"));
                }
                status = Some(value.clone());
            }
            "q" => {
                keywords.extend(
                    value
                        .split_whitespace()
                        .map(|word| word.to_lowercase())
                        .filter(|word| !word.is_empty()),
                );
            }
            "project" => project = Some(value.clone()),
            "tag" => tag_ids.push(resolve_tag(&tags, value)),
            "due" => {
                if !matches!(value.as_str(), "today" | "overdue" | "upcoming" | "none")
                    && !is_iso_day(value)
                {
                    return Err(err(400, "due must be today, overdue, upcoming, none, or YYYY-MM-DD"));
                }
                due = Some(value.clone());
            }
            "must" => must = Some(parse_bool(value, "must")?),
            "pending" => pending = Some(parse_bool(value, "pending")?),
            "parent" => parent = Some(value.clone()),
            "order" if value == "ui" => ui_order = true,
            _ => {}
        }
    }
    tasks.retain(|task| task_matches(task, &tags, &today, status.as_deref(), &keywords, project.as_deref(), &tag_ids, due.as_deref(), must, pending, parent.as_deref()));
    if ui_order {
        tasks = ui_sorted(tasks);
    }
    let count = tasks.len();
    Ok(json!({ "tasks": tasks, "count": count }))
}

fn task_matches(
    task: &Value,
    tags: &[Value],
    today: &str,
    status: Option<&str>,
    keywords: &[String],
    project: Option<&str>,
    tag_ids: &[String],
    due: Option<&str>,
    must: Option<bool>,
    pending: Option<bool>,
    parent: Option<&str>,
) -> bool {
    if let Some(status) = status {
        if status_of(task) != status {
            return false;
        }
    }
    if let Some(project) = project {
        let current = str_field(task, "projectName");
        let wants_none = project.is_empty() || project == "none" || project == "__none__";
        if wants_none {
            if current.is_some() {
                return false;
            }
        } else if current != Some(project) {
            return false;
        }
    }
    if !tag_ids.is_empty() {
        let owned = task.get("tags").and_then(Value::as_array);
        let hit = owned.is_some_and(|items| {
            items.iter().any(|item| item.as_str().is_some_and(|id| tag_ids.iter().any(|want| want == id)))
        });
        if !hit {
            return false;
        }
    }
    if let Some(due) = due {
        let value = task.get("dueDate").and_then(Value::as_str).filter(|text| !text.is_empty());
        let ok = match due {
            "none" => value.is_none(),
            "today" => value == Some(today),
            "overdue" => value.is_some_and(|day| day < today) && status_of(task) == "todo",
            "upcoming" => value.is_some_and(|day| day >= today),
            exact => value == Some(exact),
        };
        if !ok {
            return false;
        }
    }
    if let Some(must) = must {
        if is_must(task, today) != must {
            return false;
        }
    }
    if let Some(pending) = pending {
        let flag = task.get("isPending").and_then(Value::as_bool).unwrap_or(false);
        if flag != pending {
            return false;
        }
    }
    if let Some(parent) = parent {
        let current = task.get("parentId").and_then(Value::as_str).filter(|id| !id.is_empty());
        if parent == "none" || parent.is_empty() {
            if current.is_some() {
                return false;
            }
        } else if current != Some(parent) {
            return false;
        }
    }
    if !keywords.is_empty() {
        let body = body_of(task).to_lowercase();
        let project = str_field(task, "projectName").unwrap_or("").to_lowercase();
        let tag_text = task
            .get("tags")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str())
                    .map(|id| tag_name(tags, id).unwrap_or(""))
                    .collect::<Vec<_>>()
                    .join(" ")
                    .to_lowercase()
            })
            .unwrap_or_default();
        let haystack = format!("{body} {project} {tag_text}");
        if !keywords.iter().all(|word| haystack.contains(word)) {
            return false;
        }
    }
    true
}

fn ui_sorted(tasks: Vec<Value>) -> Vec<Value> {
    let mut todos: Vec<Value> = tasks.iter().filter(|task| status_of(task) == "todo").cloned().collect();
    let ids = crate::model::dfs_ids(&todos);
    let mut ordered = Vec::new();
    for id in ids {
        if let Some(index) = todos.iter().position(|task| id_of(task) == Some(id.as_str())) {
            ordered.push(todos.remove(index));
        }
    }
    ordered.extend(todos);
    let mut done: Vec<Value> = tasks.into_iter().filter(|task| status_of(task) != "todo").collect();
    done.sort_by(|a, b| {
        let left = a.get("completedAt").and_then(Value::as_str).unwrap_or("");
        let right = b.get("completedAt").and_then(Value::as_str).unwrap_or("");
        right.cmp(left)
    });
    ordered.extend(done);
    ordered
}

fn parse_bool(value: &str, field: &str) -> ApiResult<bool> {
    match value {
        "true" | "1" => Ok(true),
        "false" | "0" => Ok(false),
        _ => Err(err(400, format!("{field} must be true or false"))),
    }
}

pub fn get_task(data: &Value, id: &str) -> ApiResult<Value> {
    require_id(id)?;
    tasks_of(data)
        .into_iter()
        .find(|task| id_of(task) == Some(id))
        .ok_or_else(|| err(404, "task not found"))
}

pub fn create_task(data: &mut Value, body: &Value) -> ApiResult<Value> {
    let mut created = create_many(data, std::slice::from_ref(body))?;
    created.pop().ok_or_else(|| err(500, "create failed"))
}

pub fn create_batch(data: &mut Value, body: &Value) -> ApiResult<Value> {
    let has_text = body.get("text").is_some();
    let has_tasks = body.get("tasks").is_some();
    if has_text == has_tasks {
        return Err(err(400, "provide either text or tasks"));
    }
    let created = if has_text {
        create_from_text(data, body)?
    } else {
        let items = body
            .get("tasks")
            .and_then(Value::as_array)
            .ok_or_else(|| err(400, "tasks must be an array"))?;
        if items.len() > 100 {
            return Err(err(400, "too many tasks"));
        }
        create_many(data, items)?
    };
    Ok(json!({ "tasks": created }))
}

fn create_from_text(data: &mut Value, body: &Value) -> ApiResult<Vec<Value>> {
    let text = body
        .get("text")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| err(400, "title is required"))?;
    let today = NaiveDate::parse_from_str(&crate::model::local_today(), "%Y-%m-%d")
        .map_err(|_| err(500, "bad local date"))?;
    let prepared = prepare_line(text, today);
    let parts = split_tasks(&prepared.text);
    if parts.is_empty() {
        return Err(err(400, "title is required"));
    }
    if parts.len() > 100 {
        return Err(err(400, "too many tasks"));
    }
    let mut items = Vec::new();
    for part in parts {
        let mut item = json!({ "title": part, "parseInput": true });
        if let Some(due) = body.get("dueDate") {
            item["dueDate"] = due.clone();
        } else if let Some(due) = &prepared.due {
            item["dueDate"] = json!(due);
        }
        for key in ["url", "tags", "parentId", "isMinimum", "isPending", "projectName"] {
            if let Some(value) = body.get(key) {
                item[key] = value.clone();
            }
        }
        items.push(item);
    }
    create_many(data, &items)
}

fn create_many(data: &mut Value, items: &[Value]) -> ApiResult<Vec<Value>> {
    if items.is_empty() {
        return Err(err(400, "title is required"));
    }
    let tags = crate::model::tags_of(data);
    let url_on = url_enabled(data);
    let mut tasks = tasks_of(data);
    let mut created = Vec::new();
    for item in items {
        let task = build_task(item, &tags, url_on, &tasks)?;
        if let Some(parent) = item.get("parentId").and_then(Value::as_str).filter(|id| !id.is_empty()) {
            check_parent(&tasks, id_of(&task).unwrap_or(""), parent, str_field(&task, "projectName"))?;
        }
        tasks.push(task.clone());
        created.push(task);
    }
    if items.iter().any(|item| item.get("parentId").and_then(Value::as_str).is_some()) {
        reassign_todo_order(&mut tasks);
        for task in &mut created {
            if let Some(id) = id_of(task) {
                if let Some(stored) = tasks.iter().find(|candidate| id_of(candidate) == Some(id)) {
                    *task = stored.clone();
                }
            }
        }
    }
    put_tasks(data, tasks);
    Ok(created)
}

fn build_task(body: &Value, tags: &[Value], url_on: bool, existing: &[Value]) -> ApiResult<Value> {
    let parse_input = body.get("parseInput").and_then(Value::as_bool).unwrap_or(false);
    let raw_title = body
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .ok_or_else(|| err(400, "title is required"))?;
    if raw_title.chars().count() > 1000 {
        return Err(err(400, "title too long"));
    }
    let mut title = raw_title.to_string();
    let mut project = body.get("projectName").and_then(Value::as_str).filter(|name| !name.is_empty()).map(str::to_string);
    let mut url = match body.get("url") {
        None | Some(Value::Null) => None,
        Some(Value::String(url)) => Some(url.clone()),
        Some(_) => return Err(err(400, "url must be a string")),
    };
    let mut due = match body.get("dueDate") {
        None | Some(Value::Null) => None,
        Some(Value::String(due)) => Some(due.clone()),
        Some(_) => return Err(err(400, "dueDate must be a string")),
    };
    let explicit_project = body.get("projectName").is_some();
    let explicit_url = body.get("url").is_some();
    let explicit_due = body.get("dueDate").is_some();
    let mut tag_body = title.clone();
    if parse_input {
        let today = NaiveDate::parse_from_str(&crate::model::local_today(), "%Y-%m-%d")
            .map_err(|_| err(500, "bad local date"))?;
        let prepared = prepare_line(raw_title, today);
        let item = materialize(&prepared.text, url_on);
        title = item.title;
        tag_body = item.body;
        if !explicit_project {
            project = item.project;
        }
        if !explicit_url {
            url = item.url;
        }
        if !explicit_due {
            due = prepared.due;
        }
    } else if explicit_project {
        if let Some(name) = &project {
            let body_text = body_of(&json!({ "title": title, "projectName": name }));
            let prefix = format!(":{name} ");
            if !title.starts_with(&prefix) {
                title = format!(":{name} {body_text}");
            }
        }
    }
    if let Some(name) = &project {
        if name.chars().count() > 100 || name.contains(char::is_whitespace) {
            return Err(err(400, "projectName must be a single token"));
        }
    }
    if title.chars().count() > 1000 {
        return Err(err(400, "title too long"));
    }
    if title.trim().is_empty() {
        return Err(err(400, "title is required"));
    }
    let mut tag_values = match body.get("tags") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => resolve_tags(tags, items)?,
        Some(_) => return Err(err(400, "tags must be an array of strings")),
    };
    if parse_input {
        let auto = auto_ids(&tag_body, tags);
        tag_values = merge_tags(&tag_values, &auto);
    }
    let mut task = json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "title": title,
        "status": "todo",
        "tags": tag_values,
        "createdAt": now_rfc3339(),
        "order": next_todo_order(existing),
    });
    if let Some(project) = project {
        task["projectName"] = json!(project);
    }
    if let Some(url) = url {
        task["url"] = json!(url);
    }
    if let Some(due) = due {
        task["dueDate"] = json!(due);
    }
    if let Some(value) = body.get("isMinimum") {
        let flag = value.as_bool().ok_or_else(|| err(400, "isMinimum must be a boolean"))?;
        task["isMinimum"] = json!(flag);
    }
    if let Some(value) = body.get("isPending") {
        let flag = value.as_bool().ok_or_else(|| err(400, "isPending must be a boolean"))?;
        task["isPending"] = json!(flag);
    }
    if let Some(parent) = body.get("parentId").and_then(Value::as_str).filter(|id| !id.is_empty()) {
        task["parentId"] = json!(parent);
    }
    Ok(task)
}

fn check_parent(tasks: &[Value], id: &str, parent: &str, project: Option<&str>) -> ApiResult<()> {
    require_id(parent)?;
    if parent == id {
        return Err(err(400, "task cannot be its own parent"));
    }
    let Some(parent_task) = tasks.iter().find(|task| id_of(task) == Some(parent)) else {
        return Err(err(404, "parent not found"));
    };
    if descendants(tasks, id).iter().any(|child| child == parent) {
        return Err(err(400, "parent would create a cycle"));
    }
    let parent_project = str_field(parent_task, "projectName");
    if parent_project != project {
        return Err(err(400, "parent must be in the same project"));
    }
    if depth(tasks, parent) + 1 >= 5 {
        return Err(err(400, "max depth reached"));
    }
    Ok(())
}

pub fn update_task(data: &mut Value, id: &str, body: &Value) -> ApiResult<Value> {
    require_id(id)?;
    let tags = crate::model::tags_of(data);
    let mut tasks = tasks_of(data);
    let index = find_index(&tasks, id).ok_or_else(|| err(404, "task not found"))?;
    let parse_title = body.get("parseTitle").and_then(Value::as_bool).unwrap_or(false);
    if let Some(value) = body.get("title") {
        if parse_title {
            apply_parsed_title(&mut tasks[index], value, &tags, url_enabled(data), body)?;
        } else {
            let title = value
                .as_str()
                .map(str::trim)
                .filter(|title| !title.is_empty() && title.chars().count() <= 1000)
                .ok_or_else(|| err(400, "title must be a non-empty string"))?;
            tasks[index]["title"] = json!(title);
        }
    }
    if let Some(value) = body.get("status") {
        let status = value.as_str().unwrap_or("");
        if status != "todo" && status != "done" {
            return Err(err(400, "status must be todo or done"));
        }
        tasks[index]["status"] = json!(status);
        if status == "done" {
            tasks[index]["completedAt"] = json!(now_rfc3339());
        } else {
            tasks[index]["completedAt"] = Value::Null;
        }
    }
    for key in ["dueDate", "url"] {
        match body.get(key) {
            None => {}
            Some(Value::Null) => tasks[index][key] = Value::Null,
            Some(Value::String(text)) => tasks[index][key] = json!(text),
            Some(_) => return Err(err(400, format!("{key} must be a string or null"))),
        }
    }
    if let Some(value) = body.get("tags") {
        match value {
            Value::Array(items) => tasks[index]["tags"] = Value::Array(resolve_tags(&tags, items)?),
            _ => return Err(err(400, "tags must be an array of strings")),
        }
    }
    if let Some(value) = body.get("projectName") {
        apply_project(&mut tasks[index], value)?;
    }
    if let Some(value) = body.get("isMinimum") {
        let flag = value.as_bool().ok_or_else(|| err(400, "isMinimum must be a boolean"))?;
        tasks[index]["isMinimum"] = json!(flag);
        cascade_flag(&mut tasks, id, "isMinimum", flag);
    }
    if let Some(value) = body.get("isPending") {
        let flag = value.as_bool().ok_or_else(|| err(400, "isPending must be a boolean"))?;
        tasks[index]["isPending"] = json!(flag);
        cascade_flag(&mut tasks, id, "isPending", flag);
    }
    if let Some(value) = body.get("parentId") {
        let parent = match value {
            Value::Null => None,
            Value::String(text) if text.is_empty() => None,
            Value::String(text) => Some(text.as_str()),
            _ => return Err(err(400, "parentId must be a string or null")),
        };
        let project = str_field(&tasks[index], "projectName").map(str::to_string);
        if let Some(parent) = parent {
            check_parent(&tasks, id, parent, project.as_deref())?;
            tasks[index]["parentId"] = json!(parent);
        } else {
            object_mut(&mut tasks[index])?.remove("parentId");
        }
        reassign_todo_order(&mut tasks);
    }
    if parse_title {
        let body_text = body_of(&tasks[index]);
        let existing = tasks[index].get("tags").and_then(Value::as_array).cloned().unwrap_or_default();
        tasks[index]["tags"] = Value::Array(merge_tags(&existing, &auto_ids(&body_text, &tags)));
    }
    let updated = tasks[index].clone();
    put_tasks(data, tasks);
    Ok(updated)
}

fn apply_parsed_title(task: &mut Value, value: &Value, _tags: &[Value], url_on: bool, body: &Value) -> ApiResult<()> {
    let raw = value
        .as_str()
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .ok_or_else(|| err(400, "title must be a non-empty string"))?;
    if raw.chars().count() > 1000 {
        return Err(err(400, "title must be a non-empty string"));
    }
    // 画面のタイトル編集と同じ。プロジェクトと URL だけ解釈し、日付は入力欄（追加時）だけ。
    let item = materialize(raw, url_on);
    if item.title.chars().count() > 1000 || item.title.trim().is_empty() {
        return Err(err(400, "title must be a non-empty string"));
    }
    task["title"] = json!(item.title);
    match item.project {
        Some(project) => task["projectName"] = json!(project),
        None => {
            object_mut(task)?.remove("projectName");
        }
    }
    if body.get("url").is_none() {
        if let Some(url) = item.url {
            task["url"] = json!(url);
        }
    }
    Ok(())
}

fn apply_project(task: &mut Value, value: &Value) -> ApiResult<()> {
    match value {
        Value::Null => {
            let body = body_of(task);
            object_mut(task)?.remove("projectName");
            task["title"] = json!(body);
        }
        Value::String(name) if name.trim().is_empty() => {
            let body = body_of(task);
            object_mut(task)?.remove("projectName");
            task["title"] = json!(body);
        }
        Value::String(name) => {
            let name = name.trim();
            if name.chars().count() > 100 || name.contains(char::is_whitespace) {
                return Err(err(400, "projectName must be a single token"));
            }
            let body = body_of(task);
            task["projectName"] = json!(name);
            task["title"] = json!(format!(":{name} {body}"));
        }
        _ => return Err(err(400, "projectName must be a string or null")),
    }
    Ok(())
}

fn cascade_flag(tasks: &mut [Value], id: &str, key: &str, flag: bool) {
    let children = descendants(tasks, id);
    for task in tasks.iter_mut() {
        if id_of(task).is_some_and(|task_id| children.iter().any(|child| child == task_id)) {
            task[key] = json!(flag);
        }
    }
}

pub fn set_status(data: &mut Value, body: &Value) -> ApiResult<Value> {
    let mut ids = Vec::new();
    if let Some(id) = body.get("id").and_then(Value::as_str) {
        require_id(id)?;
        ids.push(id.to_string());
    }
    if let Some(list) = body.get("ids").and_then(Value::as_array) {
        for item in list {
            let id = item.as_str().ok_or_else(|| err(400, "ids must be an array of strings"))?;
            require_id(id)?;
            ids.push(id.to_string());
        }
    }
    if ids.is_empty() {
        return Err(err(400, "id or ids is required"));
    }
    ids.sort();
    ids.dedup();
    let status = body.get("status").and_then(Value::as_str).unwrap_or("");
    if !matches!(status, "todo" | "done" | "toggle") {
        return Err(err(400, "status must be todo, done, or toggle"));
    }
    let cascade = body.get("cascade").and_then(Value::as_bool).unwrap_or(false);
    let mut tasks = tasks_of(data);
    for id in &ids {
        if find_index(&tasks, id).is_none() {
            return Err(err(404, "task not found"));
        }
    }
    let original: Vec<(String, String)> = ids
        .iter()
        .map(|id| {
            let current = tasks
                .iter()
                .find(|task| id_of(task) == Some(id.as_str()))
                .map(status_of)
                .unwrap_or("")
                .to_string();
            (id.clone(), current)
        })
        .collect();
    let marking_done: Vec<String> = original
        .iter()
        .filter(|(_, current)| match status {
            "done" => true,
            "todo" => false,
            _ => current == "todo",
        })
        .map(|(id, _)| id.clone())
        .collect();
    if !cascade {
        for id in &marking_done {
            let blocked = descendants(&tasks, id).iter().any(|child| {
                tasks.iter().find(|task| id_of(task) == Some(child.as_str())).is_some_and(|task| status_of(task) == "todo")
            });
            if blocked {
                return Err(err(409, "children pending"));
            }
        }
    }
    let now = now_rfc3339();
    let mut updated = Vec::new();
    for id in &marking_done {
        let mut targets = vec![id.clone()];
        if cascade {
            targets.extend(descendants(&tasks, id));
        }
        for target in targets {
            if let Some(task) = tasks.iter_mut().find(|task| id_of(task) == Some(target.as_str())) {
                task["status"] = json!("done");
                task["completedAt"] = json!(now.clone());
                if !updated.iter().any(|seen: &String| seen == &target) {
                    updated.push(target);
                }
            }
        }
    }
    if status != "done" {
        for (id, current) in &original {
            let reopen = status == "todo" || (status == "toggle" && current == "done");
            if reopen {
                if let Some(task) = tasks.iter_mut().find(|task| id_of(task) == Some(id.as_str())) {
                    task["status"] = json!("todo");
                    task["completedAt"] = Value::Null;
                    updated.push(id.clone());
                }
            }
        }
    }
    put_tasks(data, tasks);
    Ok(json!({ "updated": updated }))
}

pub fn delete_ids(data: &mut Value, ids: &[String]) -> ApiResult<Value> {
    if ids.is_empty() {
        return Err(err(400, "id or ids is required"));
    }
    let mut tasks = tasks_of(data);
    for id in ids {
        require_id(id)?;
        if find_index(&tasks, id).is_none() {
            return Err(err(404, "task not found"));
        }
    }
    let mut remove = Vec::new();
    for id in ids {
        if !remove.iter().any(|seen: &String| seen == id) {
            remove.push(id.clone());
        }
        for child in descendants(&tasks, id) {
            if !remove.iter().any(|seen| seen == &child) {
                remove.push(child);
            }
        }
    }
    let requested: HashSet<&str> = ids.iter().map(String::as_str).collect();
    tasks.retain(|task| id_of(task).is_none_or(|id| !remove.iter().any(|gone| gone == id)));
    let also: Vec<&String> = remove.iter().filter(|id| !requested.contains(id.as_str())).collect();
    put_tasks(data, tasks);
    if ids.len() == 1 {
        Ok(json!({ "deleted": ids[0], "alsoDeleted": also }))
    } else {
        Ok(json!({ "deleted": ids, "alsoDeleted": also }))
    }
}

pub fn reorder_tasks(data: &mut Value, ids: &[String]) -> ApiResult<Value> {
    if ids.is_empty() {
        return Err(err(400, "ids is required"));
    }
    let mut seen = HashSet::new();
    for id in ids {
        require_id(id)?;
        if !seen.insert(id.clone()) {
            return Err(err(400, "duplicate id in ids"));
        }
    }
    let original = tasks_of(data);
    for id in ids {
        if find_index(&original, id).is_none() {
            return Err(err(404, "task not found"));
        }
    }
    let mut others = Vec::new();
    let mut picked = Vec::new();
    for task in original {
        if id_of(&task).is_some_and(|id| ids.iter().any(|want| want == id)) {
            picked.push(task);
        } else {
            others.push(task);
        }
    }
    let mut reordered = Vec::new();
    for (index, id) in ids.iter().enumerate() {
        let mut task = picked
            .iter()
            .find(|task| id_of(task) == Some(id.as_str()))
            .cloned()
            .ok_or_else(|| err(404, "task not found"))?;
        task["order"] = json!(index as i64);
        reordered.push(task);
    }
    let mut all = others;
    all.extend(reordered);
    let orders: Vec<(String, i64)> = all
        .iter()
        .filter_map(|task| id_of(task).map(|id| (id.to_string(), order_of(task))))
        .collect();
    for task in &mut all {
        let Some(parent) = task.get("parentId").and_then(Value::as_str) else {
            continue;
        };
        let order = order_of(task);
        match orders.iter().find(|(id, _)| id == parent) {
            None => task["parentId"] = Value::Null,
            Some((_, parent_order)) if order <= *parent_order => task["parentId"] = Value::Null,
            Some(_) => {}
        }
    }
    put_tasks(data, all);
    Ok(json!({ "ok": true }))
}

pub fn reorder_projects(data: &mut Value, projects: &[Option<String>]) -> ApiResult<Value> {
    let original = tasks_of(data);
    let mut others = Vec::new();
    let mut sections: Vec<(String, Vec<Value>)> = Vec::new();
    for task in original {
        if status_of(&task) != "todo" {
            others.push(task);
            continue;
        }
        let key = str_field(&task, "projectName").unwrap_or("__none__").to_string();
        if let Some((_, items)) = sections.iter_mut().find(|(name, _)| name == &key) {
            items.push(task);
        } else {
            sections.push((key, vec![task]));
        }
    }
    let mut order = 0i64;
    let mut flat = Vec::new();
    let mut used = HashSet::new();
    for project in projects {
        let key = project.as_deref().filter(|name| !name.is_empty()).unwrap_or("__none__");
        if !used.insert(key.to_string()) {
            continue;
        }
        if let Some((_, mut items)) = sections.iter().find(|(name, _)| name == key).map(|(name, items)| (name.clone(), items.clone())) {
            items.sort_by_key(order_of);
            for mut task in items {
                task["order"] = json!(order);
                order += 1;
                flat.push(task);
            }
            let _ = items;
        }
    }
    for (key, mut items) in sections {
        if used.contains(&key) {
            continue;
        }
        items.sort_by_key(order_of);
        for mut task in items {
            task["order"] = json!(order);
            order += 1;
            flat.push(task);
        }
    }
    flat.extend(others);
    put_tasks(data, flat);
    Ok(json!({ "ok": true }))
}

pub fn clear_data(data: &mut Value, body: &Value) -> ApiResult<Value> {
    if body.get("confirm").and_then(Value::as_str) != Some("delete") {
        return Err(err(400, "confirm must be \"delete\""));
    }
    put_tasks(data, Vec::new());
    crate::model::put_tags(data, Vec::new());
    Ok(json!({ "cleared": true }))
}
