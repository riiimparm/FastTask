// AIエージェント連携用のローカルHTTP API (127.0.0.1 のみ)。
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::{Emitter, Manager};
use tiny_http::{Header, Request, Response, Server};

const MAX_BODY: usize = 1 << 20; // 1MiB
const PORT_MIN: u16 = 48730;
const PORT_MAX: u16 = 48760;

// ponytail: プロセス内 Mutex で API 側の読み書きだけを直列化している。
// 既知の上限: アプリ本体 (save_data) も同じ data.json を書くため、
// フロントの保存と API の書き込みが重なると後勝ちで片方が失われうる。
// 改善案: save_data とこの API を同一の共有 Mutex + ファイルロック(flock)経由にし、
// 書き込み前に mtime を比較して競合を検出する。
static DATA_LOCK: Mutex<()> = Mutex::new(());

struct Ctx {
    app: tauri::AppHandle,
    dir: PathBuf,
    token: String,
}

pub fn start(app: tauri::AppHandle) {
    let dir = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("api: app_data_dir error: {e}");
            return;
        }
    };
    if let Err(e) = fs::create_dir_all(&dir) {
        eprintln!("api: mkdir error: {e}");
        return;
    }

    let (server, port) = match (PORT_MIN..PORT_MAX).find_map(|p| {
        Server::http(("127.0.0.1", p))
            .ok()
            .map(|s| (s, p))
    }) {
        Some(v) => v,
        None => {
            eprintln!("api: no free port in {PORT_MIN}..{PORT_MAX}");
            return;
        }
    };

    let token = load_or_create_token(&dir);
    let info = dir.join("api.json");
    if let Err(e) = fs::write(
        &info,
        serde_json::to_string_pretty(&json!({ "port": port, "token": token })).unwrap(),
    ) {
        eprintln!("api: write api.json error: {e}");
        return;
    }

    let ctx = Ctx { app, dir, token };
    std::thread::spawn(move || {
        for req in server.incoming_requests() {
            if let Err(e) = handle(&ctx, req) {
                eprintln!("api: {e}");
            }
        }
    });
}

fn load_or_create_token(dir: &PathBuf) -> String {
    let path = dir.join("api.json");
    if let Ok(s) = fs::read_to_string(&path) {
        if let Ok(v) = serde_json::from_str::<Value>(&s) {
            if let Some(t) = v.get("token").and_then(Value::as_str) {
                if !t.is_empty() {
                    return t.to_string();
                }
            }
        }
    }
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

fn respond(req: Request, status: u16, body: Value) -> std::io::Result<()> {
    let header = Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
    req.respond(
        Response::from_string(body.to_string())
            .with_status_code(status)
            .with_header(header),
    )
}

fn handle(ctx: &Ctx, mut req: Request) -> std::io::Result<()> {
    let authed = req
        .headers()
        .iter()
        .any(|h| {
            h.field.equiv("Authorization")
                && h.value.as_str().strip_prefix("Bearer ") == Some(ctx.token.as_str())
        });
    if !authed {
        return respond(req, 401, json!({ "error": "unauthorized" }));
    }

    let (path, query) = {
        let url = req.url().to_string();
        match url.split_once('?') {
            Some((p, q)) => (p.to_string(), q.to_string()),
            None => (url, String::new()),
        }
    };
    let method = req.method().as_str().to_string();

    // ボディ読み込み (サイズ上限つき)
    let mut body = String::new();
    if matches!(method.as_str(), "POST" | "PATCH") {
        let len = req.body_length().unwrap_or(0);
        if len > MAX_BODY {
            return respond(req, 413, json!({ "error": "body too large" }));
        }
        if let Err(e) = req.as_reader().take(MAX_BODY as u64 + 1).read_to_string(&mut body) {
            return respond(req, 400, json!({ "error": format!("read error: {e}") }));
        }
        if body.len() > MAX_BODY {
            return respond(req, 413, json!({ "error": "body too large" }));
        }
    }

    let segs: Vec<&str> = path.trim_matches('/').split('/').collect();
    let result = match (method.as_str(), segs.as_slice()) {
        ("GET", ["tasks"]) => list_tasks(ctx, &query),
        ("POST", ["tasks"]) => create_task(ctx, &body),
        ("PATCH", ["tasks", id]) => update_task(ctx, id, &body),
        ("DELETE", ["tasks", id]) => delete_task(ctx, id),
        _ => Err((404, "not found".to_string())),
    };

    match result {
        Ok(v) => respond(req, 200, v),
        Err((code, msg)) => respond(req, code, json!({ "error": msg })),
    }
}

type ApiResult = Result<Value, (u16, String)>;

fn data_path(ctx: &Ctx) -> PathBuf {
    ctx.dir.join("data.json")
}

fn read_data(ctx: &Ctx) -> Result<Value, (u16, String)> {
    let path = data_path(ctx);
    if !path.exists() {
        return Ok(json!({ "tasks": [], "tags": [], "version": "1" }));
    }
    let s = fs::read_to_string(&path).map_err(|e| (500, format!("read error: {e}")))?;
    serde_json::from_str(&s).map_err(|e| (500, format!("parse error: {e}")))
}

fn write_data(ctx: &Ctx, data: &Value) -> Result<(), (u16, String)> {
    let tmp = ctx.dir.join("data.json.tmp");
    let s = serde_json::to_string_pretty(data).map_err(|e| (500, format!("serialize: {e}")))?;
    fs::write(&tmp, s).map_err(|e| (500, format!("write error: {e}")))?;
    fs::rename(&tmp, data_path(ctx)).map_err(|e| (500, format!("rename error: {e}")))?;
    let _ = ctx.app.emit("external-data-changed", ());
    // HTTP API 経由の変更も自動pushの対象にする（設定OFFなら何もしない）
    if let Some(tasks) = data.get("tasks").and_then(Value::as_array) {
        crate::google::auto_push(ctx.app.clone(), tasks.clone());
    }
    Ok(())
}

fn tasks_of(data: &Value) -> Vec<Value> {
    data.get("tasks")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn list_tasks(ctx: &Ctx, query: &str) -> ApiResult {
    let _g = DATA_LOCK.lock().unwrap();
    let data = read_data(ctx)?;
    let status = query.split('&').find_map(|kv| kv.strip_prefix("status="));
    let mut tasks = tasks_of(&data);
    if let Some(s) = status {
        if s != "todo" && s != "done" {
            return Err((400, "status must be todo or done".into()));
        }
        tasks.retain(|t| t.get("status").and_then(Value::as_str) == Some(s));
    }
    Ok(json!({ "tasks": tasks }))
}

fn parse_body(body: &str) -> Result<Value, (u16, String)> {
    let v: Value = serde_json::from_str(body).map_err(|e| (400, format!("invalid json: {e}")))?;
    if !v.is_object() {
        return Err((400, "body must be a JSON object".into()));
    }
    Ok(v)
}

fn create_task(ctx: &Ctx, body: &str) -> ApiResult {
    let b = parse_body(body)?;
    let title = b
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or((400, "title is required".to_string()))?;
    if title.chars().count() > 1000 {
        return Err((400, "title too long".into()));
    }
    let tags = match b.get("tags") {
        None | Some(Value::Null) => vec![],
        Some(Value::Array(a)) if a.iter().all(Value::is_string) => a.clone(),
        Some(_) => return Err((400, "tags must be an array of strings".into())),
    };

    let _g = DATA_LOCK.lock().unwrap();
    let mut data = read_data(ctx)?;
    let mut tasks = tasks_of(&data);
    let next_order = tasks
        .iter()
        .filter(|t| t.get("status").and_then(Value::as_str) == Some("todo"))
        .filter_map(|t| t.get("order").and_then(Value::as_i64))
        .max()
        .map_or(0, |m| m + 1);

    let mut task = json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "title": title,
        "status": "todo",
        "tags": tags,
        "createdAt": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        "order": next_order,
    });
    for key in ["dueDate", "url"] {
        match b.get(key) {
            None | Some(Value::Null) => {}
            Some(Value::String(s)) => {
                task[key] = json!(s);
            }
            Some(_) => return Err((400, format!("{key} must be a string"))),
        }
    }

    tasks.push(task.clone());
    data["tasks"] = Value::Array(tasks);
    write_data(ctx, &data)?;
    Ok(task)
}

fn update_task(ctx: &Ctx, id: &str, body: &str) -> ApiResult {
    let b = parse_body(body)?;
    let _g = DATA_LOCK.lock().unwrap();
    let mut data = read_data(ctx)?;
    let mut tasks = tasks_of(&data);
    let task = tasks
        .iter_mut()
        .find(|t| t.get("id").and_then(Value::as_str) == Some(id))
        .ok_or((404, "task not found".to_string()))?;

    if let Some(v) = b.get("title") {
        let s = v
            .as_str()
            .map(str::trim)
            .filter(|s| !s.is_empty() && s.chars().count() <= 1000)
            .ok_or((400, "title must be a non-empty string".to_string()))?;
        task["title"] = json!(s);
    }
    if let Some(v) = b.get("status") {
        let s = v.as_str().unwrap_or("");
        if s != "todo" && s != "done" {
            return Err((400, "status must be todo or done".into()));
        }
        task["status"] = json!(s);
        if s == "done" {
            task["completedAt"] =
                json!(chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true));
        } else {
            task["completedAt"] = Value::Null;
        }
    }
    for key in ["dueDate", "url"] {
        match b.get(key) {
            None => {}
            Some(Value::Null) => {
                task[key] = Value::Null;
            }
            Some(Value::String(s)) => {
                task[key] = json!(s);
            }
            Some(_) => return Err((400, format!("{key} must be a string or null"))),
        }
    }
    if let Some(v) = b.get("tags") {
        match v {
            Value::Array(a) if a.iter().all(Value::is_string) => task["tags"] = v.clone(),
            _ => return Err((400, "tags must be an array of strings".into())),
        }
    }

    let updated = task.clone();
    data["tasks"] = Value::Array(tasks);
    write_data(ctx, &data)?;
    Ok(updated)
}

fn delete_task(ctx: &Ctx, id: &str) -> ApiResult {
    let _g = DATA_LOCK.lock().unwrap();
    let mut data = read_data(ctx)?;
    let mut tasks = tasks_of(&data);
    let before = tasks.len();
    // 子タスクも一緒に消す (parentId でぶら下がる孤児を残さない)
    tasks.retain(|t| {
        t.get("id").and_then(Value::as_str) != Some(id)
            && t.get("parentId").and_then(Value::as_str) != Some(id)
    });
    if tasks.len() == before {
        return Err((404, "task not found".into()));
    }
    data["tasks"] = Value::Array(tasks);
    write_data(ctx, &data)?;
    Ok(json!({ "deleted": id }))
}
