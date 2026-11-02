import assert from "node:assert/strict";
import test from "node:test";
import { mergeAutoTags } from "./tags.ts";

test("mergeAutoTags: 既存順を保ち新規のみ末尾に追加、手動タグは消さない", () => {
  assert.deepEqual(mergeAutoTags(["c", "a", "manual"], ["a", "b", "c"]), ["c", "a", "manual", "b"]);
});
