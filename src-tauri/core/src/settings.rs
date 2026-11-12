use serde_json::{json, Map, Value};

use crate::model::{bool_flag, err, ApiResult};

pub fn effective_settings(data: &Value) -> Value {
    let mut settings = defaults();
    if let Some(stored) = data.get("settings").and_then(Value::as_object) {
        let object = settings.as_object_mut().unwrap();
        for (key, value) in stored {
            object.insert(key.clone(), value.clone());
        }
    }
    settings
}

pub fn defaults() -> Value {
    json!({
        "autoDeleteOldCompleted": true,
        "groupingEnabled": true,
        "copyGroupingEnabled": true,
        "showDueDate": false,
        "tagsEnabled": false,
        "urlEnabled": true,
        "soundEnabled": false,
        "focusShortcut": "",
        "lastFocusMinutes": 25,
        "theme": "system",
        "language": "ja"
    })
}

pub fn language_of(data: &Value) -> String {
    effective_settings(data)
        .get("language")
        .and_then(Value::as_str)
        .unwrap_or("ja")
        .to_string()
}

pub fn url_enabled(data: &Value) -> bool {
    bool_flag(data, "urlEnabled", true)
}

pub fn patch_settings(data: &mut Value, patch: &Value) -> ApiResult<Value> {
    let Some(patch) = patch.as_object() else {
        return Err(err(400, "body must be a JSON object"));
    };
    if patch.is_empty() {
        return Err(err(400, "settings patch is empty"));
    }
    let mut stored = data
        .get("settings")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_else(Map::new);
    for (key, value) in patch {
        match key.as_str() {
            "autoDeleteOldCompleted"
            | "groupingEnabled"
            | "copyGroupingEnabled"
            | "showDueDate"
            | "tagsEnabled"
            | "urlEnabled"
            | "soundEnabled" => {
                let flag = value
                    .as_bool()
                    .ok_or_else(|| err(400, format!("{key} must be a boolean")))?;
                stored.insert(key.clone(), json!(flag));
            }
            "theme" => {
                let theme = value
                    .as_str()
                    .ok_or_else(|| err(400, "theme must be light, dark, or system"))?;
                if !matches!(theme, "light" | "dark" | "system") {
                    return Err(err(400, "theme must be light, dark, or system"));
                }
                stored.insert(key.clone(), json!(theme));
            }
            "language" => {
                let language = value
                    .as_str()
                    .ok_or_else(|| err(400, "language must be ja or en"))?;
                if !matches!(language, "ja" | "en") {
                    return Err(err(400, "language must be ja or en"));
                }
                stored.insert(key.clone(), json!(language));
            }
            "focusShortcut" => {
                let shortcut = value
                    .as_str()
                    .ok_or_else(|| err(400, "focusShortcut must be a string"))?;
                if shortcut.chars().count() > 100 {
                    return Err(err(400, "focusShortcut is too long"));
                }
                stored.insert(key.clone(), json!(shortcut));
            }
            "lastFocusMinutes" => {
                let minutes = value
                    .as_f64()
                    .ok_or_else(|| err(400, "lastFocusMinutes must be a number"))?;
                if !(1.0..=120.0).contains(&minutes) || minutes.fract() != 0.0 {
                    return Err(err(400, "lastFocusMinutes must be an integer from 1 to 120"));
                }
                stored.insert(key.clone(), json!(minutes as i64));
            }
            "focusMinutesByDate" => {
                validate_focus_map(value)?;
                stored.insert(key.clone(), value.clone());
            }
            _ => return Err(err(400, format!("unknown setting: {key}"))),
        }
    }
    data["settings"] = Value::Object(stored);
    Ok(effective_settings(data))
}

pub fn add_focus(data: &mut Value, minutes: f64, date: &str) -> ApiResult<Value> {
    if !(minutes > 0.0 && minutes <= 24.0 * 60.0) {
        return Err(err(400, "minutes must be greater than 0 and at most 1440"));
    }
    if !is_iso_day(date) {
        return Err(err(400, "date must be YYYY-MM-DD"));
    }
    let mut stored = data
        .get("settings")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_else(Map::new);
    let mut map = stored
        .get("focusMinutesByDate")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_else(Map::new);
    let prev = map.get(date).and_then(Value::as_f64).unwrap_or(0.0);
    map.insert(date.to_string(), json!(prev + minutes));
    let total = prev + minutes;
    stored.insert("focusMinutesByDate".into(), Value::Object(map));
    data["settings"] = Value::Object(stored);
    Ok(json!({ "date": date, "focusMinutes": total }))
}

fn validate_focus_map(value: &Value) -> ApiResult<()> {
    let Some(map) = value.as_object() else {
        return Err(err(400, "focusMinutesByDate must be an object"));
    };
    for (day, minutes) in map {
        if !is_iso_day(day) {
            return Err(err(400, "focusMinutesByDate keys must be YYYY-MM-DD"));
        }
        let Some(minutes) = minutes.as_f64() else {
            return Err(err(400, "focus minutes must be numbers"));
        };
        if minutes < 0.0 || minutes > 24.0 * 60.0 * 31.0 {
            return Err(err(400, "focus minutes are out of range"));
        }
    }
    Ok(())
}

pub fn is_iso_day(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let Ok(year) = value[0..4].parse::<i32>() else { return false };
    let Ok(month) = value[5..7].parse::<u32>() else { return false };
    let Ok(day) = value[8..10].parse::<u32>() else { return false };
    chrono::NaiveDate::from_ymd_opt(year, month, day).is_some()
}
