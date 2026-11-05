// リリースノートは各 PR の「## 概要」だけ。節が無ければタイトルの箇条書き。

function extractOverview(markdown) {
  const lines = String(markdown ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
  let fence = null;
  let capturing = false;
  const out = [];

  const atFence = (line) => {
    const m = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (!m) return false;
    const marker = m[2];
    const rest = m[3];
    if (!fence) {
      fence = { char: marker[0], len: marker.length };
      return true;
    }
    if (marker[0] === fence.char && marker.length >= fence.len && rest.trim() === "") {
      fence = null;
      return true;
    }
    return false;
  };

  for (const line of lines) {
    if (atFence(line) || fence) {
      if (capturing) out.push(line);
      continue;
    }
    if (/^##\s+概要\s*$/.test(line)) {
      capturing = true;
      continue;
    }
    if (capturing && /^#{1,2}\s+\S/.test(line)) break;
    if (capturing) out.push(line);
  }

  const text = out.join("\n").trim();
  return text || null;
}

function buildReleaseNotes(pulls) {
  const chunks = [];
  const bullets = [];
  const flush = () => {
    if (bullets.length === 0) return;
    chunks.push(bullets.join("\n"));
    bullets.length = 0;
  };

  for (const pr of pulls || []) {
    const overview = extractOverview(pr && pr.body);
    if (overview) {
      flush();
      chunks.push(`## 概要\n\n${overview}`);
      continue;
    }
    const title = String((pr && pr.title) || "")
      .replace(/\s+/g, " ")
      .trim();
    if (title) bullets.push(`- ${title}`);
  }
  flush();
  return chunks.join("\n\n");
}

module.exports = { extractOverview, buildReleaseNotes };

if (require.main === module) {
  const fs = require("fs");
  const file = process.argv[2];
  if (!file) {
    process.stderr.write("usage: node scripts/release-notes.cjs <pulls.json>\n");
    process.exit(2);
  }
  const notes = buildReleaseNotes(JSON.parse(fs.readFileSync(file, "utf8")));
  process.stdout.write(notes);
  if (notes && !notes.endsWith("\n")) process.stdout.write("\n");
}
