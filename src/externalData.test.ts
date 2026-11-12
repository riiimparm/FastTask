import assert from "node:assert/strict";
import test from "node:test";
import { mergeExternalData } from "./externalData.ts";

test("mergeExternalData: 無いデータは null、設定は既定値と合成する", () => {
  assert.equal(mergeExternalData(null), null);
  const merged = mergeExternalData({
    tasks: [],
    tags: [],
    settings: { theme: "dark", language: "en" },
  });
  assert.equal(merged?.settings.theme, "dark");
  assert.equal(merged?.settings.language, "en");
  assert.equal(merged?.settings.groupingEnabled, true);
  assert.equal(merged?.settings.urlEnabled, true);
});
