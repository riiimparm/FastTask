import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { TaskInput } from "./components/TaskInput";
import { TaskList } from "./components/TaskList";
import { CompletedSection } from "./components/CompletedSection";
import { SettingsModal } from "./components/SettingsModal";
import { useStore } from "./store";
import { t } from "./i18n";

function App() {
  const init = useStore((s) => s.init);
  const loaded = useStore((s) => s.loaded);
  const grouping = useStore((s) => s.settings.groupingEnabled);
  const lang = useStore((s) => s.settings.language);
  const updateSettings = useStore((s) => s.updateSettings);
  const toast = useStore((s) => s.toast);
  const setToast = useStore((s) => s.setToast);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 3500);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  if (!loaded) {
    return (
      <div className="h-full flex items-center justify-center text-subink text-[12px]">
        {t(lang, "loading")}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-appbg">
      <Header onOpenSettings={() => setShowSettings(true)} />
      <TaskInput />
      <div className="px-3 py-2 flex items-center justify-between text-[11px] text-subink">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={grouping}
            onChange={(e) => updateSettings({ groupingEnabled: e.target.checked })}
            className="accent-accent"
          />
          {t(lang, "grouping")}
        </label>
      </div>
      <main className="flex-1 overflow-y-auto scrollbar-thin px-3 pb-3">
        <TaskList />
        <CompletedSection />
      </main>
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 glass rounded-lg shadow-cardHover px-4 py-2 text-[12px] text-danger fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
