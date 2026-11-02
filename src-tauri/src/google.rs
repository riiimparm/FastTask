//! Google カレンダー / Google Tasks への一方向 push 連携。
//!
//! - OAuth 2.0 デスクトップ向けループバックフロー + PKCE (S256)
//! - クライアントID/シークレットはユーザーがGCPで発行して設定画面から入力する。アプリには埋め込まない。
//! - 認証情報は app_data_dir/google.json に 0600 で保存し、data.json とは混ぜない。
//! - FastTask id ↔ Google 側 id の対応は app_data_dir/google_map.json に保持。

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

const AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT: &str = "https://oauth2.googleapis.com/revoke";
const USERINFO_ENDPOINT: &str = "https://www.googleapis.com/oauth2/v3/userinfo";
const CALENDAR_API: &str = "https://www.googleapis.com/calendar/v3/calendars";
const TASKS_API: &str = "https://tasks.googleapis.com/tasks/v1";

/// calendar.events と tasks が本体。userinfo.email は設定画面の「接続中アカウント」表示にだけ使う。
const SCOPES: &str = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/userinfo.email";

const AUTH_TIMEOUT: Duration = Duration::from_secs(300);

// ---------------------------------------------------------------- config

#[derive(Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct GoogleConfig {
    pub client_id: String,
    pub client_secret: String,
    pub refresh_token: String,
    pub email: String,
    pub calendar_id: String,
    pub tasklist_id: String,
    pub auto_push: bool,
    /// カレンダーへの終日イベント作成を行うか
    pub push_calendar: bool,
    /// Google Tasks への作成を行うか
    pub push_tasks: bool,
}

impl Default for GoogleConfig {
    fn default() -> Self {
        Self {
            client_id: String::new(),
            client_secret: String::new(),
            refresh_token: String::new(),
            email: String::new(),
            calendar_id: "primary".into(),
            tasklist_id: "@default".into(),
            auto_push: false,
            push_calendar: true,
            push_tasks: true,
        }
    }
}

/// フロントに返す安全なビュー。secret / refresh_token は決して含めない。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicConfig {
    connected: bool,
    has_secret: bool,
    client_id: String,
    email: String,
    calendar_id: String,
    tasklist_id: String,
    auto_push: bool,
    push_calendar: bool,
    push_tasks: bool,
}

impl From<&GoogleConfig> for PublicConfig {
    fn from(c: &GoogleConfig) -> Self {
        Self {
            connected: !c.refresh_token.is_empty(),
            has_secret: !c.client_secret.is_empty(),
            client_id: c.client_id.clone(),
            email: c.email.clone(),
            calendar_id: c.calendar_id.clone(),
            tasklist_id: c.tasklist_id.clone(),
            auto_push: c.auto_push,
            push_calendar: c.push_calendar,
            push_tasks: c.push_tasks,
        }
    }
}

fn dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let d = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;
    fs::create_dir_all(&d).map_err(|e| format!("mkdir error: {e}"))?;
    Ok(d)
}

pub fn load_config(app: &tauri::AppHandle) -> Result<GoogleConfig, String> {
    let path = dir(app)?.join("google.json");
    if !path.exists() {
        return Ok(GoogleConfig::default());
    }
    let s = fs::read_to_string(&path).map_err(|e| format!("read error: {e}"))?;
    serde_json::from_str(&s).map_err(|e| format!("parse error: {e}"))
}

/// 認証情報を含むので 0600 で書く。tmp に書いてから権限を付けて rename。
fn save_config(app: &tauri::AppHandle, cfg: &GoogleConfig) -> Result<(), String> {
    let d = dir(app)?;
    let tmp = d.join("google.json.tmp");
    let s = serde_json::to_string_pretty(cfg).map_err(|e| format!("serialize error: {e}"))?;
    fs::write(&tmp, s).map_err(|e| format!("write error: {e}"))?;
    restrict(&tmp)?;
    fs::rename(&tmp, d.join("google.json")).map_err(|e| format!("rename error: {e}"))
}

#[cfg(unix)]
fn restrict(path: &PathBuf) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|e| format!("chmod error: {e}"))
}

// ponytail: Windows では ACL を触らず読み取り専用属性も付けない（ユーザープロファイル配下の
// 既定ACLに委ねる）。厳密にやるなら windows-acl 等で所有者のみに絞る。
#[cfg(not(unix))]
fn restrict(_path: &PathBuf) -> Result<(), String> {
    Ok(())
}

// ---------------------------------------------------------------- id map

type IdMap = HashMap<String, MapEntry>;

#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(default)]
struct MapEntry {
    event_id: String,
    gtask_id: String,
    /// 前回 push した内容のハッシュ。一致すればAPIを呼ばない。
    hash: String,
}

fn load_map(app: &tauri::AppHandle) -> IdMap {
    let Ok(d) = dir(app) else { return IdMap::new() };
    fs::read_to_string(d.join("google_map.json"))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_map(app: &tauri::AppHandle, map: &IdMap) -> Result<(), String> {
    let d = dir(app)?;
    let tmp = d.join("google_map.json.tmp");
    let s = serde_json::to_string_pretty(map).map_err(|e| format!("serialize error: {e}"))?;
    fs::write(&tmp, s).map_err(|e| format!("write error: {e}"))?;
    fs::rename(&tmp, d.join("google_map.json")).map_err(|e| format!("rename error: {e}"))
}

// ---------------------------------------------------------------- oauth

fn b64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn random_token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

/// ループバック受け口を立て、ブラウザで同意画面を開き、code を受け取って token と交換する。
pub async fn connect(app: tauri::AppHandle) -> Result<PublicConfig, String> {
    let mut cfg = load_config(&app)?;
    if cfg.client_id.trim().is_empty() {
        return Err("client_id が未設定です".into());
    }

    let verifier = format!("{}{}", random_token(), random_token()); // 128文字、PKCE の許容文字のみ
    let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
    let state = random_token();

    // ワンショットのループバックサーバ。ポートはOS任せ（0）。
    let server = tiny_http::Server::http(("127.0.0.1", 0))
        .map_err(|e| format!("loopback bind error: {e}"))?;
    let port = server
        .server_addr()
        .to_ip()
        .ok_or("loopback addr error")?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let mut url = url::Url::parse(AUTH_ENDPOINT).map_err(|e| e.to_string())?;
    url.query_pairs_mut()
        .append_pair("client_id", &cfg.client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPES)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &state)
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent");

    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|e| format!("ブラウザを開けませんでした: {e}"))?;

    // 受信はブロッキングなので blocking スレッドへ逃がす
    let expected_state = state.clone();
    let code = tauri::async_runtime::spawn_blocking(move || wait_for_code(server, &expected_state))
        .await
        .map_err(|e| format!("join error: {e}"))??;

    let token: Value = http()
        .post(TOKEN_ENDPOINT)
        .form(&[
            ("client_id", cfg.client_id.as_str()),
            ("client_secret", cfg.client_secret.as_str()),
            ("code", code.as_str()),
            ("code_verifier", verifier.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri.as_str()),
        ])
        .send()
        .await
        .map_err(|_| "トークン取得に失敗しました（ネットワーク）".to_string())?
        .json()
        .await
        .map_err(|_| "トークン応答の解析に失敗しました".to_string())?;

    if let Some(err) = token.get("error").and_then(Value::as_str) {
        // ponytail: error_description は client_id 等を含みうるのでそのまま出さない
        return Err(format!("トークン取得エラー: {err}"));
    }
    let refresh = token
        .get("refresh_token")
        .and_then(Value::as_str)
        .ok_or("refresh_token が返りませんでした（GCPの同意画面設定を確認してください）")?;
    let access = token
        .get("access_token")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    cfg.refresh_token = refresh.to_string();
    cfg.email = fetch_email(&access).await.unwrap_or_default();
    save_config(&app, &cfg)?;
    cache_access(&access, token.get("expires_in").and_then(Value::as_u64).unwrap_or(3000));
    Ok((&cfg).into())
}

fn wait_for_code(server: tiny_http::Server, expected_state: &str) -> Result<String, String> {
    let deadline = Instant::now() + AUTH_TIMEOUT;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("認証がタイムアウトしました".into());
        }
        let Some(req) = server
            .recv_timeout(remaining)
            .map_err(|e| format!("loopback recv error: {e}"))?
        else {
            continue;
        };
        // favicon 等の無関係なリクエストは無視して待ち続ける
        let full = format!("http://127.0.0.1{}", req.url());
        let Ok(parsed) = url::Url::parse(&full) else {
            let _ = req.respond(html(400, "不正なリクエストです"));
            continue;
        };
        let q: HashMap<_, _> = parsed.query_pairs().into_owned().collect();

        if let Some(err) = q.get("error") {
            let _ = req.respond(html(400, "認証がキャンセルされました。"));
            return Err(format!("認証エラー: {err}"));
        }
        let (Some(code), Some(state)) = (q.get("code"), q.get("state")) else {
            let _ = req.respond(html(404, "このURLは認証用ではありません。"));
            continue;
        };
        // CSRF 対策: state が一致しない応答は捨てる
        if state != expected_state {
            let _ = req.respond(html(400, "state が一致しません。もう一度お試しください。"));
            return Err("state 不一致（CSRFの可能性）".into());
        }
        let _ = req.respond(html(200, "連携が完了しました。このタブを閉じてください。"));
        return Ok(code.clone());
    }
}

fn html(status: u16, msg: &str) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let body = format!(
        "<!doctype html><meta charset=\"utf-8\"><title>FastTask</title>\
         <body style=\"font-family:system-ui;display:grid;place-items:center;height:90vh\">\
         <p>{msg}</p></body>"
    );
    tiny_http::Response::from_string(body)
        .with_status_code(status)
        .with_header(
            tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..])
                .unwrap(),
        )
}

async fn fetch_email(access: &str) -> Option<String> {
    let v: Value = http()
        .get(USERINFO_ENDPOINT)
        .bearer_auth(access)
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    v.get("email").and_then(Value::as_str).map(str::to_string)
}

pub async fn disconnect(app: tauri::AppHandle) -> Result<PublicConfig, String> {
    let mut cfg = load_config(&app)?;
    if !cfg.refresh_token.is_empty() {
        // 失敗しても手元を消すのが優先（結果は無視）
        let _ = http()
            .post(REVOKE_ENDPOINT)
            .form(&[("token", cfg.refresh_token.as_str())])
            .send()
            .await;
    }
    cfg.refresh_token.clear();
    cfg.email.clear();
    save_config(&app, &cfg)?;
    *ACCESS.lock().unwrap() = None;
    // 対応表も捨てる（次の接続先が別アカウントなら無意味なため）
    let _ = save_map(&app, &IdMap::new());
    Ok((&cfg).into())
}

// ---------------------------------------------------------------- access token

static ACCESS: Mutex<Option<(String, Instant)>> = Mutex::new(None);

fn cache_access(token: &str, expires_in: u64) {
    let ttl = Duration::from_secs(expires_in.saturating_sub(60).max(30));
    *ACCESS.lock().unwrap() = Some((token.to_string(), Instant::now() + ttl));
}

fn http() -> reqwest::Client {
    reqwest::Client::new()
}

async fn access_token(cfg: &GoogleConfig) -> Result<String, String> {
    if let Some((tok, exp)) = ACCESS.lock().unwrap().as_ref() {
        if Instant::now() < *exp {
            return Ok(tok.clone());
        }
    }
    if cfg.refresh_token.is_empty() {
        return Err("Googleに接続していません".into());
    }
    let v: Value = http()
        .post(TOKEN_ENDPOINT)
        .form(&[
            ("client_id", cfg.client_id.as_str()),
            ("client_secret", cfg.client_secret.as_str()),
            ("refresh_token", cfg.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|_| "トークン更新に失敗しました（ネットワーク）".to_string())?
        .json()
        .await
        .map_err(|_| "トークン応答の解析に失敗しました".to_string())?;
    if let Some(err) = v.get("error").and_then(Value::as_str) {
        return Err(format!("トークン更新エラー: {err}（再接続が必要かもしれません）"));
    }
    let tok = v
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or("access_token が返りませんでした")?;
    cache_access(tok, v.get("expires_in").and_then(Value::as_u64).unwrap_or(3000));
    Ok(tok.to_string())
}

// ---------------------------------------------------------------- push

#[derive(Serialize, Default)]
pub struct PushResult {
    pub pushed: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

fn s(t: &Value, k: &str) -> String {
    t.get(k).and_then(Value::as_str).unwrap_or_default().to_string()
}

fn hash_of(t: &Value) -> String {
    let mut h = Sha256::new();
    for k in ["title", "status", "dueDate", "url"] {
        h.update(s(t, k).as_bytes());
        h.update(b"\x1f");
    }
    b64url(&h.finalize())
}

/// data.json の tasks 配列を Google に push する。
pub async fn push(app: tauri::AppHandle, tasks: Vec<Value>) -> Result<PushResult, String> {
    let cfg = load_config(&app)?;
    let token = access_token(&cfg).await?;
    let mut map = load_map(&app);
    let mut res = PushResult::default();

    // ponytail: タスクを逐次処理している（Google APIのレート制限を踏みにくい代わりに遅い）。
    // 件数が増えて体感が悪ければ join_all で並列化し、429 時に Retry-After を見る実装にする。
    for task in &tasks {
        let id = s(task, "id");
        if id.is_empty() {
            continue;
        }
        let h = hash_of(task);
        let entry = map.entry(id.clone()).or_default();
        if entry.hash == h {
            res.skipped += 1;
            continue;
        }
        let mut ok = true;
        if cfg.push_tasks {
            if let Err(e) = sync_gtask(&cfg, &token, task, entry).await {
                res.errors.push(e);
                ok = false;
            }
        }
        if cfg.push_calendar {
            if let Err(e) = sync_event(&cfg, &token, task, entry).await {
                res.errors.push(e);
                ok = false;
            }
        }
        if ok {
            entry.hash = h;
            res.pushed += 1;
        }
    }

    // ponytail: FastTask で削除されたタスクの Google 側は消さずに対応表だけ掃除する。
    // 削除まで同期するなら、ここで残った entry の event_id/gtask_id を DELETE すればよい。
    let alive: std::collections::HashSet<String> = tasks.iter().map(|t| s(t, "id")).collect();
    map.retain(|k, _| alive.contains(k));

    save_map(&app, &map)?;
    Ok(res)
}

/// 404/410 は「Google側で消された」扱いにして、呼び出し元が作り直せるようにする。
async fn send_json(
    req: reqwest::RequestBuilder,
    token: &str,
    body: Option<&Value>,
) -> Result<Option<Value>, String> {
    let req = req.bearer_auth(token);
    let req = match body {
        Some(b) => req.json(b),
        None => req,
    };
    let resp = req.send().await.map_err(|_| "Google API 通信失敗".to_string())?;
    let status = resp.status();
    if status == reqwest::StatusCode::NOT_FOUND || status == reqwest::StatusCode::GONE {
        return Ok(None);
    }
    if !status.is_success() {
        let detail = resp
            .json::<Value>()
            .await
            .ok()
            .and_then(|v| {
                v.pointer("/error/message")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .unwrap_or_else(|| status.to_string());
        return Err(format!("Google API {status}: {detail}"));
    }
    resp.json().await.map(Some).map_err(|e| format!("応答解析失敗: {e}"))
}

async fn sync_gtask(
    cfg: &GoogleConfig,
    token: &str,
    task: &Value,
    entry: &mut MapEntry,
) -> Result<(), String> {
    let done = s(task, "status") == "done";
    let mut body = json!({
        "title": s(task, "title"),
        "status": if done { "completed" } else { "needsAction" },
    });
    if !done {
        // needsAction に戻す時は completed を明示的に消す必要がある
        body["completed"] = Value::Null;
    }
    let url = s(task, "url");
    if !url.is_empty() {
        body["notes"] = json!(url);
    }
    let due = s(task, "dueDate");
    body["due"] = if due.is_empty() {
        Value::Null
    } else {
        json!(format!("{due}T00:00:00.000Z"))
    };

    let list = urlencoding(&cfg.tasklist_id);
    if !entry.gtask_id.is_empty() {
        let url = format!("{TASKS_API}/lists/{list}/tasks/{}", urlencoding(&entry.gtask_id));
        if send_json(http().patch(&url), token, Some(&body)).await?.is_some() {
            return Ok(());
        }
        entry.gtask_id.clear(); // Google側で消えていたので作り直す
    }
    let url = format!("{TASKS_API}/lists/{list}/tasks");
    let created = send_json(http().post(&url), token, Some(&body))
        .await?
        .ok_or("Tasks リストが見つかりません")?;
    entry.gtask_id = s(&created, "id");
    Ok(())
}

async fn sync_event(
    cfg: &GoogleConfig,
    token: &str,
    task: &Value,
    entry: &mut MapEntry,
) -> Result<(), String> {
    let due = s(task, "dueDate");
    let cal = urlencoding(&cfg.calendar_id);

    // 期日が無い / 外されたタスクはカレンダーに置かない
    if due.is_empty() {
        if !entry.event_id.is_empty() {
            let url = format!("{CALENDAR_API}/{cal}/events/{}", urlencoding(&entry.event_id));
            let _ = send_json(http().delete(&url), token, None).await;
            entry.event_id.clear();
        }
        return Ok(());
    }

    let end = next_day(&due)?;
    let mut body = json!({
        "summary": s(task, "title"),
        "start": { "date": due },
        "end": { "date": end },
    });
    let url_field = s(task, "url");
    if !url_field.is_empty() {
        body["description"] = json!(url_field);
    }

    if !entry.event_id.is_empty() {
        let url = format!("{CALENDAR_API}/{cal}/events/{}", urlencoding(&entry.event_id));
        if send_json(http().patch(&url), token, Some(&body)).await?.is_some() {
            return Ok(());
        }
        entry.event_id.clear();
    }
    let url = format!("{CALENDAR_API}/{cal}/events");
    let created = send_json(http().post(&url), token, Some(&body))
        .await?
        .ok_or("カレンダーが見つかりません")?;
    entry.event_id = s(&created, "id");
    Ok(())
}

/// 終日イベントの end.date は排他なので翌日を渡す
fn next_day(iso: &str) -> Result<String, String> {
    let d = chrono::NaiveDate::parse_from_str(iso, "%Y-%m-%d")
        .map_err(|_| format!("dueDate の形式が不正です: {iso}"))?;
    Ok((d + chrono::Duration::days(1)).format("%Y-%m-%d").to_string())
}

fn urlencoding(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

pub async fn list_tasklists(app: tauri::AppHandle) -> Result<Value, String> {
    let cfg = load_config(&app)?;
    let token = access_token(&cfg).await?;
    let url = format!("{TASKS_API}/users/@me/lists");
    send_json(http().get(&url), &token, None)
        .await?
        .ok_or("Tasks リストを取得できませんでした".into())
}

// ---------------------------------------------------------------- commands

#[tauri::command]
pub async fn google_get_config(app: tauri::AppHandle) -> Result<PublicConfig, String> {
    Ok((&load_config(&app)?).into())
}

/// 空文字の client_secret は「変更なし」として扱い、保存済みの値を消さない。
#[tauri::command]
pub async fn google_set_config(
    app: tauri::AppHandle,
    patch: Value,
) -> Result<PublicConfig, String> {
    let mut cfg = load_config(&app)?;
    let txt = |k: &str| patch.get(k).and_then(Value::as_str).map(str::trim).map(str::to_string);
    if let Some(v) = txt("clientId") {
        cfg.client_id = v;
    }
    if let Some(v) = txt("clientSecret") {
        if !v.is_empty() {
            cfg.client_secret = v;
        }
    }
    if let Some(v) = txt("calendarId") {
        cfg.calendar_id = if v.is_empty() { "primary".into() } else { v };
    }
    if let Some(v) = txt("tasklistId") {
        cfg.tasklist_id = if v.is_empty() { "@default".into() } else { v };
    }
    for (key, field) in [
        ("autoPush", 0usize),
        ("pushCalendar", 1),
        ("pushTasks", 2),
    ] {
        if let Some(b) = patch.get(key).and_then(Value::as_bool) {
            match field {
                0 => cfg.auto_push = b,
                1 => cfg.push_calendar = b,
                _ => cfg.push_tasks = b,
            }
        }
    }
    save_config(&app, &cfg)?;
    Ok((&cfg).into())
}

#[tauri::command]
pub async fn google_connect(app: tauri::AppHandle) -> Result<PublicConfig, String> {
    connect(app).await
}

#[tauri::command]
pub async fn google_disconnect(app: tauri::AppHandle) -> Result<PublicConfig, String> {
    disconnect(app).await
}

#[tauri::command]
pub async fn google_list_tasklists(app: tauri::AppHandle) -> Result<Value, String> {
    list_tasklists(app).await
}

/// 設定画面の「今すぐ同期」。data.json を読み直して全件 push する。
#[tauri::command]
pub async fn google_push_now(app: tauri::AppHandle) -> Result<PushResult, String> {
    let tasks = read_tasks(&app)?;
    push(app, tasks).await
}

fn read_tasks(app: &tauri::AppHandle) -> Result<Vec<Value>, String> {
    let path = dir(app)?.join("data.json");
    if !path.exists() {
        return Ok(vec![]);
    }
    let s = fs::read_to_string(&path).map_err(|e| format!("read error: {e}"))?;
    let v: Value = serde_json::from_str(&s).map_err(|e| format!("parse error: {e}"))?;
    Ok(v.get("tasks")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

// ---------------------------------------------------------------- auto push

static PUSH_IN_FLIGHT: Mutex<bool> = Mutex::new(false);

/// save_data から呼ばれる fire-and-forget の自動push。
/// 失敗してもアプリ操作をブロックしない（ログに出すだけ）。
pub fn auto_push(app: tauri::AppHandle, tasks: Vec<Value>) {
    let Ok(cfg) = load_config(&app) else { return };
    if !cfg.auto_push || cfg.refresh_token.is_empty() {
        return;
    }
    {
        // ponytail: 実行中なら今回の保存分はスキップする（最新状態は次の保存で追いつく）。
        // 取りこぼしを無くすなら「実行中に来たら1回だけ再実行する」フラグを足す。
        let mut flag = PUSH_IN_FLIGHT.lock().unwrap();
        if *flag {
            return;
        }
        *flag = true;
    }
    tauri::async_runtime::spawn(async move {
        match push(app, tasks).await {
            Ok(r) if !r.errors.is_empty() => {
                eprintln!("google auto push: {} 件失敗: {:?}", r.errors.len(), r.errors)
            }
            Err(e) => eprintln!("google auto push: {e}"),
            _ => {}
        }
        *PUSH_IN_FLIGHT.lock().unwrap() = false;
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check() {
        // 終日イベントの end は翌日（排他）
        assert_eq!(next_day("2026-11-10").unwrap(), "2026-11-11");
        assert_eq!(next_day("2026-12-31").unwrap(), "2027-01-01");
        assert!(next_day("11/10").is_err());

        // 内容が変われば hash が変わる = 差分検出が効く
        let a = json!({"title": "a", "status": "todo"});
        let b = json!({"title": "a", "status": "done"});
        assert_eq!(hash_of(&a), hash_of(&json!({"title": "a", "status": "todo"})));
        assert_ne!(hash_of(&a), hash_of(&b));

        // PublicConfig に秘密が漏れていないこと
        let cfg = GoogleConfig {
            client_secret: "secret".into(),
            refresh_token: "refresh".into(),
            ..Default::default()
        };
        let json = serde_json::to_string(&PublicConfig::from(&cfg)).unwrap();
        assert!(!json.contains("secret") || !json.contains("refresh"));
        assert!(!json.contains("\"refresh\""));
        assert!(!json.contains("\"secret\""));
        assert!(json.contains("\"connected\":true"));
        assert!(json.contains("\"hasSecret\":true"));

        // PKCE challenge は RFC7636 の既知ベクタと一致する
        let v = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            b64url(&Sha256::digest(v.as_bytes())),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }
}
