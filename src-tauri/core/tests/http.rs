use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

use serde_json::{json, Value};

static SEQ: AtomicU64 = AtomicU64::new(0);

struct Dir(PathBuf);

impl Dir {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "fasttask-core-{}-{}",
            std::process::id(),
            SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for Dir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn call(dir: &Dir, method: &str, url: &str, body: &str) -> (u16, Value) {
    let response = fasttask_core::handle(
        &dir.0,
        "test-token",
        method,
        url,
        Some("Bearer test-token"),
        body,
    );
    (response.status, response.body)
}

fn call_anon(dir: &Dir, method: &str, url: &str) -> u16 {
    fasttask_core::handle(&dir.0, "test-token", method, url, None, "").status
}

#[test]
fn rejects_missing_token_and_keeps_create_contract() {
    let dir = Dir::new();
    assert_eq!(call_anon(&dir, "GET", "/tasks"), 401);

    let (status, created) = call(&dir, "POST", "/tasks", r#"{"title":"  資料  ","tags":["a"]}"#);
    assert_eq!(status, 200);
    assert_eq!(created["title"], "資料");
    assert_eq!(created["status"], "todo");
    assert_eq!(created["tags"], json!(["a"]));
    assert_eq!(created["order"], 0);
    let id = created["id"].as_str().unwrap().to_string();

    let (status, second) = call(&dir, "POST", "/tasks", r#"{"title":"next"}"#);
    assert_eq!(status, 200);
    assert_eq!(second["order"], 1);

    let (status, listed) = call(&dir, "GET", "/tasks?status=todo", "");
    assert_eq!(status, 200);
    assert_eq!(listed["tasks"].as_array().unwrap().len(), 2);

    let (status, _) = call(&dir, "GET", "/tasks?status=nope", "");
    assert_eq!(status, 400);

    let (status, updated) = call(
        &dir,
        "PATCH",
        &format!("/tasks/{id}"),
        r#"{"status":"done","dueDate":null}"#,
    );
    assert_eq!(status, 200);
    assert_eq!(updated["status"], "done");
    assert!(updated["completedAt"].as_str().is_some());
    assert!(updated["dueDate"].is_null());

    let (status, _) = call(&dir, "PATCH", &format!("/tasks/{id}"), r#"{"tags":"x"}"#);
    assert_eq!(status, 400);

    let (status, deleted) = call(&dir, "DELETE", &format!("/tasks/{id}"), "");
    assert_eq!(status, 200);
    assert_eq!(deleted["deleted"], id);
    let (status, _) = call(&dir, "DELETE", &format!("/tasks/{id}"), "");
    assert_eq!(status, 404);
}

#[test]
fn parses_input_box_text_and_splits_on_commas() {
    let dir = Dir::new();
    call(
        &dir,
        "POST",
        "/tags",
        r##"{"name":"開発","color":"#007AFF","keywords":["資料"]}"##,
    );
    let (status, created) = call(
        &dir,
        "POST",
        "/tasks/batch",
        r#"{"text":":work 資料 tomorrow https://example.com/a, レビュー"}"#,
    );
    assert_eq!(status, 200, "{created}");
    let tasks = created["tasks"].as_array().unwrap();
    assert_eq!(tasks.len(), 2);
    assert_eq!(tasks[0]["projectName"], "work");
    assert_eq!(tasks[0]["url"], "https://example.com/a");
    assert!(tasks[0]["dueDate"].as_str().unwrap().len() == 10);
    assert_eq!(tasks[0]["dueDate"], tasks[1]["dueDate"]);
    assert_eq!(tasks[1]["projectName"], "work");
    assert_eq!(tasks[1]["title"], ":work レビュー");
    let tags = tasks[0]["tags"].as_array().unwrap();
    assert_eq!(tags.len(), 1);

    let (status, found) = call(&dir, "GET", "/tasks?q=レビュー&project=work&order=ui", "");
    assert_eq!(status, 200);
    assert_eq!(found["count"], 1);
}

#[test]
fn search_filters_tags_due_and_must() {
    let dir = Dir::new();
    let today = fasttask_core::local_today();
    let (_, tag) = call(&dir, "POST", "/tags", r#"{"name":"家事","keywords":[]}"#);
    let tag_id = tag["id"].as_str().unwrap();
    call(
        &dir,
        "POST",
        "/tasks",
        &format!(r#"{{"title":"洗濯","tags":["家事"],"dueDate":"{today}","isMinimum":true}}"#),
    );
    call(
        &dir,
        "POST",
        "/tasks",
        r#"{"title":"別件","projectName":"other","isPending":true}"#,
    );
    let (status, listed) = call(&dir, "GET", &format!("/tasks?tag={tag_id}&must=true"), "");
    assert_eq!(status, 200);
    assert_eq!(listed["count"], 1);
    assert_eq!(listed["tasks"][0]["title"], "洗濯");

    let (status, pending) = call(&dir, "GET", "/tasks?pending=true&project=other", "");
    assert_eq!(status, 200);
    assert_eq!(pending["count"], 1);

    let (status, due) = call(&dir, "GET", "/tasks?due=today", "");
    assert_eq!(status, 200);
    assert_eq!(due["count"], 1);
}

#[test]
fn nests_within_project_and_refuses_cycles_and_depth() {
    let dir = Dir::new();
    let parent = call(&dir, "POST", "/tasks", r#"{"title":"親","projectName":"p"}"#).1;
    let child = call(&dir, "POST", "/tasks", r#"{"title":"子","projectName":"p"}"#).1;
    let other = call(&dir, "POST", "/tasks", r#"{"title":"他","projectName":"q"}"#).1;
    let parent_id = parent["id"].as_str().unwrap();
    let child_id = child["id"].as_str().unwrap();
    let other_id = other["id"].as_str().unwrap();

    let (status, _) = call(
        &dir,
        "PATCH",
        &format!("/tasks/{other_id}"),
        &format!(r#"{{"parentId":"{parent_id}"}}"#),
    );
    assert_eq!(status, 400);

    let (status, nested) = call(
        &dir,
        "PATCH",
        &format!("/tasks/{child_id}"),
        &format!(r#"{{"parentId":"{parent_id}"}}"#),
    );
    assert_eq!(status, 200, "{nested}");
    assert_eq!(nested["parentId"], parent_id);
    assert!(nested["order"].as_i64().unwrap() > parent["order"].as_i64().unwrap_or(0));

    let (status, _) = call(
        &dir,
        "PATCH",
        &format!("/tasks/{parent_id}"),
        &format!(r#"{{"parentId":"{child_id}"}}"#),
    );
    assert_eq!(status, 400);

    let mut current = child_id.to_string();
    for index in 0..4 {
        let (status, created) = call(
            &dir,
            "POST",
            "/tasks",
            &format!(r#"{{"title":"d{index}","projectName":"p","parentId":"{current}"}}"#),
        );
        if index < 3 {
            assert_eq!(status, 200, "{created}");
            current = created["id"].as_str().unwrap().to_string();
        } else {
            assert_eq!(status, 400, "{created}");
        }
    }
}

#[test]
fn complete_blocks_on_open_children_unless_cascade_and_delete_is_recursive() {
    let dir = Dir::new();
    let parent = call(&dir, "POST", "/tasks", r#"{"title":"親"}"#).1["id"].as_str().unwrap().to_string();
    let child = call(
        &dir,
        "POST",
        "/tasks",
        &format!(r#"{{"title":"子","parentId":"{parent}"}}"#),
    )
    .1["id"]
        .as_str()
        .unwrap()
        .to_string();
    let grand = call(
        &dir,
        "POST",
        "/tasks",
        &format!(r#"{{"title":"孫","parentId":"{child}"}}"#),
    )
    .1["id"]
        .as_str()
        .unwrap()
        .to_string();

    let (status, blocked) = call(
        &dir,
        "POST",
        "/tasks/status",
        &format!(r#"{{"id":"{parent}","status":"done"}}"#),
    );
    assert_eq!(status, 409, "{blocked}");
    assert_eq!(call(&dir, "GET", &format!("/tasks/{child}"), "").1["status"], "todo");

    let (status, done) = call(
        &dir,
        "POST",
        "/tasks/status",
        &format!(r#"{{"id":"{parent}","status":"done","cascade":true}}"#),
    );
    assert_eq!(status, 200, "{done}");
    assert_eq!(call(&dir, "GET", &format!("/tasks/{grand}"), "").1["status"], "done");

    let (status, _) = call(
        &dir,
        "POST",
        "/tasks/status",
        &format!(r#"{{"id":"{parent}","status":"todo"}}"#),
    );
    assert_eq!(status, 200);
    assert_eq!(call(&dir, "GET", &format!("/tasks/{parent}"), "").1["status"], "todo");
    assert_eq!(call(&dir, "GET", &format!("/tasks/{child}"), "").1["status"], "done");

    let (status, deleted) = call(&dir, "DELETE", &format!("/tasks/{parent}"), "");
    assert_eq!(status, 200, "{deleted}");
    let also = deleted["alsoDeleted"].as_array().unwrap();
    assert!(also.iter().any(|id| id.as_str() == Some(child.as_str())));
    assert!(also.iter().any(|id| id.as_str() == Some(grand.as_str())));
    assert_eq!(call(&dir, "GET", "/tasks", "").1["count"], 0);
}

#[test]
fn reorder_detaches_a_child_moved_above_its_parent() {
    let dir = Dir::new();
    let parent = call(&dir, "POST", "/tasks", r#"{"title":"親","projectName":"p"}"#).1["id"]
        .as_str()
        .unwrap()
        .to_string();
    let child = call(
        &dir,
        "POST",
        "/tasks",
        &format!(r#"{{"title":"子","projectName":"p","parentId":"{parent}"}}"#),
    )
    .1["id"]
        .as_str()
        .unwrap()
        .to_string();
    let (status, _) = call(
        &dir,
        "POST",
        "/tasks/reorder",
        &format!(r#"{{"ids":["{child}","{parent}"]}}"#),
    );
    assert_eq!(status, 200);
    let child_task = call(&dir, "GET", &format!("/tasks/{child}"), "").1;
    assert!(child_task["parentId"].is_null());
    assert_eq!(child_task["order"], 0);
}

#[test]
fn project_reorder_and_flag_cascade() {
    let dir = Dir::new();
    call(&dir, "POST", "/tasks", r#"{"title":"a","projectName":"A"}"#);
    call(&dir, "POST", "/tasks", r#"{"title":"b","projectName":"B"}"#);
    let parent = call(&dir, "POST", "/tasks", r#"{"title":"親","projectName":"A"}"#).1["id"]
        .as_str()
        .unwrap()
        .to_string();
    let child = call(
        &dir,
        "POST",
        "/tasks",
        &format!(r#"{{"title":"子","projectName":"A","parentId":"{parent}"}}"#),
    )
    .1["id"]
        .as_str()
        .unwrap()
        .to_string();
    let (status, _) = call(
        &dir,
        "POST",
        "/projects/reorder",
        r#"{"projects":["B","A"]}"#,
    );
    assert_eq!(status, 200);
    let b = call(&dir, "GET", "/tasks?project=B", "").1["tasks"][0]["order"].as_i64().unwrap();
    let a = call(&dir, "GET", "/tasks?project=A&parent=none", "").1["tasks"][0]["order"]
        .as_i64()
        .unwrap();
    assert!(b < a);

    let (status, _) = call(
        &dir,
        "PATCH",
        &format!("/tasks/{parent}"),
        r#"{"isMinimum":true,"isPending":true}"#,
    );
    assert_eq!(status, 200);
    let child_task = call(&dir, "GET", &format!("/tasks/{child}"), "").1;
    assert_eq!(child_task["isMinimum"], true);
    assert_eq!(child_task["isPending"], true);
}

#[test]
fn tags_apply_keywords_and_delete_strips_them() {
    let dir = Dir::new();
    call(&dir, "POST", "/tasks", r#"{"title":"APIを直す"}"#);
    let (status, tag) = call(
        &dir,
        "POST",
        "/tags",
        r#"{"name":"開発","keywords":["API"]}"#,
    );
    assert_eq!(status, 200, "{tag}");
    let id = tag["id"].as_str().unwrap();
    let task = call(&dir, "GET", "/tasks?q=API", "").1["tasks"][0].clone();
    assert_eq!(task["tags"][0], id);

    let (status, _) = call(
        &dir,
        "PATCH",
        &format!("/tags/{id}"),
        r#"{"keywords":["API","直す"]}"#,
    );
    assert_eq!(status, 200);
    let (status, _) = call(&dir, "DELETE", &format!("/tags/{id}"), "");
    assert_eq!(status, 200);
    let task = call(&dir, "GET", "/tasks", "").1["tasks"][0].clone();
    assert!(task["tags"].as_array().unwrap().is_empty());
}

#[test]
fn settings_focus_clear_and_google_do_not_leak_secrets() {
    let dir = Dir::new();
    call(&dir, "POST", "/tasks", r#"{"title":"残す"}"#);
    let (status, settings) = call(
        &dir,
        "PATCH",
        "/settings",
        r#"{"theme":"dark","language":"en","groupingEnabled":false,"lastFocusMinutes":40}"#,
    );
    assert_eq!(status, 200, "{settings}");
    assert_eq!(settings["theme"], "dark");
    assert_eq!(settings["language"], "en");
    assert_eq!(call(&dir, "GET", "/settings", "").1["lastFocusMinutes"], 40);
    assert_eq!(call(&dir, "PATCH", "/settings", r#"{"nope":true}"#).0, 400);

    let (status, focus) = call(&dir, "POST", "/focus", r#"{"minutes":25}"#);
    assert_eq!(status, 200, "{focus}");
    assert_eq!(focus["focusMinutes"], 25.0);

    fs::write(
        dir.0.join("google.json"),
        r#"{"client_secret":"super-secret-value","refresh_token":"refresh-value","client_id":"id","email":"a@b.c","calendar_id":"primary","tasklist_id":"@default","auto_push":false,"push_calendar":true,"push_tasks":true}"#,
    )
    .unwrap();
    let (status, google) = call(&dir, "GET", "/google", "");
    assert_eq!(status, 200);
    let encoded = google.to_string();
    assert!(!encoded.contains("super-secret-value"));
    assert!(!encoded.contains("refresh-value"));
    assert!(!encoded.contains("client_secret"));
    assert_eq!(google["connected"], true);
    assert_eq!(google["hasSecret"], true);
    assert_eq!(
        call(&dir, "PATCH", "/google", r#"{"clientSecret":"nope"}"#).0,
        400
    );
    let (status, patched) = call(&dir, "PATCH", "/google", r#"{"autoPush":true}"#);
    assert_eq!(status, 200, "{patched}");
    assert_eq!(patched["autoPush"], true);
    let stored = fs::read_to_string(dir.0.join("google.json")).unwrap();
    assert!(stored.contains("super-secret-value"));

    assert_eq!(call(&dir, "POST", "/data/clear", r#"{"confirm":"no"}"#).0, 400);
    let (status, cleared) = call(&dir, "POST", "/data/clear", r#"{"confirm":"delete"}"#);
    assert_eq!(status, 200, "{cleared}");
    assert_eq!(call(&dir, "GET", "/tasks", "").1["count"], 0);
    assert_eq!(call(&dir, "GET", "/settings", "").1["theme"], "dark");
}

#[test]
fn export_and_result_match_the_screen_definitions() {
    let dir = Dir::new();
    let today = "2026-11-09";
    let data = json!({
        "version": "1",
        "tags": [{"id":"tag1","name":"開発","color":"#000","keywords":[]}],
        "settings": {"language":"ja","copyGroupingEnabled":false,"urlEnabled":true,"focusMinutesByDate":{"2026-11-09":30}},
        "tasks": [
            {"id":"a","title":"one","status":"done","tags":["tag1"],"createdAt":"2026-11-09T00:00:00.000Z","completedAt":"2026-11-09T10:00:00.000Z","order":0,"isMinimum":true,"projectName":"A"},
            {"id":"b","title":"two","status":"done","tags":[],"createdAt":"2026-11-09T00:00:00.000Z","completedAt":"2026-11-09T11:00:00.000Z","order":1,"isMinimum":true,"projectName":"A"},
            {"id":"c","title":"three","status":"done","tags":[],"createdAt":"2026-11-09T00:00:00.000Z","completedAt":"2026-11-09T12:00:00.000Z","order":2,"projectName":"B"},
            {"id":"d","title":"old","status":"done","tags":[],"createdAt":"2026-11-08T00:00:00.000Z","completedAt":"2026-11-08T12:00:00.000Z","order":3},
            {"id":"e","title":"left","status":"todo","tags":[],"createdAt":"2026-11-09T00:00:00.000Z","order":4,"isMinimum":true},
            {"id":"f","title":"plain","status":"todo","tags":[],"createdAt":"2026-11-09T00:00:00.000Z","order":5}
        ]
    });
    fs::write(dir.0.join("data.json"), serde_json::to_string_pretty(&data).unwrap()).unwrap();
    let (status, result) = call(&dir, "GET", &format!("/result?date={today}"), "");
    assert_eq!(status, 200, "{result}");
    assert_eq!(result["completedCount"], 3);
    assert_eq!(result["mustDone"], 2);
    assert_eq!(result["mustRemaining"], 1);
    assert_eq!(result["rate"], 75);
    assert_eq!(result["type"]["code"], "STEADY");
    assert_eq!(result["streak"], 2);
    assert_eq!(result["topProject"]["name"], "A");
    assert_eq!(result["topTag"]["name"], "開発");
    assert!(result["shareText"].as_str().unwrap().contains("完了 3件"));
    assert_eq!(result["focusMinutes"], 30.0);

    let (status, exported) = call(
        &dir,
        "GET",
        &format!("/export?target=today&date={today}&grouping=false"),
        "",
    );
    assert_eq!(status, 200, "{exported}");
    let markdown = exported["markdown"].as_str().unwrap();
    assert!(markdown.contains("## 2026-11-09 完了タスク"), "{markdown}");
    assert!(markdown.contains("- one #開発"), "{markdown}");
    assert!(!markdown.contains("old"));
}

#[test]
fn editing_a_title_parses_project_and_url_but_not_the_date() {
    let dir = Dir::new();
    let (status, created) = call(&dir, "POST", "/tasks", r#"{"title":"memo"}"#);
    assert_eq!(status, 200);
    let id = created["id"].as_str().unwrap();
    let (status, updated) = call(
        &dir,
        "PATCH",
        &format!("/tasks/{id}"),
        r#"{"title":":work 資料 明日 https://example.com/a","parseTitle":true}"#,
    );
    assert_eq!(status, 200, "{updated}");
    assert_eq!(updated["projectName"], "work");
    assert_eq!(updated["title"], ":work 資料 明日");
    assert_eq!(updated["url"], "https://example.com/a");
    assert!(updated.get("dueDate").is_none_or(|value| value.is_null()));
}
