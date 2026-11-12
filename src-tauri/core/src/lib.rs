//! FastTask の data.json を読み書きするローカル API。
//! Tauri アプリの HTTP サーバと、テスト用バイナリの両方がここを呼ぶ。
//! 呼び出し側は同時に一つのリクエストだけを通すこと（アプリ側は Mutex）。

mod dispatch;
mod google_file;
mod model;
mod parse;
mod settings;
mod tags;
mod tasks;
mod view;

use std::path::Path;

use serde_json::{json, Value};

pub use dispatch::dispatch;
pub use model::{local_today, Change, Outcome};

pub const MAX_BODY: usize = 1 << 20;

#[derive(Debug)]
pub struct HttpResponse {
    pub status: u16,
    pub body: Value,
    pub changed: Change,
}

/// 認証・ボディ上限・ルーティングまで含めた 1 リクエスト分。
pub fn handle(
    dir: &Path,
    token: &str,
    method: &str,
    url: &str,
    authorization: Option<&str>,
    body: &str,
) -> HttpResponse {
    if !bearer_ok(token, authorization) {
        return HttpResponse {
            status: 401,
            body: json!({ "error": "unauthorized" }),
            changed: Change::None,
        };
    }
    if body.len() > MAX_BODY {
        return HttpResponse {
            status: 413,
            body: json!({ "error": "body too large" }),
            changed: Change::None,
        };
    }
    let (path, query) = split_url(url);
    match dispatch(dir, method, &path, &query, body) {
        Ok(outcome) => HttpResponse {
            status: 200,
            body: outcome.body,
            changed: outcome.changed,
        },
        Err((status, msg)) => HttpResponse {
            status,
            body: json!({ "error": msg }),
            changed: Change::None,
        },
    }
}

fn bearer_ok(token: &str, authorization: Option<&str>) -> bool {
    authorization
        .and_then(|h| h.strip_prefix("Bearer "))
        .is_some_and(|got| !token.is_empty() && got == token)
}

fn split_url(url: &str) -> (String, String) {
    match url.split_once('?') {
        Some((path, query)) => (path.to_string(), query.to_string()),
        None => (url.to_string(), String::new()),
    }
}
