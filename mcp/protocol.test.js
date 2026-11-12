import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(root, "src-tauri/core/target/debug/fasttask-api");
const token = "test-token";

let dir;
let apiProc;
let client;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function waitFor(stream, needle) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${needle}`)), 8000);
    stream.on("data", (chunk) => {
      buf += chunk.toString();
      if (buf.includes(needle)) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

function textOf(result) {
  const block = result.content?.find((item) => item.type === "text");
  return block?.text ?? "";
}

async function tool(name, args = {}) {
  return client.callTool({ name, arguments: args });
}

test.before(async () => {
  execFileSync(
    "cargo",
    ["+stable", "build", "--manifest-path", "src-tauri/core/Cargo.toml", "--bin", "fasttask-api"],
    { cwd: root, stdio: "inherit" },
  );
  dir = await mkdtemp(path.join(tmpdir(), "fasttask-mcp-"));
  const port = await freePort();
  apiProc = spawn(bin, [], {
    env: {
      ...process.env,
      FASTTASK_DIR: dir,
      FASTTASK_PORT: String(port),
      FASTTASK_TOKEN: token,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  await waitFor(apiProc.stderr, "listening");
  client = new Client({ name: "fasttask-protocol-test", version: "0.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "mcp/server.js")],
    env: {
      ...process.env,
      FASTTASK_PORT: String(port),
      FASTTASK_TOKEN: token,
    },
    stderr: "pipe",
  });
  await client.connect(transport);
});

test.after(async () => {
  await client?.close().catch(() => {});
  apiProc?.kill();
  if (dir) await rm(dir, { recursive: true, force: true });
});

let gate = Promise.resolve();
function testSerial(name, fn) {
  test(name, async () => {
    const turn = gate;
    let release;
    gate = new Promise((resolve) => {
      release = resolve;
    });
    await turn;
    try {
      await fn();
    } finally {
      release();
    }
  });
}

testSerial("initialize exposes tools and answers ping", async () => {
  const capabilities = client.getServerCapabilities();
  assert.ok(capabilities?.tools);
  assert.match(client.getInstructions() ?? "", /search_tasks/);
  assert.equal(client.getServerVersion()?.name, "fasttask");
  const pong = await client.ping();
  assert.deepEqual(pong, {});
});

testSerial("tools/list has schemas an agent can fill in", async () => {
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name);
  for (const name of [
    "search_tasks",
    "add_tasks",
    "edit_task",
    "set_task_status",
    "delete_tasks",
    "reorder_tasks",
    "reorder_projects",
    "save_tag",
    "copy_list",
    "daily_result",
    "google_sync",
  ]) {
    assert.ok(names.includes(name), name);
  }
  for (const tool of listed.tools) {
    assert.equal(typeof tool.description, "string");
    assert.ok(tool.description.length > 10);
    assert.equal(tool.inputSchema.type, "object");
  }
});

testSerial("tools/call creates, edits, completes, and deletes like the app", async () => {
  const added = await tool("add_tasks", { text: ":work 資料 tomorrow, レビュー" });
  assert.notEqual(added.isError, true, textOf(added));
  const created = JSON.parse(textOf(added)).tasks;
  assert.equal(created.length, 2);
  assert.equal(created[0].projectName, "work");
  assert.equal(created[1].projectName, "work");
  const parent = created[0].id;
  const child = created[1].id;

  const found = JSON.parse(textOf(await tool("search_tasks", { query: "レビュー", project: "work", status: "todo" })));
  assert.equal(found.count, 1);

  const nested = await tool("edit_task", { id: child, parentId: parent });
  assert.notEqual(nested.isError, true, textOf(nested));
  assert.equal(JSON.parse(textOf(nested)).parentId, parent);

  const blocked = await tool("set_task_status", { id: parent, status: "done" });
  assert.equal(blocked.isError, true);
  assert.match(textOf(blocked), /children pending/);

  const done = await tool("set_task_status", { id: parent, status: "done", cascade: true });
  assert.notEqual(done.isError, true, textOf(done));

  const markdown = textOf(await tool("copy_list", { target: "todo" }));
  assert.match(markdown, /未完了タスク|Todo Tasks/);

  const result = JSON.parse(textOf(await tool("daily_result")));
  assert.equal(typeof result.completedCount, "number");
  assert.ok(result.shareText);

  const removed = await tool("delete_tasks", { id: parent });
  assert.notEqual(removed.isError, true, textOf(removed));
  const also = JSON.parse(textOf(removed)).alsoDeleted;
  assert.ok(also.includes(child));
});

testSerial("settings, focus, tags, and google status stay free of secrets", async () => {
  const settings = await tool("update_settings", { theme: "dark", language: "ja", lastFocusMinutes: 30 });
  assert.notEqual(settings.isError, true, textOf(settings));
  assert.equal(JSON.parse(textOf(await tool("get_settings"))).theme, "dark");

  const focus = JSON.parse(textOf(await tool("record_focus", { minutes: 12 })));
  assert.ok(focus.focusMinutes >= 12);

  const tag = JSON.parse(textOf(await tool("save_tag", { name: "開発", keywords: ["資料"] })));
  assert.equal(tag.name, "開発");
  const tags = JSON.parse(textOf(await tool("list_tags")));
  assert.ok(tags.tags.some((item) => item.id === tag.id));

  await writeFile(
    path.join(dir, "google.json"),
    JSON.stringify({
      client_secret: "super-secret-value",
      refresh_token: "refresh-value",
      client_id: "client",
      email: "a@b.c",
      auto_push: false,
    }),
  );
  const status = await tool("google_sync", { action: "status" });
  assert.notEqual(status.isError, true, textOf(status));
  const body = textOf(status);
  assert.doesNotMatch(body, /super-secret-value/);
  assert.doesNotMatch(body, /refresh-value/);
  assert.equal(JSON.parse(body).connected, true);
  const refused = await tool("google_sync", { action: "update", clientId: "client" });
  assert.notEqual(refused.isError, true, textOf(refused));
});

testSerial("unknown tool and invalid arguments come back as tool errors", async () => {
  const missing = await tool("not_a_tool", {});
  assert.equal(missing.isError, true);
  const invalid = await tool("add_tasks", {});
  assert.equal(invalid.isError, true);
  assert.match(textOf(invalid), /text|tasks/);
});
