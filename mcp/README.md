# FastTask MCP サーバ

FastTask が起動時に立てるローカル HTTP API (127.0.0.1 のみ) を叩く、依存ゼロの MCP stdio ブリッジ。

必要条件: Node 18+ / FastTask アプリが起動していること。

## 仕組み

FastTask は起動時に `app_data_dir/api.json` へ実ポートと認証トークンを書き出す。

- macOS: `~/Library/Application Support/com.fasttask.desktop/api.json`
- Linux: `~/.local/share/com.fasttask.desktop/api.json`
- Windows: `%APPDATA%\com.fasttask.desktop\api.json`

MCP サーバはこのファイルを毎リクエスト読み直すので、設定は不要。環境変数
`FASTTASK_PORT` / `FASTTASK_TOKEN` / `FASTTASK_APP_DATA_DIR` で上書きできる。

## 登録

Claude Code:

```sh
claude mcp add fasttask -- node /absolute/path/to/FastTask/mcp/server.js
```

Claude Desktop (`claude_desktop_config.json`) / 手動設定:

```json
{
  "mcpServers": {
    "fasttask": {
      "command": "node",
      "args": ["/absolute/path/to/FastTask/mcp/server.js"]
    }
  }
}
```

## tools

| tool | 引数 |
| --- | --- |
| `list_tasks` | `status?` (`todo` \| `done`) |
| `create_task` | `title` (必須), `dueDate?`, `url?`, `tags?` |
| `update_task` | `id` (必須), `title?`, `status?`, `dueDate?`, `url?`, `tags?` |
| `delete_task` | `id` (必須) — 子タスクも一緒に削除 |

## HTTP API を直接叩く

全リクエストに `Authorization: Bearer <token>` が必須 (無いと 401)。

```sh
BASE=http://127.0.0.1:$(sed -n 's/.*"port": *\([0-9]*\).*/\1/p' ~/Library/Application\ Support/com.fasttask.desktop/api.json)
TOKEN=$(sed -n 's/.*"token": *"\([^"]*\)".*/\1/p' ~/Library/Application\ Support/com.fasttask.desktop/api.json)

curl "$BASE/tasks?status=todo" -H "Authorization: Bearer $TOKEN"
curl -X POST "$BASE/tasks" -H "Authorization: Bearer $TOKEN" -d '{"title":"資料を書く","dueDate":"2026-11-10"}'
curl -X PATCH "$BASE/tasks/<id>" -H "Authorization: Bearer $TOKEN" -d '{"status":"done"}'
curl -X DELETE "$BASE/tasks/<id>" -H "Authorization: Bearer $TOKEN"
```

## 動作確認

FastTask を起動した状態で:

```sh
sh mcp/smoke.sh
```

トークン無し → 401、作成 → 一覧に出る、を確認して後片付けする。
