import { createContext, useContext, useRef, useState } from "react";

interface UiContextValue {
  selectedTaskId: string | null;
  focusedTaskId: string | null;
  isReorderMode: boolean;
  bulkSelected: Set<string>;
  setSelectedTaskId: (id: string | null) => void;
  setFocusedTaskId: (id: string | null) => void;
  setIsReorderMode: (v: boolean) => void;
  toggleBulkSelect: (id: string) => void;
  clearBulkSelect: () => void;
  mainInputRef: React.RefObject<HTMLInputElement | null>;
}

const UiContext = createContext<UiContextValue | null>(null);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const mainInputRef = useRef<HTMLInputElement | null>(null);

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
        setSelectedTaskId,
        setFocusedTaskId,
        setIsReorderMode,
        toggleBulkSelect,
        clearBulkSelect,
        mainInputRef,
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
