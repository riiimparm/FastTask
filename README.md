# FastTask

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
