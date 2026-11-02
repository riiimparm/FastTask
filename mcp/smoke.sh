#!/bin/sh
# FastTask ローカルAPI の最小動作確認。FastTask を起動した状態で実行する。
#   sh mcp/smoke.sh
set -e
DIR="${FASTTASK_APP_DATA_DIR:-$HOME/Library/Application Support/com.fasttask.desktop}"
PORT=$(sed -n 's/.*"port": *\([0-9]*\).*/\1/p' "$DIR/api.json")
TOKEN=$(sed -n 's/.*"token": *"\([^"]*\)".*/\1/p' "$DIR/api.json")
BASE="http://127.0.0.1:$PORT"

code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/tasks")
[ "$code" = "401" ] || { echo "FAIL: トークン無しが $code (401 期待)"; exit 1; }
echo "ok: トークン無し -> 401"

TITLE="smoke-$(date +%s)"
ID=$(curl -s -X POST "$BASE/tasks" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"title\":\"$TITLE\"}" \
  | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
[ -n "$ID" ] || { echo "FAIL: 作成できなかった"; exit 1; }
echo "ok: 作成 id=$ID"

curl -s "$BASE/tasks?status=todo" -H "Authorization: Bearer $TOKEN" | grep -q "$TITLE" \
  || { echo "FAIL: 一覧に出ない"; exit 1; }
echo "ok: 一覧に出る"

curl -s -X DELETE "$BASE/tasks/$ID" -H "Authorization: Bearer $TOKEN" >/dev/null
echo "ok: 後片付け完了 — PASS"
