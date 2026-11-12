//! google.json の公開ビュー。client_secret と refresh_token は読み書きの応答に出さない。
use std::fs;
use std::path::Path;

use serde_json::{json, Value};

use crate::model::{err, ApiResult};

const SECRET_KEYS: &[&str] = &[
    "clientSecret",
    "client_secret",
    "refreshToken",
    "refresh_token",
    "accessToken",
    "access_token",
    "token",
];

pub fn public_config(dir: &Path) -> ApiResult<Value> {
    let stored = read_raw(dir)?;
    Ok(public_view(&stored))
}

pub fn patch_config(dir: &Path, patch: &Value) -> ApiResult<Value> {
    let Some(patch) = patch.as_object() else {
        return Err(err(400, "body must be a JSON object"));
    };
    if patch.is_empty() {
        return Err(err(400, "google patch is empty"));
    }
    for key in SECRET_KEYS {
        if patch.contains_key(*key) {
            return Err(err(
                400,
                "client secrets and tokens are set in the FastTask settings window",
            ));
        }
    }
    let mut stored = read_raw(dir)?;
    let object = stored
        .as_object_mut()
        .ok_or_else(|| err(500, "google config must be an object"))?;
    for (key, value) in patch {
        match key.as_str() {
            "autoPush" => {
                object.insert("auto_push".into(), json!(expect_bool(value, "autoPush")?));
            }
            "pushCalendar" => {
                object.insert("push_calendar".into(), json!(expect_bool(value, "pushCalendar")?));
            }
            "pushTasks" => {
                object.insert("push_tasks".into(), json!(expect_bool(value, "pushTasks")?));
            }
            "calendarId" => {
                let text = expect_string(value, "calendarId")?;
                object.insert(
                    "calendar_id".into(),
                    json!(if text.is_empty() { "primary".to_string() } else { text }),
                );
            }
            "tasklistId" => {
                let text = expect_string(value, "tasklistId")?;
                object.insert(
                    "tasklist_id".into(),
                    json!(if text.is_empty() { "@default".to_string() } else { text }),
                );
            }
            "clientId" => {
                object.insert("client_id".into(), json!(expect_string(value, "clientId")?));
            }
            "email" => return Err(err(400, "email is set when FastTask connects to Google")),
            _ => return Err(err(400, format!("unknown google field: {key}"))),
        }
    }
    write_raw(dir, &stored)?;
    Ok(public_view(&stored))
}

fn expect_bool(value: &Value, field: &str) -> ApiResult<bool> {
    value
        .as_bool()
        .ok_or_else(|| err(400, format!("{field} must be a boolean")))
}

fn expect_string(value: &Value, field: &str) -> ApiResult<String> {
    value
        .as_str()
        .map(str::trim)
        .map(str::to_string)
        .ok_or_else(|| err(400, format!("{field} must be a string")))
}

fn read_raw(dir: &Path) -> ApiResult<Value> {
    let path = dir.join("google.json");
    let mut value = defaults();
    if !path.exists() {
        return Ok(value);
    }
    let text = fs::read_to_string(&path).map_err(|e| err(500, format!("read error: {e}")))?;
    let parsed: Value =
        serde_json::from_str(&text).map_err(|e| err(500, format!("parse error: {e}")))?;
    let Some(parsed) = parsed.as_object() else {
        return Err(err(500, "google.json must be an object"));
    };
    let object = value.as_object_mut().unwrap();
    for (key, item) in parsed {
        object.insert(key.clone(), item.clone());
    }
    Ok(value)
}

fn defaults() -> Value {
    json!({
        "client_id": "",
        "client_secret": "",
        "refresh_token": "",
        "email": "",
        "calendar_id": "primary",
        "tasklist_id": "@default",
        "auto_push": false,
        "push_calendar": true,
        "push_tasks": true
    })
}

fn public_view(stored: &Value) -> Value {
    let text = |key: &str| stored.get(key).and_then(Value::as_str).unwrap_or("").to_string();
    let flag = |key: &str, default: bool| stored.get(key).and_then(Value::as_bool).unwrap_or(default);
    let secret = text("client_secret");
    let refresh = text("refresh_token");
    json!({
        "connected": !refresh.is_empty(),
        "hasSecret": !secret.is_empty(),
        "clientId": text("client_id"),
        "email": text("email"),
        "calendarId": if text("calendar_id").is_empty() { "primary".into() } else { text("calendar_id") },
        "tasklistId": if text("tasklist_id").is_empty() { "@default".into() } else { text("tasklist_id") },
        "autoPush": flag("auto_push", false),
        "pushCalendar": flag("push_calendar", true),
        "pushTasks": flag("push_tasks", true),
    })
}

fn write_raw(dir: &Path, value: &Value) -> ApiResult<()> {
    fs::create_dir_all(dir).map_err(|e| err(500, format!("mkdir error: {e}")))?;
    let tmp = dir.join("google.json.tmp");
    let text = serde_json::to_string_pretty(value).map_err(|e| err(500, format!("serialize: {e}")))?;
    fs::write(&tmp, text).map_err(|e| err(500, format!("write error: {e}")))?;
    restrict(&tmp)?;
    fs::rename(&tmp, dir.join("google.json")).map_err(|e| err(500, format!("rename error: {e}")))?;
    Ok(())
}

#[cfg(unix)]
fn restrict(path: &Path) -> ApiResult<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|e| err(500, format!("chmod error: {e}")))
}

#[cfg(not(unix))]
fn restrict(_path: &Path) -> ApiResult<()> {
    Ok(())
}
