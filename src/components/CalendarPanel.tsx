import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { useUiContext } from "../context/UiContext";
import { t } from "../i18n";
import { dateToIso, DAY_NAMES_JA, DAY_NAMES_EN_SHORT } from "../utils/parseDate";

type ViewMode = "month" | "week";

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function CalendarPanel() {
  const tasks = useStore((s) => s.tasks);
  const addTask = useStore((s) => s.addTask);
  const toggleTask = useStore((s) => s.toggleTask);
  const lang = useStore((s) => s.settings.language);
  const { setSelectedTaskId } = useUiContext();

  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [weekdaysOnly, setWeekdaysOnly] = useState(false);
  const [creatingIso, setCreatingIso] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    if (creatingIso) inputRef.current?.focus();
  }, [creatingIso]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, typeof tasks>();
    for (const task of tasks) {
      if (!task.dueDate) continue;
      const list = map.get(task.dueDate) ?? [];
      list.push(task);
      map.set(task.dueDate, list);
    }
    return map;
  }, [tasks]);

  const dayNames =
    lang === "ja"
      ? DAY_NAMES_JA
      : DAY_NAMES_EN_SHORT.map((d) => d[0].toUpperCase() + d.slice(1));
  const visibleDayIndexes = weekdaysOnly ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];

  const weeks = useMemo(() => {
    if (viewMode === "week") {
      return [Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchorDate), i))];
    }
    const monthStart = startOfMonth(anchorDate);
    const monthEnd = endOfMonth(anchorDate);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = addDays(startOfWeek(monthEnd), 6);
    const days: Date[] = [];
    for (let cur = gridStart; cur <= gridEnd; cur = addDays(cur, 1)) {
      days.push(cur);
    }
    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return rows;
  }, [viewMode, anchorDate]);

  function goPrev() {
    setAnchorDate((d) => (viewMode === "month" ? addMonths(d, -1) : addDays(d, -7)));
  }
  function goNext() {
    setAnchorDate((d) => (viewMode === "month" ? addMonths(d, 1) : addDays(d, 7)));
  }
  function goToday() {
    setAnchorDate(new Date());
  }

  function submitDraft(iso: string) {
    if (!draft.trim()) return;
    const id = addTask(draft, iso);
    if (id) setSelectedTaskId(id);
    setDraft("");
    inputRef.current?.focus();
  }

  const headerLabel =
    viewMode === "month"
      ? lang === "ja"
        ? `${anchorDate.getFullYear()}年${anchorDate.getMonth() + 1}月`
        : anchorDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : (() => {
          const s = startOfWeek(anchorDate);
          const e = addDays(s, 6);
          return `${s.getMonth() + 1}/${s.getDate()} - ${e.getMonth() + 1}/${e.getDate()}`;
        })();

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2.5 border-b border-black/5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-medium">{headerLabel}</div>
          <div className="flex items-center gap-1">
            <button onClick={goPrev} className="w-6 h-6 rounded hover:bg-black/5 flex items-center justify-center text-subink">
              ‹
            </button>
            <button onClick={goToday} className="px-2 h-6 rounded hover:bg-black/5 text-[11px] text-subink">
              {t(lang, "calendarToday")}
            </button>
            <button onClick={goNext} className="w-6 h-6 rounded hover:bg-black/5 flex items-center justify-center text-subink">
              ›
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex rounded-md border border-black/10 overflow-hidden">
            {(["month", "week"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-2 py-0.5 text-[11px] transition-all ${
                  viewMode === m ? "bg-black/10 font-medium" : "hover:bg-black/5"
                }`}
              >
                {t(lang, m === "month" ? "calendarViewMonth" : "calendarViewWeek")}
              </button>
            ))}
          </div>
          <button onClick={() => setWeekdaysOnly((v) => !v)} className="flex items-center gap-1.5 cursor-pointer select-none">
            <span
              className={`w-3 h-3 rounded-[2px] border transition-all flex-shrink-0 ${
                weekdaysOnly
                  ? "bg-[#1C1C1E] border-[#1C1C1E] dark:bg-[#E0E0E0] dark:border-[#E0E0E0]"
                  : "border-black/30 dark:border-white/30"
              }`}
            />
            <span className="text-[11px] text-subink">{t(lang, "calendarWeekdaysOnly")}</span>
          </button>
        </div>
      </div>

      <div
        className="grid text-[10px] text-subink text-center px-1 pt-1.5"
        style={{ gridTemplateColumns: `repeat(${visibleDayIndexes.length}, minmax(0, 1fr))` }}
      >
        {visibleDayIndexes.map((i) => (
          <div key={i} className="py-1">
            {dayNames[i]}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-1 pb-2">
        {weeks.map((week, wi) => (
          <div
            key={wi}
            className="grid gap-[2px]"
            style={{ gridTemplateColumns: `repeat(${visibleDayIndexes.length}, minmax(0, 1fr))` }}
          >
            {visibleDayIndexes.map((di) => {
              const day = week[di];
              const iso = dateToIso(day);
              const isCurrentMonth = viewMode === "week" || day.getMonth() === anchorDate.getMonth();
              const isToday = isSameDay(day, today);
              const dayTasks = isToday
                ? [
                    ...(tasksByDate.get(iso) ?? []),
                    ...tasks.filter((tk) => tk.isMinimum && tk.dueDate !== iso),
                  ]
                : tasksByDate.get(iso) ?? [];
              const isCreating = creatingIso === iso;
              const visibleTasks = dayTasks.slice(0, 3);
              const overflow = dayTasks.length - visibleTasks.length;

              return (
                <div
                  key={iso}
                  onClick={() => {
                    if (!isCreating) setCreatingIso(iso);
                  }}
                  className={`min-h-[64px] rounded-md p-1 text-left cursor-text transition-colors ${
                    isCreating ? "bg-accent/10 ring-1 ring-accent/40" : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  } ${isCurrentMonth ? "" : "opacity-40"}`}
                >
                  <div
                    className={`text-[10px] mb-0.5 ${
                      isToday
                        ? "inline-flex items-center justify-center w-4 h-4 rounded-[3px] bg-[#ffffff] text-[#000000] font-semibold"
                        : "text-subink"
                    }`}
                  >
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {visibleTasks.map((task) => (
                      <div key={task.id} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                        <button
                          onClick={() => toggleTask(task.id)}
                          className={`w-2.5 h-2.5 rounded-[2px] border flex items-center justify-center flex-shrink-0 transition-all ${
                            task.status === "done"
                              ? "bg-ink border-ink dark:bg-white/90 dark:border-white/90"
                              : "border-black/30 hover:border-black/60 dark:border-white/30 dark:hover:border-white/60"
                          }`}
                        >
                          {task.status === "done" && (
                            <svg
                              width="6"
                              height="6"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="text-white dark:text-ink"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                        <span className={`text-[9.5px] truncate ${task.status === "done" ? "line-through text-subink/60" : ""}`}>
                          {task.title}
                        </span>
                      </div>
                    ))}
                    {overflow > 0 && <div className="text-[9px] text-subink">+{overflow}</div>}
                    {isCreating && (
                      <input
                        ref={inputRef}
                        autoFocus
                        value={draft}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            submitDraft(iso);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setCreatingIso(null);
                            setDraft("");
                          }
                        }}
                        onBlur={() => {
                          setCreatingIso(null);
                          setDraft("");
                        }}
                        placeholder={t(lang, "calendarAddPlaceholder")}
                        className="w-full text-[9.5px] bg-transparent outline-none border-b border-accent/40 placeholder:text-subink/50"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
