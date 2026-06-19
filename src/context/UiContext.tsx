import { createContext, useContext, useRef, useState } from "react";

export type FocusPhase = "idle" | "setup" | "running";

interface UiContextValue {
  selectedTaskId: string | null;
  focusedTaskId: string | null;
  isReorderMode: boolean;
  bulkSelected: Set<string>;
  focusPhase: FocusPhase;
  focusMinutes: number;
  setSelectedTaskId: (id: string | null) => void;
  setFocusedTaskId: (id: string | null) => void;
  setIsReorderMode: (v: boolean) => void;
  toggleBulkSelect: (id: string) => void;
  clearBulkSelect: () => void;
  setFocusPhase: (p: FocusPhase) => void;
  setFocusMinutes: React.Dispatch<React.SetStateAction<number>>;
  mainInputRef: React.RefObject<HTMLInputElement | null>;
  vibratingTaskId: string | null;
  triggerVibration: (id: string) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [focusPhase, setFocusPhase] = useState<FocusPhase>("idle");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const mainInputRef = useRef<HTMLInputElement | null>(null);
  const [vibratingTaskId, setVibratingTaskId] = useState<string | null>(null);
  const vibrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function triggerVibration(id: string) {
    if (vibrateTimerRef.current) clearTimeout(vibrateTimerRef.current);
    setVibratingTaskId(id);
    vibrateTimerRef.current = setTimeout(() => setVibratingTaskId(null), 400);
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
        setSelectedTaskId,
        setFocusedTaskId,
        setIsReorderMode,
        toggleBulkSelect,
        clearBulkSelect,
        setFocusPhase,
        setFocusMinutes,
        mainInputRef,
        vibratingTaskId,
        triggerVibration,
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
