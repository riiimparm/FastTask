import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  version: string;
  releaseUrl: string;
}

let pendingUpdate: Update | null = null;

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const update = await check();
    if (!update) {
      pendingUpdate = null;
      return null;
    }
    pendingUpdate = update;
    return {
      version: update.version,
      releaseUrl: `https://github.com/riiimparm/FastTask/releases/tag/v${update.version}`,
    };
  } catch {
    return null;
  }
}

/**
 * 保留中のアップデートをダウンロード＆インストールし、アプリを再起動する。
 * 進捗は 0..1 の割合で onProgress に通知される。
 * 成功時は relaunch でプロセスが入れ替わるため、この関数は戻らない想定。
 */
export async function installUpdate(
  onProgress?: (ratio: number) => void,
): Promise<void> {
  const update = pendingUpdate ?? (await check());
  if (!update) throw new Error("no update available");
  let downloaded = 0;
  let total = 0;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? 0;
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        if (total > 0) onProgress?.(Math.min(downloaded / total, 1));
        break;
      case "Finished":
        onProgress?.(1);
        break;
    }
  });
  await relaunch();
}
