import assert from "node:assert/strict";
import test from "node:test";
import type { Task, Tag } from "../types.ts";
import { buildResultShareText, computeDailyResult, formatFocus } from "./result.ts";

const TODAY = "2026-11-09";

let seq = 0;
function task(partial: Partial<Task>): Task {
  seq++;
  return {
    id: `t${seq}`,
    title: `task ${seq}`,
    status: "todo",
    tags: [],
    createdAt: `${TODAY}T09:00:00.000Z`,
    order: seq,
    ...partial,
  };
}
function doneOn(day: string, partial: Partial<Task> = {}): Task {
  return task({ status: "done", completedAt: `${day}T10:00:00.000Z`, ...partial });
}

const tags: Tag[] = [
  { id: "tag1", name: "開発", color: "#000", keywords: [] },
  { id: "tag2", name: "家事", color: "#111", keywords: [] },
];

test("computeDailyResult: 完了数・達成率・MUSTを集計する", () => {
  const tasks = [
    doneOn(TODAY, { isMinimum: true, projectName: "A" }),
    doneOn(TODAY, { isMinimum: true, projectName: "A" }),
    doneOn(TODAY, { projectName: "B" }),
    doneOn("2026-11-08"), // 昨日分は数えない
    task({ isMinimum: true }), // 残りMUST
    task({}), // 通常のtodoは分母に入らない
  ];
  const r = computeDailyResult(tasks, tags, 0, TODAY);
  assert.equal(r.completedCount, 3);
  assert.equal(r.mustDone, 2);
  assert.equal(r.mustRemaining, 1);
  assert.equal(r.rateTarget, 4);
  assert.equal(r.rate, 75);
  assert.equal(r.mustAllClear, false);
  assert.equal(r.topProject?.name, "A");
  assert.equal(r.topProject?.count, 2);
});

test("computeDailyResult: MUST全クリアでタイプが MUST HUNTER になる", () => {
  const tasks = [
    doneOn(TODAY, { isMinimum: true }),
    doneOn(TODAY, { isMinimum: true }),
    doneOn(TODAY, {}),
  ];
  const r = computeDailyResult(tasks, tags, 0, TODAY);
  assert.equal(r.mustAllClear, true);
  assert.equal(r.rate, 100);
  assert.equal(r.type.code, "MUST HUNTER");
});

test("computeDailyResult: 完了0件なら WARMING UP で達成率0", () => {
  const r = computeDailyResult([task({})], tags, 0, TODAY);
  assert.equal(r.completedCount, 0);
  assert.equal(r.rate, 0);
  assert.equal(r.type.code, "WARMING UP");
});

test("computeDailyResult: streakは今日→過去へ連続日数を数え、今日0件なら昨日から数える", () => {
  const tasks = [
    doneOn(TODAY),
    doneOn("2026-11-08"),
    doneOn("2026-11-07"),
    // 11-06 は空き
    doneOn("2026-11-05"),
  ];
  assert.equal(computeDailyResult(tasks, tags, 0, TODAY).streak, 3);
  const noToday = tasks.filter((t) => t.completedAt?.slice(0, 10) !== TODAY);
  assert.equal(computeDailyResult(noToday, tags, 0, TODAY).streak, 2);
  assert.equal(computeDailyResult([], tags, 0, TODAY).streak, 0);
});

test("computeDailyResult: 週間グラフは直近7日を古い順に返す", () => {
  const tasks = [doneOn(TODAY), doneOn(TODAY), doneOn("2026-11-03")];
  const r = computeDailyResult(tasks, tags, 0, TODAY);
  assert.equal(r.week.length, 7);
  assert.equal(r.week[0].date, "2026-11-03");
  assert.equal(r.week[0].count, 1);
  assert.equal(r.week[6].date, TODAY);
  assert.equal(r.week[6].count, 2);
});

test("computeDailyResult: トップタグは完了タスクで最多のタグ名を返す", () => {
  const tasks = [
    doneOn(TODAY, { tags: ["tag1"] }),
    doneOn(TODAY, { tags: ["tag1", "tag2"] }),
    doneOn(TODAY, { tags: ["tag2"] }),
    doneOn(TODAY, { tags: ["tag1"] }),
  ];
  const r = computeDailyResult(tasks, tags, 0, TODAY);
  assert.equal(r.topTag?.name, "開発");
  assert.equal(r.topTag?.count, 3);
});

test("formatFocus: 分を H:MM にする", () => {
  assert.equal(formatFocus(0), "0:00");
  assert.equal(formatFocus(65), "1:05");
  assert.equal(formatFocus(125.4), "2:05");
});

test("buildResultShareText: 主要スタッツを含む", () => {
  const tasks = [doneOn(TODAY, { isMinimum: true }), doneOn(TODAY, { isMinimum: true })];
  const text = buildResultShareText(computeDailyResult(tasks, tags, 30, TODAY), "ja");
  assert.match(text, /完了 2件/);
  assert.match(text, /MUST 全クリア/);
  assert.match(text, /MUST HUNTER/);
});
