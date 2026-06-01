import { useStore } from "../store";
import { TagManager } from "./TagManager";
import { t, TKey } from "../i18n";
import { Language, Theme } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
}

type ToggleKey = "copyIncludeUrl" | "groupingEnabled" | "copyGroupingEnabled" | "autoDeleteOldCompleted";

const TOGGLES: Array<{ key: ToggleKey; label: TKey; desc: TKey }> = [
  { key: "copyIncludeUrl", label: "setting_copyIncludeUrl", desc: "setting_copyIncludeUrl_desc" },
  { key: "groupingEnabled", label: "setting_groupingEnabled", desc: "setting_groupingEnabled_desc" },
  { key: "copyGroupingEnabled", label: "setting_copyGroupingEnabled", desc: "setting_copyGroupingEnabled_desc" },
  { key: "autoDeleteOldCompleted", label: "setting_autoDeleteOldCompleted", desc: "setting_autoDeleteOldCompleted_desc" },
];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-9 h-5 rounded-full relative transition-colors ${value ? "bg-ok" : "bg-black/15"}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${value ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-black/5 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-[12px] rounded-md transition-all ${
            value === o.value
              ? "bg-white shadow text-ink"
              : "text-subink hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsModal({ open, onClose }: Props) {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const lang = settings.language;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center pt-10"
      onClick={onClose}
    >
      <div
        className="glass rounded-card shadow-cardHover w-[440px] max-h-[80vh] flex flex-col fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-black/5 flex items-center justify-between">
          <h2 className="font-semibold">{t(lang, "settings")}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded hover:bg-black/5 text-subink flex items-center justify-center"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto scrollbar-thin p-4 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 text-[13px]">{t(lang, "theme")}</div>
              <SegmentedControl<Theme>
                value={settings.theme}
                onChange={(v) => update({ theme: v })}
                options={[
                  { value: "light", label: t(lang, "themeLight") },
                  { value: "dark", label: t(lang, "themeDark") },
                  { value: "system", label: t(lang, "themeSystem") },
                ]}
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-[13px]">{t(lang, "language")}</div>
              <SegmentedControl<Language>
                value={settings.language}
                onChange={(v) => update({ language: v })}
                options={[
                  { value: "ja", label: "日本語" },
                  { value: "en", label: "English" },
                ]}
              />
            </div>
          </div>
          <div className="border-t border-black/5 pt-4 space-y-2">
            {TOGGLES.map((it) => (
              <div key={it.key} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-[13px]">{t(lang, it.label)}</div>
                  <div className="text-[11px] text-subink">{t(lang, it.desc)}</div>
                </div>
                <Toggle
                  value={settings[it.key]}
                  onChange={(v) => update({ [it.key]: v })}
                />
              </div>
            ))}
          </div>
          <div className="border-t border-black/5 pt-4">
            <TagManager />
          </div>
        </div>
      </div>
    </div>
  );
}
