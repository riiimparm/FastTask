import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Tauri 2 は JS に tauri://close-requested のリスナーがあると、
// ウィンドウフレームの×をネイティブでは閉じず、イベントだけ送る。
// onCloseRequested は preventDefault が無いとき window.destroy() を呼ぶ。
// core:window:allow-destroy は core:default に含まれない。欠けると×が無反応になる。
test("フレームの×で閉じられるよう allow-destroy を許可する", () => {
  const path = fileURLToPath(new URL("../src-tauri/capabilities/default.json", import.meta.url));
  const cap = JSON.parse(readFileSync(path, "utf8")) as {
    windows: string[];
    permissions: string[];
  };

  assert.deepEqual(cap.windows, ["main"]);
  assert.ok(cap.permissions.includes("core:window:allow-close"));
  assert.ok(cap.permissions.includes("core:window:allow-destroy"));
});
