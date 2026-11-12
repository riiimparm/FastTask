//! 画面なしで data.json API を立てる。アプリ本体と同じルーティング。
//! Google への push とタスクリスト取得はアプリプロセス内だけで動く。
use std::env;
use std::io::Read;
use std::path::PathBuf;

fn main() {
    let dir = PathBuf::from(env::var("FASTTASK_DIR").expect("FASTTASK_DIR is required"));
    let token = env::var("FASTTASK_TOKEN").expect("FASTTASK_TOKEN is required");
    let port: u16 = env::var("FASTTASK_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .expect("FASTTASK_PORT is required");
    let server = tiny_http::Server::http(("127.0.0.1", port)).expect("bind");
    eprintln!("fasttask-api listening");
    for mut req in server.incoming_requests() {
        let method = req.method().as_str().to_string();
        let url = req.url().to_string();
        let auth = req
            .headers()
            .iter()
            .find(|h| h.field.equiv("Authorization"))
            .map(|h| h.value.as_str().to_string());
        let mut body = String::new();
        if matches!(method.as_str(), "POST" | "PATCH" | "PUT") {
            let _ = req
                .as_reader()
                .take((fasttask_core::MAX_BODY as u64) + 1)
                .read_to_string(&mut body);
        }
        let res = fasttask_core::handle(&dir, &token, &method, &url, auth.as_deref(), &body);
        let header =
            tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap();
        let response = tiny_http::Response::from_string(res.body.to_string())
            .with_status_code(res.status)
            .with_header(header);
        let _ = req.respond(response);
    }
}
