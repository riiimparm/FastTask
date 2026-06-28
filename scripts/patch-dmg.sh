#!/bin/bash
# ビルド済み DMG に修正スクリプトを追加する
set -e

DMG_SRC="src-tauri/target/release/bundle/dmg/FastTask_1.1.0_aarch64.dmg"
COMMAND_FILE="src-tauri/dmg-resources/FastTaskを修正する.command"
TMP_RW="/tmp/fasttask_rw.dmg"
MOUNT_POINT="/tmp/fasttask_mount"

if [ ! -f "$DMG_SRC" ]; then
  echo "❌ DMG が見つかりません: $DMG_SRC"
  exit 1
fi

echo "📦 DMG を読み書き可能に変換中..."
hdiutil convert "$DMG_SRC" -format UDRW -o "$TMP_RW" -ov -quiet

echo "💿 DMG をマウント中..."
mkdir -p "$MOUNT_POINT"
hdiutil attach "$TMP_RW" -mountpoint "$MOUNT_POINT" -quiet

echo "📋 修正スクリプトをコピー中..."
cp "$COMMAND_FILE" "$MOUNT_POINT/"

echo "💿 DMG をアンマウント中..."
hdiutil detach "$MOUNT_POINT" -quiet

echo "📦 DMG を圧縮して再パッケージ中..."
hdiutil convert "$TMP_RW" -format UDZO -o "$DMG_SRC" -ov -quiet

rm -f "$TMP_RW"
echo "✅ 完了: $DMG_SRC"
