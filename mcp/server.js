#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

const instructions = [
  "FastTask はローカルのタスクアプリ。操作の前に search_tasks で現状を確認する。",
  "プロジェクトはタイトル先頭の `:名前`。小タスクは同じプロジェクトの parentId。深さは5段まで。",
  "親を完了するときは、未完了の子があると children pending になる。子から終えるか、cascade を true にする。",
  "delete_tasks は子孫も消す。clear_all_data は confirm に delete が必要。",
  "Google のシークレットとブラウザ接続はアプリの設定画面で行う。google_sync は状態の確認、同期スイッチ、今すぐ同期に使う。",
].join("\n");

const server = new McpServer(
  { name: "fasttask", version: "1.5.0" },
  { instructions },
);

registerTools(server);

await server.connect(new StdioServerTransport());
