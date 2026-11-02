import assert from "node:assert/strict";
import test from "node:test";
import { shouldPlay, throttleFor } from "./sound.ts";

test("shouldPlay: 同種音は60ms未満で抑制、別種と経過後は鳴る", () => {
  const last: Record<string, number> = {};
  assert.equal(shouldPlay("create", 1000, last), true);
  last.create = 1000;
  assert.equal(shouldPlay("create", 1030, last), false); // 連打は抑制
  assert.equal(shouldPlay("create", 1060, last), true); // 60ms経過で再生
  assert.equal(shouldPlay("nav", 1030, last), true); // 別種はスロットルされない
});

test("throttleFor: タイプ音だけ短い間隔で鳴る", () => {
  assert.equal(throttleFor("type"), 18);
  assert.equal(throttleFor("complete"), 60);

  const last: Record<string, number> = { type: 1000 };
  assert.equal(shouldPlay("type", 1020, last), true); // 速いタイピングでも追従
  assert.equal(shouldPlay("type", 1010, last), false); // 極端な連打は抑制
});
