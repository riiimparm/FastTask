import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Header } from "./components/Header";
import { TaskInput } from "./components/TaskInput";
import { TaskList } from "./components/TaskList";
import { CompletedSection } from "./components/CompletedSection";
import { SettingsModal } from "./components/SettingsModal";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { FocusTimerSetup } from "./components/FocusTimerSetup";
import { FocusEndModal } from "./components/FocusEndModal";
import { UiProvider, useUiContext } from "./context/UiContext";
import { useStore } from "./store";
import { osNotify, osNotifyWithAction, setupFocusTimerActions, setFocusTimerActionCallback } from "./utils/notify";
import { t } from "./i18n";
import { buildDfsOrder, getDepth, hasUndoneDescendants } from "./utils/taskTree";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CloseConfirmModal } from "./components/CloseConfirmModal";
import { checkForUpdate, UpdateInfo } from "./utils/updater";

function AppInner() {
  const init = useStore((s) => s.init);
  const loaded = useStore((s) => s.loaded);
  const grouping = useStore((s) => s.settings.groupingEnabled);
  const tagsEnabled = useStore((s) => s.settings.tagsEnabled ?? false);
  const tags = useStore((s) => s.tags);
  const lang = useStore((s) => s.settings.language);
  const lastFocusMinutes = useStore((s) => s.settings.lastFocusMinutes);
  const updateSettings = useStore((s) => s.updateSettings);
  const toast = useStore((s) => s.toast);
  const setToast = useStore((s) => s.setToast);
  const tasks = useStore((s) => s.tasks);
  const toggleTask = useStore((s) => s.toggleTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const updateTask = useStore((s) => s.updateTask);
  const reorderTasks = useStore((s) => s.reorderTasks);
  const setTaskParent = useStore((s) => s.setTaskParent);
  const undo = useStore((s) => s.undo);

  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [tagFilterEnabled, setTagFilterEnabled] = useState(false);
  const [tagFilterIds, setTagFilterIds] = useState<Set<string>>(new Set());
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);

  const {
    selectedTaskId,
    focusedTaskId,
    isReorderMode,
    bulkSelected,
    focusPhase,
    focusMinutes,
    setSelectedTaskId,
    setFocusedTaskId,
    setIsReorderMode,
    toggleBulkSelect,
    clearBulkSelect,
    setFocusPhase,
    setFocusMinutes,
    mainInputRef,
    triggerVibration,
    searchMode,
    searchQuery,
    setSearchMode,
  } = useUiContext();

  const [timerActive, setTimerActive] = useState(false);
  const [focusTimeLeft, setFocusTimeLeft] = useState(0);
  const [focusElapsed, setFocusElapsed] = useState(0);
  const [showFocusEnd, setShowFocusEnd] = useState(false);
  const [focusEndMode, setFocusEndMode] = useState<"ended" | "confirm">("ended");
  const focusMinutesRef = useRef(focusMinutes);
  useEffect(() => { focusMinutesRef.current = focusMinutes; }, [focusMinutes]);
  useEffect(() => { setFocusMinutes(lastFocusMinutes ?? 25); }, []);

  // タイマーカウントダウン
  useEffect(() => {
    if (!timerActive) return;
    const id = setInterval(() => {
      setFocusTimeLeft((prev) => {
        if (prev <= 1) {
          setTimerActive(false);
          const elapsed = focusMinutesRef.current * 60;
          setFocusElapsed(elapsed);
          setFocusEndMode("ended");
          setShowFocusEnd(true);
          osNotifyWithAction("FastTask", lang === "ja" ? "タイマーが終了しました" : "Timer has ended");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerActive, lang]);

  function startFocus() {
    const secs = focusMinutesRef.current * 60;
    setFocusTimeLeft(secs);
    setFocusElapsed(0);
    setTimerActive(true);
    setFocusPhase("running");
    updateSettings({ lastFocusMinutes: focusMinutesRef.current });
    osNotify("FastTask", lang === "ja" ? "フォーカス開始" : "Focus started");
  }

  function cancelFocusSetup() {
    setFocusedTaskId(null);
    setFocusPhase("idle");
  }

  function endFocus() {
    setTimerActive(false);
    setFocusedTaskId(null);
    setFocusPhase("idle");
    setShowFocusEnd(false);
    setFocusTimeLeft(0);
  }

  function extendFocus() {
    const extra = 5 * 60;
    setFocusTimeLeft(extra);
    setShowFocusEnd(false);
    setTimerActive(true);
  }

  // 通知アクション初期化 & コールバック設定
  useEffect(() => {
    setupFocusTimerActions(lang);
    setFocusTimerActionCallback((action) => {
      if (action === "extend") extendFocus();
      else endFocus();
    });
    return () => setFocusTimerActionCallback(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const searchKeywords = useMemo(() => {
    if (!searchMode || !searchQuery.trim()) return [];
    return searchQuery.trim().toLowerCase().split(/\s+/);
  }, [searchMode, searchQuery]);

  const todoTasks = useMemo(() => {
    let dfs = buildDfsOrder(tasks.filter((t) => t.status === "todo"));
    if (searchKeywords.length > 0) {
      dfs = dfs.filter((task) => {
        const body = task.projectName && task.title.startsWith(`:${task.projectName} `)
          ? task.title.slice(task.projectName.length + 2)
          : task.title;
        const text = body.toLowerCase();
        const tagText = tagsEnabled
          ? task.tags.map((id) => tags.find((t) => t.id === id)?.name ?? "").join(" ").toLowerCase()
          : "";
        return searchKeywords.every((kw) => text.includes(kw) || tagText.includes(kw));
      });
    }
    if (!grouping) return dfs;
    // グルーピング ON 時は ProjectSection の表示順に合わせる
    const NONE_KEY = "__none__";
    const sectionsMap = new Map<string, typeof dfs>();
    const sectionOrder: string[] = [];
    for (const t of dfs) {
      const key = t.projectName ?? NONE_KEY;
      if (!sectionsMap.has(key)) { sectionsMap.set(key, []); sectionOrder.push(key); }
      sectionsMap.get(key)!.push(t);
    }
    return sectionOrder.flatMap((k) => sectionsMap.get(k)!);
  }, [tasks, grouping, searchKeywords, tagsEnabled, tags]);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!loaded) return;
    checkForUpdate().then((info) => { if (info) setUpdateInfo(info); });
  }, [loaded]);

  useEffect(() => {
    let unlistenSettings: (() => void) | undefined;
    let unlistenUpdate: (() => void) | undefined;

    listen("menu-open-settings", () => {
      setShowSettings(true);
    }).then((f) => { unlistenSettings = f; });

    listen("menu-check-update", async () => {
      const info = await checkForUpdate();
      if (info) {
        setUpdateInfo(info);
      } else {
        const isJa = useStore.getState().settings.language === "ja";
        setToast(isJa ? "最新版を使用中です" : "You are up to date");
      }
    }).then((f) => { unlistenUpdate = f; });

    return () => {
      unlistenSettings?.();
      unlistenUpdate?.();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 3500);
    return () => clearTimeout(timer);
  }, [toast, setToast]);

  // ウィンドウフォーカス時に入力欄へ戻す（タスクが選択中の場合は除く）
  useEffect(() => {
    function onWindowFocus() {
      if (!selectedTaskId && !focusedTaskId) {
        mainInputRef.current?.focus();
      }
    }
    window.addEventListener("focus", onWindowFocus);
    return () => window.removeEventListener("focus", onWindowFocus);
  }, [selectedTaskId, focusedTaskId, mainInputRef]);

  // tasks の最新値を ref で保持（クローズハンドラが stale にならないように）
  const tasksRef = useRef(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  // ウィンドウ閉じる前に isMinimum 未完了タスクがあれば確認モーダル表示（1度だけ登録）
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow().onCloseRequested(async (event) => {
      const hasMinimum = tasksRef.current.some((t) => t.status === "todo" && t.isMinimum);
      if (hasMinimum) {
        event.preventDefault();
        setShowCloseConfirm(true);
      }
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusInput = useCallback(() => {
    mainInputRef.current?.focus();
  }, [mainInputRef]);

  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // 入力フォームや編集中はスキップ
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Ctrl+Z はどこでも有効
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
        setToast(t(lang, "undone"));
        return;
      }

      // Cmd+F: 検索モードへ
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setSearchMode(true);
        mainInputRef.current?.focus();
        return;
      }

      // ? はどこでも有効（入力欄以外）
      if (!isInput && e.key === "?") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }

      // /: 入力フォームへ移動（入力欄以外）
      if (!isInput && e.key === "/") {
        e.preventDefault();
        setSelectedTaskId(null);
        clearBulkSelect();
        focusInput();
        return;
      }

      // フォーカスセットアップ中: Enter/Esc を最優先（入力欄でも有効）
      if (focusPhase === "setup") {
        if (e.key === "Enter") { e.preventDefault(); startFocus(); return; }
        if (e.key === "Escape") { e.preventDefault(); cancelFocusSetup(); return; }
      }

      // フォーカス実行中: Enter/Esc で終了確認（入力欄以外）
      if (focusPhase === "running" && !isInput && (e.key === "Enter" || e.key === "Escape")) {
        e.preventDefault();
        setFocusEndMode("confirm");
        setFocusElapsed(focusMinutes * 60 - focusTimeLeft);
        setShowFocusEnd(true);
        return;
      }

      // 入力フォーム選択中に Escape → アイテム選択へ
      if (isInput && e.key === "Escape") {
        e.preventDefault();
        mainInputRef.current?.blur();
        if (selectedTaskId) {
          // 既存の選択を維持
        } else if (todoTasks.length > 0) {
          setSelectedTaskId(todoTasks[0].id);
        }
        return;
      }

      if (isInput) return;

      // Escape: 段階的に解除
      if (e.key === "Escape") {
        e.preventDefault();
        if (isReorderMode) {
          setIsReorderMode(false);
          return;
        }
        if (focusedTaskId) {
          setFocusedTaskId(null);
          setFocusPhase("idle");
          return;
        }
        if (bulkSelected.size > 0) {
          clearBulkSelect();
          return;
        }
        if (selectedTaskId) {
          setSelectedTaskId(null);
          focusInput();
          return;
        }
        focusInput();
        return;
      }

      // 並び替えモード中
      if (isReorderMode && selectedTaskId) {
        if (e.key === "ArrowUp" || e.key === "k") {
          e.preventDefault();
          const idx = todoTasks.findIndex((t) => t.id === selectedTaskId);
          if (idx > 0) {
            const ids = todoTasks.map((t) => t.id);
            const newIds = [...ids];
            [newIds[idx - 1], newIds[idx]] = [newIds[idx], newIds[idx - 1]];
            reorderTasks(newIds);
          }
          return;
        }
        if (e.key === "ArrowDown" || e.key === "j") {
          e.preventDefault();
          const idx = todoTasks.findIndex((t) => t.id === selectedTaskId);
          if (idx < todoTasks.length - 1) {
            const ids = todoTasks.map((t) => t.id);
            const newIds = [...ids];
            [newIds[idx + 1], newIds[idx]] = [newIds[idx], newIds[idx + 1]];
            reorderTasks(newIds);
          }
          return;
        }
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setIsReorderMode(false);
          return;
        }
        return;
      }

      // タスクが選択されていない場合
      if (!selectedTaskId) {
        if (e.key === "ArrowDown" || e.key === "j") {
          e.preventDefault();
          if (todoTasks.length > 0) setSelectedTaskId(todoTasks[0].id);
          return;
        }
        if (e.key === "ArrowUp" || e.key === "k") {
          e.preventDefault();
          if (todoTasks.length > 0) setSelectedTaskId(todoTasks[todoTasks.length - 1].id);
          return;
        }
        return;
      }

      const currentIdx = todoTasks.findIndex((t) => t.id === selectedTaskId);

      // j / ArrowDown: 次のタスク
      if ((e.key === "ArrowDown" && !e.shiftKey) || (e.key === "j" && !e.shiftKey)) {
        e.preventDefault();
        if (currentIdx < todoTasks.length - 1) {
          setSelectedTaskId(todoTasks[currentIdx + 1].id);
          clearBulkSelect();
        }
        return;
      }

      // k / ArrowUp: 前のタスク（最上部から更に上で入力フォームへ）
      if ((e.key === "ArrowUp" && !e.shiftKey) || (e.key === "k" && !e.shiftKey)) {
        e.preventDefault();
        if (currentIdx > 0) {
          setSelectedTaskId(todoTasks[currentIdx - 1].id);
          clearBulkSelect();
        } else {
          setSelectedTaskId(null);
          clearBulkSelect();
          focusInput();
        }
        return;
      }

      // Shift+j: 複数選択（下方向）
      if (e.key === "J" || (e.key === "j" && e.shiftKey) || (e.key === "ArrowDown" && e.shiftKey)) {
        e.preventDefault();
        if (!bulkSelected.has(selectedTaskId)) toggleBulkSelect(selectedTaskId);
        if (currentIdx < todoTasks.length - 1) {
          const nextId = todoTasks[currentIdx + 1].id;
          setSelectedTaskId(nextId);
          if (!bulkSelected.has(nextId)) toggleBulkSelect(nextId);
        }
        return;
      }

      // Shift+k: 複数選択（上方向）
      if (e.key === "K" || (e.key === "k" && e.shiftKey) || (e.key === "ArrowUp" && e.shiftKey)) {
        e.preventDefault();
        if (!bulkSelected.has(selectedTaskId)) toggleBulkSelect(selectedTaskId);
        if (currentIdx > 0) {
          const prevId = todoTasks[currentIdx - 1].id;
          setSelectedTaskId(prevId);
          if (!bulkSelected.has(prevId)) toggleBulkSelect(prevId);
        }
        return;
      }

      // Enter: タイマーセットアップ起動
      if (e.key === "Enter" && selectedTaskId) {
        e.preventDefault();
        setFocusedTaskId(selectedTaskId);
        setFocusPhase("setup");
        return;
      }

      // Space: 並び替えモード
      if (e.key === " ") {
        e.preventDefault();
        setIsReorderMode(true);
        return;
      }

      // Tab: 小タスク化 / Shift+Tab: インデント解除
      if (e.key === "Tab") {
        e.preventDefault();
        const selected = tasks.find((t) => t.id === selectedTaskId);
        if (!selected) return;

        if (e.shiftKey) {
          // Shift+Tab: インデント解除
          if (!selected.parentId) { triggerVibration(selectedTaskId); return; }
          const parent = tasks.find((t) => t.id === selected.parentId);
          const newParentId = parent?.parentId;
          const updated = tasks.map((t) =>
            t.id === selectedTaskId ? { ...t, parentId: newParentId } : t,
          );
          const dfsIds = buildDfsOrder(updated.filter((t) => t.status === "todo")).map((t) => t.id);
          setTaskParent(selectedTaskId, newParentId, dfsIds);
        } else {
          // Tab: 小タスク化
          const flatList = grouping
            ? todoTasks.filter((t) => (t.projectName ?? null) === (selected.projectName ?? null))
            : todoTasks;
          const idx = flatList.findIndex((t) => t.id === selectedTaskId);
          if (idx <= 0) { triggerVibration(selectedTaskId); return; }
          const above = flatList[idx - 1];
          if ((above.projectName ?? null) !== (selected.projectName ?? null)) {
            triggerVibration(selectedTaskId); return;
          }

          // effective parent を決定：
          //   above が同 depth → above が親（1段深くなる）
          //   above が深い    → above の先祖をたどり selected と同 depth のものを親にする
          //   above が浅い    → above を親（above.depth+1 になる）
          const selectedDepth = getDepth(selected, tasks);
          const aboveDepth = getDepth(above, tasks);
          let effectiveParent: typeof above = above;
          if (aboveDepth > selectedDepth) {
            let cur = above;
            while (getDepth(cur, tasks) > selectedDepth) {
              const p = tasks.find((tt) => tt.id === cur.parentId);
              if (!p) { triggerVibration(selectedTaskId); return; }
              cur = p;
            }
            effectiveParent = cur;
          }

          if (selected.parentId === effectiveParent.id) { triggerVibration(selectedTaskId); return; }
          if (getDepth(effectiveParent, tasks) + 1 >= 5) { triggerVibration(selectedTaskId); setToast(t(lang, "maxDepthReached")); return; }

          const updated = tasks.map((tt) =>
            tt.id === selectedTaskId ? { ...tt, parentId: effectiveParent.id } : tt,
          );
          const dfsIds = buildDfsOrder(updated.filter((tt) => tt.status === "todo")).map((tt) => tt.id);
          setTaskParent(selectedTaskId, effectiveParent.id, dfsIds);
        }
        return;
      }

      // x: 完了トグル
      if (e.key === "x") {
        e.preventDefault();
        if (bulkSelected.size > 0) {
          const allLocked = [...bulkSelected].some((id) => hasUndoneDescendants(id, tasks));
          if (allLocked) { setToast(t(lang, "childrenPending")); return; }
          bulkSelected.forEach((id) => toggleTask(id));
          clearBulkSelect();
        } else {
          if (hasUndoneDescendants(selectedTaskId, tasks)) {
            setToast(t(lang, "childrenPending")); return;
          }
          toggleTask(selectedTaskId);
          // 完了後の選択移動：上 → 下 → 入力欄
          if (currentIdx > 0) {
            setSelectedTaskId(todoTasks[currentIdx - 1].id);
          } else if (currentIdx < todoTasks.length - 1) {
            setSelectedTaskId(todoTasks[currentIdx + 1].id);
          } else {
            setSelectedTaskId(null);
            focusInput();
          }
        }
        return;
      }

      // m: 最低限タスクトグル
      if (e.key === "m") {
        e.preventDefault();
        const targets = bulkSelected.size > 0 ? [...bulkSelected] : [selectedTaskId];
        const allMin = targets.every((id) => tasks.find((t) => t.id === id)?.isMinimum);
        targets.forEach((id) => updateTask(id, { isMinimum: !allMin }));
        if (bulkSelected.size > 0) clearBulkSelect();
        return;
      }

      // p: 確認待ちトグル
      if (e.key === "p") {
        e.preventDefault();
        const targets = bulkSelected.size > 0 ? [...bulkSelected] : [selectedTaskId];
        const allPending = targets.every((id) => tasks.find((t) => t.id === id)?.isPending);
        targets.forEach((id) => updateTask(id, { isPending: !allPending }));
        if (bulkSelected.size > 0) clearBulkSelect();
        return;
      }

      // Delete / Backspace: タスク削除
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (bulkSelected.size > 0) {
          bulkSelected.forEach((id) => deleteTask(id));
          clearBulkSelect();
          setSelectedTaskId(null);
        } else {
          deleteTask(selectedTaskId);
          // 削除後の選択位置を調整
          if (currentIdx < todoTasks.length - 1) {
            setSelectedTaskId(todoTasks[currentIdx + 1].id);
          } else if (currentIdx > 0) {
            setSelectedTaskId(todoTasks[currentIdx - 1].id);
          } else {
            setSelectedTaskId(null);
          }
        }
        return;
      }
    },
    [
      selectedTaskId,
      focusedTaskId,
      isReorderMode,
      bulkSelected,
      todoTasks,
      tasks,
      lang,
      undo,
      setToast,
      setSelectedTaskId,
      setFocusedTaskId,
      setIsReorderMode,
      toggleBulkSelect,
      clearBulkSelect,
      toggleTask,
      deleteTask,
      updateTask,
      reorderTasks,
      focusInput,
      focusPhase,
      focusMinutes,
      focusTimeLeft,
      startFocus,
      cancelFocusSetup,
      setFocusEndMode,
      setFocusElapsed,
      setShowFocusEnd,
      setFocusPhase,
      searchMode,
      setSearchMode,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  if (!loaded) {
    return (
      <div className="h-full flex items-center justify-center text-subink text-[12px]">
        {t(lang, "loading")}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-appbg relative">
      <Header onOpenSettings={() => setShowSettings(true)} />
      {updateInfo && (
        <div className="px-4 py-2 flex items-center justify-between gap-3 bg-blue-50/80 dark:bg-blue-950/30 border-b border-blue-200/60 dark:border-blue-800/40 text-[12px]">
          <span className="text-blue-700 dark:text-blue-300">
            {lang === "ja"
              ? `v${updateInfo.version} が利用可能です`
              : `v${updateInfo.version} is available`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openUrl(updateInfo.releaseUrl)}
              className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium transition-colors"
            >
              {lang === "ja" ? "アップデート" : "Update"}
            </button>
            <button
              onClick={() => setUpdateInfo(null)}
              className="text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300"
              aria-label="dismiss"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      )}
      <TaskInput />
      <div className="px-3 py-2 flex items-center justify-between text-[11px] text-subink">
        <div className="flex items-center gap-3">
          <button
            onClick={() => updateSettings({ groupingEnabled: !grouping })}
            className="flex items-center gap-1.5 cursor-pointer select-none"
          >
            <span className={`w-3.5 h-3.5 rounded-[2px] border transition-all flex-shrink-0 ${
              grouping
                ? "bg-[#1C1C1E] border-[#1C1C1E] dark:bg-[#E0E0E0] dark:border-[#E0E0E0]"
                : "border-black/30 dark:border-white/30"
            }`} />
            {t(lang, "grouping")}
          </button>
          {tagsEnabled && tags.length > 0 && (
            <button
              onClick={() => {
                setTagFilterEnabled((v) => {
                  if (v) setTagFilterIds(new Set());
                  return !v;
                });
              }}
              className="flex items-center gap-1.5 cursor-pointer select-none"
            >
              <span className={`w-3.5 h-3.5 rounded-[2px] border transition-all flex-shrink-0 ${
                tagFilterEnabled
                  ? "bg-[#1C1C1E] border-[#1C1C1E] dark:bg-[#E0E0E0] dark:border-[#E0E0E0]"
                  : "border-black/30 dark:border-white/30"
              }`} />
              {t(lang, "tagFilter")}
            </button>
          )}
          {tagFilterEnabled && tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {tags.map((tag) => {
                const active = tagFilterIds.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => {
                      setTagFilterIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(tag.id)) next.delete(tag.id);
                        else next.add(tag.id);
                        return next;
                      });
                    }}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] transition-all ${
                      active
                        ? "bg-[#1C1C1E] text-white dark:bg-[#E0E0E0] dark:text-[#111]"
                        : "bg-black/8 text-subink dark:bg-white/10 hover:bg-black/15 dark:hover:bg-white/15"
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tag.color }} />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {isReorderMode && (
          <span className="text-accent text-[11px] font-medium animate-pulse">
            ↕ {lang === "ja" ? "並び替えモード" : "Reorder mode"}
          </span>
        )}
        {focusedTaskId && focusPhase === "running" && (
          <span className="text-accent text-[11px] font-medium flex items-center gap-1.5">
            {t(lang, "focusMode")}
            <span className="font-mono opacity-70">
              {String(Math.floor(focusTimeLeft / 60)).padStart(2, "0")}:{String(focusTimeLeft % 60).padStart(2, "0")}
            </span>
          </span>
        )}
      </div>
      <main className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3">
        <TaskList
          tagFilter={tagFilterEnabled && tagFilterIds.size > 0 ? tagFilterIds : undefined}
          searchKeywords={searchKeywords}
        />
        {!focusedTaskId && <CompletedSection />}
      </main>
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {focusPhase === "setup" && (
        <FocusTimerSetup
          minutes={focusMinutes}
          lang={lang}
          onChangeMinutes={setFocusMinutes}
          onStart={startFocus}
          onCancel={cancelFocusSetup}
        />
      )}
      {showFocusEnd && (
        <FocusEndModal
          mode={focusEndMode}
          elapsedSeconds={focusElapsed}
          lang={lang}
          onExtend={extendFocus}
          onFinish={endFocus}
          onContinue={() => setShowFocusEnd(false)}
        />
      )}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 glass rounded-lg shadow-cardHover px-4 py-2 text-[12px] text-danger fade-in">
          {toast}
        </div>
      )}
      {showCloseConfirm && (
        <CloseConfirmModal
          remainingCount={tasks.filter((t) => t.status === "todo" && t.isMinimum).length}
          lang={lang}
          onClose={async () => { await getCurrentWindow().close(); }}
          onCancel={() => setShowCloseConfirm(false)}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <UiProvider>
      <AppInner />
    </UiProvider>
  );
}

export default App;
