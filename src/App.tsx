import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "./components/Header";
import { TaskInput } from "./components/TaskInput";
import { TaskList } from "./components/TaskList";
import { CompletedSection } from "./components/CompletedSection";
import { SettingsModal } from "./components/SettingsModal";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { UiProvider, useUiContext } from "./context/UiContext";
import { useStore } from "./store";
import { t } from "./i18n";

function AppInner() {
  const init = useStore((s) => s.init);
  const loaded = useStore((s) => s.loaded);
  const grouping = useStore((s) => s.settings.groupingEnabled);
  const lang = useStore((s) => s.settings.language);
  const updateSettings = useStore((s) => s.updateSettings);
  const toast = useStore((s) => s.toast);
  const setToast = useStore((s) => s.setToast);
  const tasks = useStore((s) => s.tasks);
  const toggleTask = useStore((s) => s.toggleTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const updateTask = useStore((s) => s.updateTask);
  const reorderTasks = useStore((s) => s.reorderTasks);
  const undo = useStore((s) => s.undo);

  const [showSettings, setShowSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const {
    selectedTaskId,
    focusedTaskId,
    isReorderMode,
    bulkSelected,
    setSelectedTaskId,
    setFocusedTaskId,
    setIsReorderMode,
    toggleBulkSelect,
    clearBulkSelect,
    mainInputRef,
  } = useUiContext();

  const todoTasks = useMemo(
    () => tasks.filter((t) => t.status === "todo").sort((a, b) => a.order - b.order),
    [tasks],
  );

  useEffect(() => {
    init();
  }, [init]);

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

      // ? はどこでも有効（入力欄以外）
      if (!isInput && e.key === "?") {
        e.preventDefault();
        setShowShortcuts((v) => !v);
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
      if (e.key === "ArrowDown" || (e.key === "j" && !e.shiftKey)) {
        e.preventDefault();
        if (currentIdx < todoTasks.length - 1) {
          setSelectedTaskId(todoTasks[currentIdx + 1].id);
          clearBulkSelect();
        }
        return;
      }

      // k / ArrowUp: 前のタスク
      if (e.key === "ArrowUp" || (e.key === "k" && !e.shiftKey)) {
        e.preventDefault();
        if (currentIdx > 0) {
          setSelectedTaskId(todoTasks[currentIdx - 1].id);
          clearBulkSelect();
        }
        return;
      }

      // Shift+j: 複数選択（下方向）
      if (e.key === "J" || (e.key === "j" && e.shiftKey) || (e.key === "ArrowDown" && e.shiftKey)) {
        e.preventDefault();
        toggleBulkSelect(selectedTaskId);
        if (currentIdx < todoTasks.length - 1) {
          const nextId = todoTasks[currentIdx + 1].id;
          setSelectedTaskId(nextId);
          toggleBulkSelect(nextId);
        }
        return;
      }

      // Shift+k: 複数選択（上方向）
      if (e.key === "K" || (e.key === "k" && e.shiftKey) || (e.key === "ArrowUp" && e.shiftKey)) {
        e.preventDefault();
        toggleBulkSelect(selectedTaskId);
        if (currentIdx > 0) {
          const prevId = todoTasks[currentIdx - 1].id;
          setSelectedTaskId(prevId);
          toggleBulkSelect(prevId);
        }
        return;
      }

      // Enter: フォーカスモードON/OFF
      if (e.key === "Enter") {
        e.preventDefault();
        if (focusedTaskId === selectedTaskId) {
          setFocusedTaskId(null);
        } else {
          setFocusedTaskId(selectedTaskId);
        }
        return;
      }

      // Space: 並び替えモード
      if (e.key === " ") {
        e.preventDefault();
        setIsReorderMode(true);
        return;
      }

      // x: 完了トグル
      if (e.key === "x") {
        e.preventDefault();
        if (bulkSelected.size > 0) {
          bulkSelected.forEach((id) => toggleTask(id));
          clearBulkSelect();
        } else {
          toggleTask(selectedTaskId);
        }
        return;
      }

      // m: 最低限タスクトグル
      if (e.key === "m") {
        e.preventDefault();
        const targets = bulkSelected.size > 0 ? [...bulkSelected] : [selectedTaskId];
        // 全てがisMinimumならfalseに、そうでなければtrueに
        const allMin = targets.every((id) => tasks.find((t) => t.id === id)?.isMinimum);
        targets.forEach((id) => updateTask(id, { isMinimum: !allMin }));
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
      {/* フォーカスモード中のオーバーレイ（ヘッダー/入力欄をdimに） */}
      {focusedTaskId && (
        <div
          className="absolute inset-0 bg-appbg/60 z-10 pointer-events-none"
          style={{ bottom: "auto", height: "calc(100% - 160px)" }}
        />
      )}

      <Header onOpenSettings={() => setShowSettings(true)} />
      <TaskInput />
      <div className="px-3 py-2 flex items-center justify-between text-[11px] text-subink">
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
        {isReorderMode && (
          <span className="text-accent text-[11px] font-medium animate-pulse">
            ↕ {lang === "ja" ? "並び替えモード" : "Reorder mode"}
          </span>
        )}
        {focusedTaskId && (
          <span className="text-accent text-[11px] font-medium">
            {t(lang, "focusMode")}
          </span>
        )}
      </div>
      <main className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3">
        <TaskList />
        {!focusedTaskId && <CompletedSection />}
      </main>
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 glass rounded-lg shadow-cardHover px-4 py-2 text-[12px] text-danger fade-in">
          {toast}
        </div>
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
