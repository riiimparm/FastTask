# FastTask

<img width="592" height="612" alt="スクリーンショット 2026-07-07 2 31 48" src="https://github.com/user-attachments/assets/c593b722-4075-454b-8897-a575573fe07a" />


Create, update, and close tasks fast.

## Create Tasks

Input format:

:`project-name` `title` `url` `date`

Create multiple tasks at once:

:`project-name` `title1`, `title2`, `title3` ...

## Features

- Copy Today's Done
- Task Relationships
- MUST/PENDING Labels
- Focus Timer
- Calendar

## Dev

```bash
pnpm install
pnpm tauri dev
pnpm tauri build
```

## インストール時の注意（macOS）

If you see a "damaged" error after installing from a DMG, run the following command in Terminal:

```bash
xattr -cr /Applications/FastTask.app
```

## Requirements

- macOS
- Node.js + pnpm
- Rust (required by Tauri)
