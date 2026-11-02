import assert from "node:assert/strict";
import test from "node:test";
import { shouldPlay } from "./sound.ts";

test("shouldPlay: 同種音は60ms未満で抑制、別種と経過後は鳴る", () => {
  const last: Record<string, number> = {};
  assert.equal(shouldPlay("create", 1000, last), true);
  last.create = 1000;
  assert.equal(shouldPlay("create", 1030, last), false); // 連打は抑制
  assert.equal(shouldPlay("create", 1060, last), true); // 60ms経過で再生
  assert.equal(shouldPlay("nav", 1030, last), true); // 別種はスロットルされない
});
