import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function appDataDir() {
  if (process.env.FASTTASK_APP_DATA_DIR) return process.env.FASTTASK_APP_DATA_DIR;
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "com.fasttask.desktop");
  }
  if (process.platform === "win32") {
    return join(process.env.APPDATA || "", "com.fasttask.desktop");
  }
  return join(homedir(), ".local", "share", "com.fasttask.desktop");
}

export function config() {
  let port = process.env.FASTTASK_PORT;
  let token = process.env.FASTTASK_TOKEN;
  if (!port || !token) {
    const file = JSON.parse(readFileSync(join(appDataDir(), "api.json"), "utf8"));
    port ||= String(file.port ?? "");
    token ||= file.token;
  }
  if (!port || !token) {
    throw new Error("FastTask の接続先が分かりません。アプリを起動してください。");
  }
  return { base: `http://127.0.0.1:${port}`, token };
}

export async function api(method, path, body) {
  const { base, token } = config();
  let response;
  try {
    response = await fetch(base + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`FastTask に接続できません。アプリが起動しているか確認してください (${message})`);
  }
  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: text };
    }
  }
  if (!response.ok) {
    const message = parsed && typeof parsed === "object" && parsed.error
      ? parsed.error
      : `HTTP ${response.status}`;
    throw new Error(String(message));
  }
  return parsed;
}

export function textResult(data) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

export async function call(method, path, body) {
  try {
    return textResult(await api(method, path, body));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}

export function defined(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}
