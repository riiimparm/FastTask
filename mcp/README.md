# FastTask MCP サーバ

FastTask の画面と同じ操作を、MCP の tools として出す stdio サーバ。
公式 SDK (`@modelcontextprotocol/sdk`) を使い、initialize、tools/list、tools/call に対応する。

必要条件: Node 22+。操作先の FastTask アプリが起動していること。

## 仕組み

FastTask は起動時に `app_data_dir/api.json` へ実ポートと認証トークンを書き出す。

- macOS: `~/Library/Application Support/com.fasttask.desktop/api.json`
- Linux: `~/.local/share/com.fasttask.desktop/api.json`
- Windows: `%APPDATA%\com.fasttask.desktop\api.json`

MCP サーバはこのファイルを毎リクエスト読み直す。環境変数
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

リポジトリの依存を入れてから起動する。

```sh
pnpm install
node mcp/server.js
```

## tools

| tool | 内容 |
| --- | --- |
| `search_tasks` | キーワード、状態、プロジェクト、タグ、期限、MUST、確認待ちで探す |
| `get_task` | 1件取得 |
| `add_tasks` | 入力欄と同じ文、またはフィールド指定で追加 |
| `edit_task` | タイトル、プロジェクト、期限、URL、タグ、MUST、確認待ち、親 |
| `set_task_status` | 完了 / 未完了。子が残っている親は cascade が必要 |
| `delete_tasks` | 削除（子孫も消える） |
| `reorder_tasks` | 未完了の並び替え |
| `reorder_projects` | プロジェクト見出しの並び替え |
| `list_tags` / `save_tag` / `delete_tag` | タグマスタ |
| `get_settings` / `update_settings` | 表示設定とフォーカスの分数 |
| `copy_list` | 画面のコピーと同じ Markdown |
| `daily_result` | リザルト集計 |
| `record_focus` | フォーカス時間を記録 |
| `clear_all_data` | タスクとタグを全削除（`confirm: "delete"`） |
| `google_sync` | 連携の状態、同期スイッチ、今すぐ同期、タスクリスト一覧 |

クライアントシークレットとブラウザでの Google 接続はアプリの設定画面だけで行う。

## HTTP API を直接叩く

全リクエストに `Authorization: Bearer <token>` が必須 (無いと 401)。
既存の `GET/POST /tasks`、`PATCH/DELETE /tasks/:id` はそのまま使える。
追加分は `POST /tasks/batch`、`POST /tasks/status`、`POST /tasks/delete`、
`POST /tasks/reorder`、`POST /projects/reorder`、`/tags`、`/settings`、
`GET /export`、`GET /result`、`POST /focus`、`POST /data/clear`、`/google`。

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
プロトコルの確認は `pnpm test` の中の `mcp/protocol.test.js` が行う。
