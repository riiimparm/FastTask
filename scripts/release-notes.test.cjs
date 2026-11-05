const test = require("node:test");
const assert = require("node:assert/strict");
const { extractOverview, buildReleaseNotes } = require("./release-notes.cjs");

const pr16 = `## 概要

next版の7項目を実装。

| コミット | 内容 |
|---|---|
| \`feat:\` ローカルAPI + MCP | HTTP API |

### 補足

フォーカス移動を含む。

## 確認

- \`tsc\` 成功

## レビューしてほしい点

1. Google連携は未検証です。

## 既知の割り切り（\`ponytail:\` コメントで明記）

- トークンファイルの 0600 は unix のみ（Windows未対応）
`;

test("概要だけを抜き、確認・レビュー・割り切りは捨てる", () => {
  const notes = buildReleaseNotes([{ title: "feat: next版", body: pr16 }]);
  assert.match(notes, /next版の7項目を実装/);
  assert.match(notes, /ローカルAPI \+ MCP/);
  assert.match(notes, /### 補足/);
  assert.match(notes, /フォーカス移動を含む/);
  assert.doesNotMatch(notes, /## 確認/);
  assert.doesNotMatch(notes, /tsc/);
  assert.doesNotMatch(notes, /レビューしてほしい点/);
  assert.doesNotMatch(notes, /未検証/);
  assert.doesNotMatch(notes, /既知の割り切り/);
  assert.doesNotMatch(notes, /Windows未対応/);
});

test("見出しが無い本文はタイトルにフォールバックする", () => {
  const notes = buildReleaseNotes([
    { title: "fix: バグ修正", body: "- ウィンドウが閉じない\n- 日付が更新されない\n" },
  ]);
  assert.equal(notes, "- fix: バグ修正");
});

test("概要が空、または確認しか無いときは本文を載せない", () => {
  const empty = buildReleaseNotes([
    { title: "feat: 空", body: "## 概要\n\n\n## 確認\n\n- cargo test\n" },
  ]);
  assert.equal(empty, "- feat: 空");

  const checklistOnly = buildReleaseNotes([
    { title: "chore: 確認だけ", body: "## 確認\n\n- 目視した\n\n## レビューしてほしい点\n\n- なし\n" },
  ]);
  assert.equal(checklistOnly, "- chore: 確認だけ");
});

test("コードフェンス内の見出しでは節を切らない", () => {
  const body = [
    "## 概要",
    "",
    "手順:",
    "",
    "```",
    "## 確認",
    "レビューしてほしい点",
    "```",
    "",
    "以上。",
    "",
    "## 確認",
    "",
    "- 実機",
  ].join("\n");
  const section = extractOverview(body);
  assert.match(section, /## 確認/);
  assert.match(section, /以上。/);
  assert.doesNotMatch(section, /実機/);
});

test("複数 PR は概要とタイトル箇条書きを順に結合する", () => {
  const notes = buildReleaseNotes([
    { title: "chore: 先", body: "" },
    { title: "feat: 本体", body: "## 概要\r\n\r\nカレンダーを削除。\r\n" },
    { title: "chore: 後\nの続き", body: "本文は使わない" },
  ]);
  assert.equal(
    notes,
    ["- chore: 先", "## 概要\n\nカレンダーを削除。", "- chore: 後 の続き"].join("\n\n"),
  );
});
