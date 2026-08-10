import { createContext, useContext, useRef, useState } from "react";

export type FocusPhase = "idle" | "setup" | "running";

interface UiContextValue {
  selectedTaskId: string | null;
  focusedTaskId: string | null;
  isReorderMode: boolean;
  bulkSelected: Set<string>;
  focusPhase: FocusPhase;
  focusMinutes: number;
  searchMode: boolean;
  searchQuery: string;
  setSelectedTaskId: (id: string | null) => void;
  setFocusedTaskId: (id: string | null) => void;
  setIsReorderMode: (v: boolean) => void;
  toggleBulkSelect: (id: string) => void;
  clearBulkSelect: () => void;
  setFocusPhase: (p: FocusPhase) => void;
  setFocusMinutes: React.Dispatch<React.SetStateAction<number>>;
  setSearchMode: (v: boolean) => void;
  setSearchQuery: (q: string) => void;
  mainInputRef: React.RefObject<HTMLInputElement | null>;
  vibratingTaskId: string | null;
  triggerVibration: (id: string) => void;
  pendingMainInput: string | null;
  setPendingMainInput: (text: string | null) => void;
  calendarJumpIso: string | null;
  setCalendarJumpIso: (iso: string | null) => void;
  completingTaskIds: Set<string>;
  triggerCompleting: (ids: string[], onDone: () => void) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [focusPhase, setFocusPhase] = useState<FocusPhase>("idle");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const mainInputRef = useRef<HTMLInputElement | null>(null);
  const [vibratingTaskId, setVibratingTaskId] = useState<string | null>(null);
  const vibrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingMainInput, setPendingMainInput] = useState<string | null>(null);
  const [calendarJumpIso, setCalendarJumpIso] = useState<string | null>(null);
  const [completingTaskIds, setCompletingTaskIds] = useState<Set<string>>(new Set());

  function triggerVibration(id: string) {
    if (vibrateTimerRef.current) clearTimeout(vibrateTimerRef.current);
    setVibratingTaskId(id);
    vibrateTimerRef.current = setTimeout(() => setVibratingTaskId(null), 400);
  }

  // TaskItemの「完了スイープ」アニメーションをキーボードショートカット(x、複数選択含む)からも起動する
  function triggerCompleting(ids: string[], onDone: () => void) {
    setCompletingTaskIds(new Set(ids));
    setTimeout(() => {
      setCompletingTaskIds(new Set());
      onDone();
    }, 380);
  }

  function toggleBulkSelect(id: string) {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearBulkSelect() {
    setBulkSelected(new Set());
  }

  return (
    <UiContext.Provider
      value={{
        selectedTaskId,
        focusedTaskId,
        isReorderMode,
        bulkSelected,
        focusPhase,
        focusMinutes,
        searchMode,
        searchQuery,
        setSelectedTaskId,
        setFocusedTaskId,
        setIsReorderMode,
        toggleBulkSelect,
        clearBulkSelect,
        setFocusPhase,
        setFocusMinutes,
        setSearchMode,
        setSearchQuery,
        mainInputRef,
        vibratingTaskId,
        triggerVibration,
        pendingMainInput,
        setPendingMainInput,
        calendarJumpIso,
        setCalendarJumpIso,
        completingTaskIds,
        triggerCompleting,
      }}
    >
      {children}
    </UiContext.Provider>
  );
}

export function useUiContext() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUiContext must be used within UiProvider");
  return ctx;
}
