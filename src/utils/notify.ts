import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  registerActionTypes,
  onAction,
} from "@tauri-apps/plugin-notification";

export type FocusTimerAction = "extend" | "finish";

const ACTION_TYPE_ID = "focus-timer-end";
let _focusActionCb: ((action: FocusTimerAction) => void) | null = null;
let _unlisten: (() => void) | null = null;

export function setFocusTimerActionCallback(cb: ((action: FocusTimerAction) => void) | null) {
  _focusActionCb = cb;
}

export async function setupFocusTimerActions(lang: string): Promise<void> {
  try {
    await registerActionTypes([
      {
        id: ACTION_TYPE_ID,
        actions: [
          { id: "extend", title: lang === "ja" ? "+5分延長" : "+5 min", foreground: true },
          { id: "finish", title: lang === "ja" ? "終了" : "Finish", destructive: true, foreground: true },
        ],
      },
    ]);

    if (_unlisten) _unlisten();
    const listener = await onAction((e: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = e as any;
      // macOS: actionId フィールドまたは actionType.id を試みる
      const id: string =
        payload?.actionId ??
        payload?.id ??
        payload?.action?.id ??
        "";
      if (id === "extend") _focusActionCb?.("extend");
      else if (id === "finish") _focusActionCb?.("finish");
    });
    _unlisten = listener.unregister.bind(listener);
  } catch (e) {
    console.warn("focus timer action setup failed:", e);
  }
}

export async function osNotify(title: string, body: string): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      granted = result === "granted";
    }
    if (granted) await sendNotification({ title, body });
  } catch (e) {
    console.warn("notification failed:", e);
  }
}

export async function osNotifyWithAction(title: string, body: string): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const result = await requestPermission();
      granted = result === "granted";
    }
    if (granted) await sendNotification({ title, body, actionTypeId: ACTION_TYPE_ID });
  } catch (e) {
    console.warn("notification with action failed:", e);
  }
}
