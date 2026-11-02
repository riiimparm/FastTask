#!/usr/bin/env bash
# docs/*.md を GitHub Pages 用の HTML にビルドする。
# GitHub と同じ GFM レンダラ（gh api /markdown）を使うので npm 依存はゼロ。
# 使い方: bash scripts/build-docs.sh  （gh のログインが必要）
set -euo pipefail

cd "$(dirname "$0")/.."
command -v gh >/dev/null || { echo "gh コマンドが必要です" >&2; exit 1; }

# docs/google-sync.md → docs/index.html（Pages のトップをセットアップ手順にする）
render() {
  local md="$1" out="$2" title="$3"
  local body
  body=$(gh api --method POST /markdown -f mode=gfm -f text="$(cat "$md")")

  cat > "$out" <<HTML
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#1b1b1f; --sub:#5c5f6b; --line:#e4e4e8; --code:#f4f4f6; --link:#2f6feb; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#16161a; --fg:#e8e8ec; --sub:#9b9ba6; --line:#2b2b33; --code:#1f1f26; --link:#7aa6ff; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", "Segoe UI", sans-serif;
    line-height: 1.85; font-size: 16px;
  }
  main { max-width: 720px; margin: 0 auto; padding: 56px 16px 96px; }
  h1 { font-size: 1.7rem; letter-spacing: -0.01em; margin: 0 0 1.5rem; }
  h2 { font-size: 1.2rem; margin: 2.75rem 0 0.75rem; padding-top: 1.25rem; border-top: 1px solid var(--line); }
  h2:first-of-type, hr + h2 { border-top: none; padding-top: 0; }
  h3 { font-size: 1rem; margin: 1.75rem 0 0.5rem; }
  p, li { color: var(--fg); }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  ul, ol { padding-left: 1.4em; }
  li + li { margin-top: 0.3em; }
  code { background: var(--code); padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.88em; }
  pre { background: var(--code); padding: 1rem; border-radius: 8px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 1.25rem 0; padding: 0.1rem 1rem; border-left: 3px solid var(--line); color: var(--sub); }
  table { border-collapse: collapse; width: 100%; font-size: 0.93em; }
  th, td { border: 1px solid var(--line); padding: 0.5rem 0.7rem; text-align: left; }
  hr { border: none; border-top: 1px solid var(--line); margin: 2.5rem 0; }
  img { max-width: 100%; }
  footer { max-width: 720px; margin: 0 auto; padding: 0 16px 64px; color: var(--sub); font-size: 0.85rem; }
</style>
</head>
<body>
<main>
${body}
</main>
<footer>FastTask — <a href="https://github.com/riiimparm/FastTask">github.com/riiimparm/FastTask</a></footer>
</body>
</html>
HTML
  echo "built: $out"
}

render docs/google-sync.md docs/index.html "Google連携セットアップ — FastTask"

# Pages で Jekyll 処理を走らせない（ここでビルド済みのため）
touch docs/.nojekyll
