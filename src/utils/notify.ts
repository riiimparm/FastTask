import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

export async function osNotify(title: string, body: string): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      granted = result === "granted";
    }
    if (granted) {
      await sendNotification({ title, body });
    }
  } catch (e) {
    console.warn("notification failed:", e);
  }
}
