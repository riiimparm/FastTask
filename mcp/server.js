#!/usr/bin/env node
// FastTask MCP stdio bridge -> ローカルHTTP API。依存なし (Node 18+ の fetch を使用)。
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const APP_DATA_DIR =
  process.env.FASTTASK_APP_DATA_DIR ||
  (process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support", "com.fasttask.desktop")
    : process.platform === "win32"
      ? join(process.env.APPDATA || "", "com.fasttask.desktop")
      : join(homedir(), ".local", "share", "com.fasttask.desktop"));

function config() {
  let port = process.env.FASTTASK_PORT;
  let token = process.env.FASTTASK_TOKEN;
  if (!port || !token) {
    const f = JSON.parse(readFileSync(join(APP_DATA_DIR, "api.json"), "utf8"));
    port ||= f.port;
    token ||= f.token;
  }
  return { base: `http://127.0.0.1:${port}`, token };
}

async function api(method, path, body) {
  const { base, token } = config();
  const res = await fetch(base + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text}`);
  return text;
}

const TOOLS = [
  {
    name: "list_tasks",
    description: "FastTask のタスク一覧を取得する",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string", enum: ["todo", "done"] } },
    },
    run: (a) => api("GET", `/tasks${a.status ? `?status=${encodeURIComponent(a.status)}` : ""}`),
  },
  {
    name: "create_task",
    description: "FastTask にタスクを作成する",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        dueDate: { type: "string", description: "ISO 日付 (YYYY-MM-DD)" },
        url: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["title"],
    },
    run: (a) => api("POST", "/tasks", a),
  },
  {
    name: "update_task",
    description: "タスクを部分更新する (title / status / dueDate / url / tags)",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        status: { type: "string", enum: ["todo", "done"] },
        dueDate: { type: "string" },
        url: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
    run: ({ id, ...patch }) => api("PATCH", `/tasks/${encodeURIComponent(id)}`, patch),
  },
  {
    name: "delete_task",
    description: "タスクを削除する (子タスクも削除される)",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    run: ({ id }) => api("DELETE", `/tasks/${encodeURIComponent(id)}`),
  },
];

function send(msg) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
}

async function handle(req) {
  switch (req.method) {
    case "initialize":
      return {
        protocolVersion: req.params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "fasttask", version: "0.1.0" },
      };
    case "tools/list":
      return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === req.params?.name);
      if (!tool) throw new Error(`unknown tool: ${req.params?.name}`);
      const text = await tool.run(req.params.arguments || {});
      return { content: [{ type: "text", text }] };
    }
    default:
      throw new Error(`unknown method: ${req.method}`);
  }
}

createInterface({ input: process.stdin }).on("line", async (line) => {
  if (!line.trim()) return;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  try {
    const result = await handle(req);
    if (req.id !== undefined) send({ id: req.id, result });
  } catch (e) {
    if (req.id !== undefined) send({ id: req.id, error: { code: -32000, message: String(e.message || e) } });
  }
});
