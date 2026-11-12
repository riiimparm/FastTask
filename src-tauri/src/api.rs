// AIエージェント連携用のローカルHTTP API (127.0.0.1 のみ)。
// データの意味は fasttask-core が持つ。ここは待受、認証情報、画面への通知だけ。
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::sync::Mutex;

use fasttask_core::Change;
use serde_json::{json, Value};
use tauri::{Emitter, Manager};
use tiny_http::{Header, Request, Response, Server};

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
    let authed = req.headers().iter().any(|h| {
        h.field.equiv("Authorization")
            && h.value.as_str().strip_prefix("Bearer ") == Some(ctx.token.as_str())
    });
    if !authed {
        return respond(req, 401, json!({ "error": "unauthorized" }));
    }

    let url = req.url().to_string();
    let (path, _) = match url.split_once('?') {
        Some((path, query)) => (path.to_string(), query.to_string()),
        None => (url.clone(), String::new()),
    };
    let method = req.method().as_str().to_string();

    if method == "POST" && path == "/google/push" {
        return google_call(req, ctx.app.clone(), true);
    }
    if method == "GET" && path == "/google/tasklists" {
        return google_call(req, ctx.app.clone(), false);
    }

    let mut body = String::new();
    if matches!(method.as_str(), "POST" | "PATCH") {
        let len = req.body_length().unwrap_or(0);
        if len > fasttask_core::MAX_BODY {
            return respond(req, 413, json!({ "error": "body too large" }));
        }
        if let Err(e) = req
            .as_reader()
            .take(fasttask_core::MAX_BODY as u64 + 1)
            .read_to_string(&mut body)
        {
            return respond(req, 400, json!({ "error": format!("read error: {e}") }));
        }
        if body.len() > fasttask_core::MAX_BODY {
            return respond(req, 413, json!({ "error": "body too large" }));
        }
    }

    let response = {
        let _guard = DATA_LOCK.lock().unwrap();
        fasttask_core::handle(
            &ctx.dir,
            &ctx.token,
            &method,
            &url,
            Some(&format!("Bearer {}", ctx.token)),
            &body,
        )
    };
    if response.changed == Change::Data {
        let _ = ctx.app.emit("external-data-changed", ());
        if let Ok(text) = fs::read_to_string(ctx.dir.join("data.json")) {
            if let Ok(data) = serde_json::from_str::<Value>(&text) {
                if let Some(tasks) = data.get("tasks").and_then(Value::as_array) {
                    crate::google::auto_push(ctx.app.clone(), tasks.clone());
                }
            }
        }
    } else if response.changed == Change::Google {
        let _ = ctx.app.emit("external-google-changed", ());
    }
    respond(req, response.status, response.body)
}

fn google_call(req: Request, app: tauri::AppHandle, push: bool) -> std::io::Result<()> {
    let (tx, rx) = std::sync::mpsc::channel();
    tauri::async_runtime::spawn(async move {
        let result = if push {
            crate::google::google_push_now(app)
                .await
                .map(|value| serde_json::to_value(value).unwrap_or_else(|_| json!({})))
        } else {
            crate::google::google_list_tasklists(app).await
        };
        let _ = tx.send(result);
    });
    match rx.recv() {
        Ok(Ok(body)) => respond(req, 200, body),
        Ok(Err(message)) => respond(req, 400, json!({ "error": message })),
        Err(_) => respond(req, 500, json!({ "error": "google request failed" })),
    }
}
