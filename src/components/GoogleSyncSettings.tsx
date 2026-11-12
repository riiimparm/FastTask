import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Language } from "../types";

/** Rust 側 PublicConfig と対。secret / refresh_token は一切含まれない。 */
interface GoogleConfig {
  connected: boolean;
  hasSecret: boolean;
  clientId: string;
  email: string;
  calendarId: string;
  tasklistId: string;
  autoPush: boolean;
  pushCalendar: boolean;
  pushTasks: boolean;
}

interface PushResult {
  pushed: number;
  skipped: number;
  errors: string[];
}

interface TaskList {
  id: string;
  title: string;
}

// SettingsModal と同じく、この画面のテキストはコンポーネント内に持つ
/** セットアップ手順は GitHub Pages で配信（docs/ を scripts/build-docs.sh でビルド） */
const SETUP_GUIDE_URL = "https://riiimparm.github.io/FastTask/google-sync/";

const T = {
  ja: {
    heading: "Google連携",
    desc: "FastTask のタスクを Google カレンダー / Google ToDo に書き出します（書き込みのみ・取り込みはしません）",
    clientId: "クライアントID",
    clientSecret: "クライアントシークレット",
    secretSaved: "保存済み（変更する場合のみ入力）",
    setupHint: "GCPで発行した OAuth クライアント（デスクトップアプリ）の値を入力してください。",
    setupLink: "セットアップ手順を開く",
    connect: "Googleに接続",
    connecting: "ブラウザで認証中...",
    disconnect: "接続を解除",
    connectedAs: "接続中",
    notConnected: "未接続",
    calendarId: "カレンダーID",
    tasklistId: "ToDoリスト",
    fetchLists: "リスト取得",
    autoPush: "自動書き出し",
    autoPushDesc: "タスクの追加・更新時に自動でGoogleへ書き出す",
    pushCalendar: "カレンダーに書き出す",
    pushCalendarDesc: "期日のあるタスクを終日イベントとして作成",
    pushTasks: "ToDoに書き出す",
    pushTasksDesc: "タスクを Google ToDo に作成（完了状態も反映）",
    syncNow: "今すぐ同期",
    syncing: "同期中...",
    saved: "保存しました",
    result: (r: PushResult) => `書き出し ${r.pushed} 件 / 変更なし ${r.skipped} 件`,
    needClientId: "先にクライアントIDを保存してください",
    save: "保存",
  },
  en: {
    heading: "Google sync",
    desc: "Pushes FastTask tasks to Google Calendar / Google Tasks (write only, never imports)",
    clientId: "Client ID",
    clientSecret: "Client secret",
    secretSaved: "Saved (enter only to change)",
    setupHint: "Enter the OAuth client (Desktop app) values issued in GCP.",
    setupLink: "Open the setup guide",
    connect: "Connect to Google",
    connecting: "Authorizing in browser...",
    disconnect: "Disconnect",
    connectedAs: "Connected",
    notConnected: "Not connected",
    calendarId: "Calendar ID",
    tasklistId: "Task list",
    fetchLists: "Fetch lists",
    autoPush: "Auto push",
    autoPushDesc: "Push to Google automatically when a task is added or updated",
    pushCalendar: "Push to Calendar",
    pushCalendarDesc: "Create an all-day event for tasks with a due date",
    pushTasks: "Push to Tasks",
    pushTasksDesc: "Create tasks in Google Tasks (completion is mirrored)",
    syncNow: "Sync now",
    syncing: "Syncing...",
    saved: "Saved",
    result: (r: PushResult) => `${r.pushed} pushed / ${r.skipped} unchanged`,
    needClientId: "Save a client ID first",
    save: "Save",
  },
} as const;

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[13px]">{label}</div>
        {desc && <div className="text-[11px] text-subink">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function MiniToggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`w-9 h-5 rounded-full relative transition-colors outline-none shrink-0 disabled:opacity-40 ${
        value ? "bg-[#1C1C1E] dark:bg-[#E0E0E0]" : "bg-black/15"
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full shadow transition-all ${
          value ? "left-[18px] bg-[#F5F5F5] dark:bg-[#111111]" : "left-0.5 bg-[#F5F5F5] dark:bg-[#888888]"
        }`}
      />
    </button>
  );
}

const inputCls =
  "px-2 py-1.5 text-[12px] rounded-md border border-black/10 dark:border-white/10 bg-transparent outline-none focus:border-accent w-full";
const btnCls =
  "px-3 py-1.5 text-[12px] rounded-md bg-black/8 hover:bg-black/15 dark:bg-white/10 dark:hover:bg-white/20 disabled:opacity-40 shrink-0";

export function GoogleSyncSettings({ lang }: { lang: Language }) {
  const tx = T[lang] ?? T.ja;
  const [cfg, setCfg] = useState<GoogleConfig | null>(null);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [calendarId, setCalendarId] = useState("primary");
  const [tasklistId, setTasklistId] = useState("@default");
  const [lists, setLists] = useState<TaskList[] | null>(null);
  const [busy, setBusy] = useState<"" | "connect" | "sync" | "lists">("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function apply(c: GoogleConfig) {
    setCfg(c);
    setClientId(c.clientId);
    setCalendarId(c.calendarId);
    setTasklistId(c.tasklistId);
    setClientSecret("");
  }

  useEffect(() => {
    invoke<GoogleConfig>("google_get_config").then(apply).catch((e) => setErr(String(e)));
    let unlisten: (() => void) | undefined;
    listen("external-google-changed", () => {
      invoke<GoogleConfig>("google_get_config").then(apply).catch((e) => setErr(String(e)));
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  async function patch(p: Record<string, unknown>) {
    setErr("");
    try {
      apply(await invoke<GoogleConfig>("google_set_config", { patch: p }));
      setMsg(tx.saved);
    } catch (e) {
      setErr(String(e));
    }
  }

  async function run(kind: "connect" | "sync" | "lists", fn: () => Promise<void>) {
    setBusy(kind);
    setErr("");
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy("");
    }
  }

  if (!cfg) return null;

  return (
    <div className="space-y-3">
      <div>
        <div className="text-[13px] font-medium">{tx.heading}</div>
        <div className="text-[11px] text-subink">{tx.desc}</div>
      </div>

      <div className="space-y-1.5">
        <div className="text-[12px] text-subink">{tx.clientId}</div>
        <div className="flex gap-2">
          <input
            className={inputCls}
            value={clientId}
            spellCheck={false}
            placeholder="xxxxx.apps.googleusercontent.com"
            onChange={(e) => setClientId(e.target.value)}
          />
          <button className={btnCls} onClick={() => patch({ clientId, clientSecret })}>
            {tx.save}
          </button>
        </div>
        <div className="text-[12px] text-subink">{tx.clientSecret}</div>
        <input
          className={inputCls}
          type="password"
          value={clientSecret}
          spellCheck={false}
          placeholder={cfg.hasSecret ? tx.secretSaved : "GOCSPX-..."}
          onChange={(e) => setClientSecret(e.target.value)}
        />
        <div className="text-[11px] text-subink">
          {tx.setupHint}{" "}
          <button
            type="button"
            className="underline hover:no-underline"
            onClick={() => { void openUrl(SETUP_GUIDE_URL); }}
          >
            {tx.setupLink}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 text-[12px] truncate">
          {cfg.connected ? (
            <span>
              {tx.connectedAs}: <span className="font-medium">{cfg.email || "Google"}</span>
            </span>
          ) : (
            <span className="text-subink">{tx.notConnected}</span>
          )}
        </div>
        {cfg.connected ? (
          <button
            className={btnCls}
            onClick={() => run("connect", async () => apply(await invoke<GoogleConfig>("google_disconnect")))}
          >
            {tx.disconnect}
          </button>
        ) : (
          <button
            className={btnCls}
            disabled={busy === "connect" || !cfg.clientId}
            title={cfg.clientId ? "" : tx.needClientId}
            onClick={() => run("connect", async () => apply(await invoke<GoogleConfig>("google_connect")))}
          >
            {busy === "connect" ? tx.connecting : tx.connect}
          </button>
        )}
      </div>

      {cfg.connected && (
        <div className="space-y-2.5 border-t border-black/5 pt-3">
          <Row label={tx.pushTasks} desc={tx.pushTasksDesc}>
            <MiniToggle value={cfg.pushTasks} onChange={(v) => patch({ pushTasks: v })} />
          </Row>
          <Row label={tx.pushCalendar} desc={tx.pushCalendarDesc}>
            <MiniToggle value={cfg.pushCalendar} onChange={(v) => patch({ pushCalendar: v })} />
          </Row>
          <Row label={tx.autoPush} desc={tx.autoPushDesc}>
            <MiniToggle value={cfg.autoPush} onChange={(v) => patch({ autoPush: v })} />
          </Row>

          <div className="space-y-1.5">
            <div className="text-[12px] text-subink">{tx.calendarId}</div>
            <div className="flex gap-2">
              <input
                className={inputCls}
                value={calendarId}
                spellCheck={false}
                placeholder="primary"
                onChange={(e) => setCalendarId(e.target.value)}
                onBlur={() => calendarId !== cfg.calendarId && patch({ calendarId })}
              />
            </div>
            <div className="text-[12px] text-subink">{tx.tasklistId}</div>
            <div className="flex gap-2">
              {lists ? (
                <select
                  className={inputCls}
                  value={tasklistId}
                  onChange={(e) => {
                    setTasklistId(e.target.value);
                    patch({ tasklistId: e.target.value });
                  }}
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={inputCls}
                  value={tasklistId}
                  spellCheck={false}
                  placeholder="@default"
                  onChange={(e) => setTasklistId(e.target.value)}
                  onBlur={() => tasklistId !== cfg.tasklistId && patch({ tasklistId })}
                />
              )}
              <button
                className={btnCls}
                disabled={busy === "lists"}
                onClick={() =>
                  run("lists", async () => {
                    const r = await invoke<{ items?: TaskList[] }>("google_list_tasklists");
                    setLists(r.items ?? []);
                  })
                }
              >
                {tx.fetchLists}
              </button>
            </div>
          </div>

          <button
            className={btnCls + " w-full"}
            disabled={busy === "sync"}
            onClick={() =>
              run("sync", async () => {
                const r = await invoke<PushResult>("google_push_now");
                setMsg(tx.result(r));
                if (r.errors.length) setErr(r.errors.slice(0, 3).join(" / "));
              })
            }
          >
            {busy === "sync" ? tx.syncing : tx.syncNow}
          </button>
        </div>
      )}

      {msg && <div className="text-[11px] text-subink">{msg}</div>}
      {err && <div className="text-[11px] text-danger break-all">{err}</div>}
    </div>
  );
}
